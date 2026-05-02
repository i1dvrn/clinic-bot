const fetch = (...args) =>
  import("node-fetch").then(({ default: fetch }) => fetch(...args));

// =============================================
// المتغيرات البيئية — Netlify Dashboard
// =============================================
const PAGE_ACCESS_TOKEN = process.env.PAGE_ACCESS_TOKEN;
const VERIFY_TOKEN      = process.env.VERIFY_TOKEN;
const GEMINI_API_KEY    = process.env.GEMINI_API_KEY;
const SUPABASE_URL      = process.env.SUPABASE_URL;
const SUPABASE_KEY      = process.env.SUPABASE_ANON_KEY;

// =============================================
// ثوابت الأيام
// =============================================
const DAY_EN_MAP = {
  0: "sunday", 1: "monday", 2: "tuesday", 3: "wednesday",
  4: "thursday", 5: "friday", 6: "saturday",
};

const DAY_EN_TO_AR = {
  sunday: "الأحد", monday: "الاثنين", tuesday: "الثلاثاء",
  wednesday: "الأربعاء", thursday: "الخميس",
  friday: "الجمعة", saturday: "السبت",
};

// =============================================
// ثوابت الذاكرة
// =============================================
const MEMORY_MINUTES = 10;
const MAX_MESSAGES   = 10;

// =============================================
// رسالة الأسئلة خارج النطاق
// =============================================
const OUT_OF_SCOPE_MSG =
  "للاستفسار عن أي معلومات أخرى، يسعدنا خدمتك عبر الاتصال بأحد الأرقام التالية:\n\n" +
  "📞 0928667081\n📞 0922625986\n\n" +
  "🕘 أوقات الرد على المكالمات: من 9:00 صباحاً حتى 7:30 مساءً";

// =============================================
// Handler الرئيسي
// =============================================
exports.handler = async (event) => {
  if (event.httpMethod === "GET") {
    const p = event.queryStringParameters;
    if (p["hub.mode"] === "subscribe" && p["hub.verify_token"] === VERIFY_TOKEN) {
      return { statusCode: 200, body: p["hub.challenge"] };
    }
    return { statusCode: 403, body: "Forbidden" };
  }

  if (event.httpMethod === "POST") {
    try {
      const body = JSON.parse(event.body);
      if (body.object === "page") {
        for (const entry of body.entry) {
          for (const msg of entry.messaging) {
            if (msg.message?.text && !msg.message.is_echo) {
              const senderId    = msg.sender.id;
              const userMessage = msg.message.text.trim();

              console.log(`[رسالة] من ${senderId}: ${userMessage}`);

              const reply = await processMessage(senderId, userMessage);
              await sendMessage(senderId, reply);
            }
          }
        }
      }
      return { statusCode: 200, body: "OK" };
    } catch (err) {
      console.error("[خطأ عام]:", err);
      return { statusCode: 500, body: "Internal Server Error" };
    }
  }
};

// =============================================
// المعالج الرئيسي
// =============================================
async function processMessage(senderId, userMessage) {
  try {
    // جلب البيانات والذاكرة بشكل متوازٍ
    const [context, history] = await Promise.all([
      fetchAllClinicData(),
      getConversation(senderId),
    ]);

    // إضافة رسالة المستخدم للسجل
    history.push({ role: "user", parts: [{ text: userMessage }] });

    // الحصول على رد Gemini مع كامل السجل
    const reply = await getGeminiReply(history, context);

    // إضافة رد البوت للسجل وحفظه
    history.push({ role: "model", parts: [{ text: reply }] });
    await saveConversation(senderId, history);

    return reply;
  } catch (err) {
    console.error("[خطأ processMessage]:", err);
    return OUT_OF_SCOPE_MSG;
  }
}

// =============================================
// جلب كامل البيانات من Supabase
// =============================================
async function fetchAllClinicData() {
  const todayEn = DAY_EN_MAP[new Date().getDay()];
  const todayAr = DAY_EN_TO_AR[todayEn];

  const [doctors, schedules] = await Promise.all([
    sbFetch("doctors?select=id,name,specialty,description&excused=eq.false&order=specialty"),
    sbFetch("schedules?select=*&order=day,row_index"),
  ]);

  const doctorMap = {};
  doctors.forEach((d) => (doctorMap[d.id] = d));

  const byDay = {};
  schedules.forEach((s) => {
    if (!s.clinic_name?.trim()) return;
    if (!byDay[s.day]) byDay[s.day] = [];

    const sessions = [];
    if (s.morning && doctorMap[s.morning]) sessions.push(`صباحاً: ${doctorMap[s.morning].name}`);
    if (s.evening && doctorMap[s.evening]) sessions.push(`مساءً: ${doctorMap[s.evening].name}`);
    if (s.night   && doctorMap[s.night])   sessions.push(`مناوبة: ${doctorMap[s.night].name}`);

    if (sessions.length) {
      byDay[s.day].push(`• ${s.clinic_name}: ${sessions.join(" | ")}`);
    }
  });

  const lines = [
    `🗓️ اليوم الحالي: ${todayAr}`,
    `\n👨‍⚕️ الأطباء المتاحون (${doctors.length} طبيب):`,
    ...doctors.map((d) => `• ${d.name} — ${d.specialty} — ${d.description}`),
  ];

  const dayOrder = ["saturday","sunday","monday","tuesday","wednesday","thursday","friday"];
  lines.push("\n📅 الجداول الأسبوعية الكاملة:");
  dayOrder.forEach((day) => {
    if (byDay[day]?.length) {
      lines.push(`\n[ ${DAY_EN_TO_AR[day]} ]`);
      lines.push(...byDay[day]);
    }
  });

  return lines.join("\n");
}

// =============================================
// Supabase REST helper
// =============================================
async function sbFetch(path) {
  const res = await fetch(`${SUPABASE_URL}/rest/v1/${path}`, {
    headers: {
      apikey: SUPABASE_KEY,
      Authorization: `Bearer ${SUPABASE_KEY}`,
    },
  });
  return res.json();
}

// =============================================
// ذاكرة المحادثة — جلب
// =============================================
async function getConversation(senderId) {
  try {
    const res = await fetch(
      `${SUPABASE_URL}/rest/v1/conversations?sender_id=eq.${senderId}&select=messages,updated_at`,
      {
        headers: {
          apikey: SUPABASE_KEY,
          Authorization: `Bearer ${SUPABASE_KEY}`,
        },
      }
    );

    const data = await res.json();
    if (!data || data.length === 0) return [];

    // تحقق من انتهاء مدة الذاكرة
    const diffMinutes = (new Date() - new Date(data[0].updated_at)) / 60000;
    if (diffMinutes > MEMORY_MINUTES) {
      await deleteConversation(senderId);
      return [];
    }

    return data[0].messages || [];
  } catch (err) {
    console.error("[خطأ getConversation]:", err);
    return [];
  }
}

// =============================================
// ذاكرة المحادثة — حفظ
// =============================================
async function saveConversation(senderId, messages) {
  try {
    await fetch(`${SUPABASE_URL}/rest/v1/conversations`, {
      method: "POST",
      headers: {
        apikey: SUPABASE_KEY,
        Authorization: `Bearer ${SUPABASE_KEY}`,
        "Content-Type": "application/json",
        Prefer: "resolution=merge-duplicates",
      },
      body: JSON.stringify({
        sender_id:  senderId,
        messages:   messages.slice(-MAX_MESSAGES),
        updated_at: new Date().toISOString(),
      }),
    });
  } catch (err) {
    console.error("[خطأ saveConversation]:", err);
  }
}

// =============================================
// ذاكرة المحادثة — حذف
// =============================================
async function deleteConversation(senderId) {
  try {
    await fetch(`${SUPABASE_URL}/rest/v1/conversations?sender_id=eq.${senderId}`, {
      method: "DELETE",
      headers: {
        apikey: SUPABASE_KEY,
        Authorization: `Bearer ${SUPABASE_KEY}`,
      },
    });
  } catch (err) {
    console.error("[خطأ deleteConversation]:", err);
  }
}

// =============================================
// Gemini مع الذاكرة
// =============================================
async function getGeminiReply(history, context) {
  try {
    const systemPrompt = `أنت مساعد ذكي لمستشفى المرج التخصصي. مهمتك الإجابة عن مواعيد الأطباء وجداولهم وتخصصاتهم.

تعليمات صارمة:
1. أجب فقط بناءً على البيانات المقدمة أدناه. لا تخترع أي معلومة.
2. الرد يكون باللغة العربية دائماً، بأسلوب لطيف ومرتب.
3. إذا كان السؤال لا علاقة له بالمستشفى، أجب بهذا النص حرفياً:
"${OUT_OF_SCOPE_MSG}"

━━━━━━━━━━━━━━━━━━━━━━━━━━━
قواعد تواجد الأطباء:
━━━━━━━━━━━━━━━━━━━━━━━━━━━

• إذا سأل "هل الدكتور X موجود الآن؟":
  لا تجزم بنعم أو لا. أجب بهذا الشكل:
  "بخصوص تواجد [اسم الدكتور] الآن، لا أستطيع التأكد من ذلك بشكل دقيق لأن المواعيد قد تتغير.
  📅 جدوله المعتاد: [اذكر أيام وجوده من البيانات]
  📞 للتأكد من تواجده الآن يرجى الاتصال على: 0928667081 أو 0922625986"

• إذا سأل "هل الدكتور X موجود اليوم؟":
  تحقق من الجدول واليوم الحالي ثم أجب:
  - إذا كان اليوم ضمن جدوله: "د. [الاسم] ضمن جدوله المعتاد اليوم ✅، الفترة الصباحية تبدأ من 10:00 صباحاً والمسائية من 5:00 مساءً. للتأكد من حضوره الفعلي اتصل على: 0928667081"
  - إذا لم يكن اليوم في جدوله: "د. [الاسم] لا يعمل عادةً يوم [اليوم]. 📞 للتأكيد اتصل على: 0928667081"

• إذا سأل "متى مواعيد الدكتور X؟":
  أجب مباشرة من الجدول بثقة.

━━━━━━━━━━━━━━━━━━━━━━━━━━━
أوقات الدوام العامة:
━━━━━━━━━━━━━━━━━━━━━━━━━━━
- الفترة الصباحية: الأطباء يتواجدون من الساعة 10:00 صباحاً
- الفترة المسائية: الأطباء يتواجدون من الساعة 5:00 مساءً

━━━━━━━━━━━━━━━━━━━━━━━━━━━
الحجز والتواصل:
━━━━━━━━━━━━━━━━━━━━━━━━━━━
- إذا طلب أي شخص حجز موعد أو سأل عن الحجز، أرسل له هذه الرسالة تحديداً:
  "يمكنك حجز موعدك بسهولة عبر واتساب 📱
  https://wa.me/218928667081"

- أرقام الاستفسار: 📞 0928667081 — 📞 0922625986

━━━━━━━━━━━━━━━━━━━━━━━━━━━
بيانات المستشفى:
━━━━━━━━━━━━━━━━━━━━━━━━━━━
${context}`;

    const res = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${GEMINI_API_KEY}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          contents: history,
          system_instruction: { role: "system", parts: [{ text: systemPrompt }] },
          generationConfig: { temperature: 0.1, maxOutputTokens: 700 },
        }),
      }
    );

    const data = await res.json();
    if (data.candidates?.[0]?.content) {
      return data.candidates[0].content.parts[0].text;
    }
    console.error("[Gemini Error]:", JSON.stringify(data));
    return OUT_OF_SCOPE_MSG;
  } catch (err) {
    console.error("[Gemini Fetch Error]:", err);
    return OUT_OF_SCOPE_MSG;
  }
}

// =============================================
// إرسال الرد لـ Facebook Messenger
// =============================================
async function sendMessage(recipientId, text) {
  try {
    const res = await fetch(
      `https://graph.facebook.com/v19.0/me/messages?access_token=${PAGE_ACCESS_TOKEN}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          recipient: { id: recipientId },
          message:   { text },
        }),
      }
    );
    const data = await res.json();
    if (data.error) console.error("[FB Error]:", data.error);
    else console.log("[تم الإرسال ✅]");
  } catch (err) {
    console.error("[FB Network Error]:", err);
  }
}

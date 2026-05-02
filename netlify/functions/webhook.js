const fetch = (...args) =>
  import("node-fetch").then(({ default: fetch }) => fetch(...args));

// =============================================
// المتغيرات البيئية — Netlify Dashboard
// =============================================
const PAGE_ACCESS_TOKEN = process.env.PAGE_ACCESS_TOKEN;
<<<<<<< HEAD
const VERIFY_TOKEN = process.env.VERIFY_TOKEN;
const GEMINI_API_KEY = process.env.GEMINI_API_KEY;
const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_KEY = process.env.SUPABASE_KEY;

const MEMORY_MINUTES = 10; // مدة الذاكرة
const MAX_MESSAGES = 10;   // أقصى عدد رسائل نحتفظ بها

// ===== معلومات اليوم الحالي =====
function getClinicContext() {
  const days = ["الأحد", "الاثنين", "الثلاثاء", "الأربعاء", "الخميس", "الجمعة", "السبت"];
  const now = new Date();
  const today = days[now.getDay()];
  const libyaHour = (now.getHours() + 2) % 24;

  let timeOfDay = "";
  if (libyaHour >= 10 && libyaHour < 14) {
    timeOfDay = "الفترة الصباحية (الأطباء متواجدون من الساعة 10:00 صباحاً)";
  } else if (libyaHour >= 17 && libyaHour < 23) {
    timeOfDay = "الفترة المسائية (الأطباء متواجدون من الساعة 5:00 مساءً)";
  } else if (libyaHour >= 14 && libyaHour < 17) {
    timeOfDay = "فترة ما بين الدوامين (الدوام المسائي يبدأ الساعة 5:00 مساءً)";
  } else {
    timeOfDay = "خارج أوقات الدوام الرسمية";
  }

  return { today, timeOfDay };
}

// ===== System Prompt =====
function buildSystemPrompt() {
  const { today, timeOfDay } = getClinicContext();

  return `أنت مساعد ذكي ومهذب لمستشفى أو عيادة طبية. مهمتك مساعدة المرضى والزوار بأسلوب لطيف واحترافي باللغة العربية دائماً.

═══════════════════════════════
📅 الوقت الحالي:
اليوم: ${today}
الوقت: ${timeOfDay}
═══════════════════════════════

⏰ أوقات الدوام:
- الفترة الصباحية: من الساعة 10:00 صباحاً
- الفترة المسائية: من الساعة 5:00 مساءً

📞 أرقام الاستفسار:
- 0928667081
- 0922625986

📱 الحجز عبر واتساب:
- 0928667081

═══════════════════════════════
🔴 قواعد مهمة:
═══════════════════════════════

1. تواجد الأطباء:
   - "موجود الآن؟" ← لا تجزم، حوّل للاتصال على 0928667081
   - "موجود اليوم؟" ← استخدم اليوم الحالي (${today}) وأوقات الدوام + حوّل للتأكيد
   - "مواعيد الدكتور؟" ← أجب من الجدول المعتاد

2. الحجز:
   - عند أي طلب حجز أرسل:
     "يمكنك حجز موعدك عبر واتساب 📱
      https://wa.me/218928667081"

3. الأسعار:
   - أعطِ سعراً تقريبياً إن عرفته + "للتأكيد تواصل على 0928667081"

4. عام:
   - لا تقدم تشخيصاً طبياً أبداً
   - ردود مختصرة وواضحة
   - استخدم الإيموجي باعتدال`;
}

// ===== Supabase — جلب المحادثة =====
async function getConversation(senderId) {
  try {
    const response = await fetch(
      `${SUPABASE_URL}/rest/v1/conversations?sender_id=eq.${senderId}&select=messages,updated_at`,
      {
        headers: {
          apikey: SUPABASE_KEY,
          Authorization: `Bearer ${SUPABASE_KEY}`,
        },
      }
    );

    const data = await response.json();

    if (!data || data.length === 0) return [];

    const record = data[0];
    const updatedAt = new Date(record.updated_at);
    const now = new Date();
    const diffMinutes = (now - updatedAt) / (1000 * 60);

    // إذا مضت أكثر من 10 دقائق امسح الذاكرة
    if (diffMinutes > MEMORY_MINUTES) {
      await deleteConversation(senderId);
      return [];
    }

    return record.messages || [];
  } catch (error) {
    console.error("❌ getConversation error:", error);
    return [];
  }
}

// ===== Supabase — حفظ المحادثة =====
async function saveConversation(senderId, messages) {
  try {
    // احتفظ بآخر MAX_MESSAGES رسائل فقط
    const trimmed = messages.slice(-MAX_MESSAGES);

    await fetch(`${SUPABASE_URL}/rest/v1/conversations`, {
      method: "POST",
      headers: {
        apikey: SUPABASE_KEY,
        Authorization: `Bearer ${SUPABASE_KEY}`,
        "Content-Type": "application/json",
        Prefer: "resolution=merge-duplicates",
      },
      body: JSON.stringify({
        sender_id: senderId,
        messages: trimmed,
        updated_at: new Date().toISOString(),
      }),
    });
  } catch (error) {
    console.error("❌ saveConversation error:", error);
  }
}

// ===== Supabase — حذف المحادثة =====
async function deleteConversation(senderId) {
  try {
    await fetch(
      `${SUPABASE_URL}/rest/v1/conversations?sender_id=eq.${senderId}`,
      {
        method: "DELETE",
        headers: {
          apikey: SUPABASE_KEY,
          Authorization: `Bearer ${SUPABASE_KEY}`,
        },
      }
    );
  } catch (error) {
    console.error("❌ deleteConversation error:", error);
  }
}
=======
const VERIFY_TOKEN      = process.env.VERIFY_TOKEN;
const GEMINI_API_KEY    = process.env.GEMINI_API_KEY;
const SUPABASE_URL      = process.env.SUPABASE_URL;
const SUPABASE_KEY      = process.env.SUPABASE_ANON_KEY;
>>>>>>> 3a3d88f2a54d43dabc53925d6844147867eb23a0

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

// رسالة الأسئلة خارج النطاق
const OUT_OF_SCOPE_MSG =
  "للاستفسار عن أي معلومات أخرى، يسعدنا خدمتك عبر الاتصال بأحد الأرقام التالية:\n\n" +
  "📞 0928667081\n📞 0922625986\n\n" +
  "🕘 أوقات الرد على المكالمات: من 9:00 صباحاً حتى 7:30 مساءً";

// =============================================
// Handler الرئيسي
// =============================================
exports.handler = async (event) => {
  // التحقق من الـ Webhook
  if (event.httpMethod === "GET") {
<<<<<<< HEAD
    const params = event.queryStringParameters;
    if (
      params["hub.mode"] === "subscribe" &&
      params["hub.verify_token"] === VERIFY_TOKEN
    ) {
      console.log("✅ Webhook verified");
      return { statusCode: 200, body: params["hub.challenge"] };
=======
    const p = event.queryStringParameters;
    if (p["hub.mode"] === "subscribe" && p["hub.verify_token"] === VERIFY_TOKEN) {
      return { statusCode: 200, body: p["hub.challenge"] };
>>>>>>> 3a3d88f2a54d43dabc53925d6844147867eb23a0
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

<<<<<<< HEAD
              console.log(`📩 [${senderId}]: ${userMessage}`);

              // جلب سجل المحادثة
              const history = await getConversation(senderId);

              // إضافة رسالة المستخدم للسجل
              history.push({ role: "user", parts: [{ text: userMessage }] });

              // الحصول على رد Gemini
              const reply = await getGeminiReply(history);

              // إضافة رد البوت للسجل
              history.push({ role: "model", parts: [{ text: reply }] });

              // حفظ المحادثة المحدثة
              await saveConversation(senderId, history);

              // إرسال الرد
=======
              console.log(`[رسالة] من ${senderId}: ${userMessage}`);

              const reply = await processMessage(userMessage);
>>>>>>> 3a3d88f2a54d43dabc53925d6844147867eb23a0
              await sendMessage(senderId, reply);
            }
          }
        }
      }
      return { statusCode: 200, body: "OK" };
<<<<<<< HEAD
    } catch (error) {
      console.error("❌ Handler error:", error);
      return { statusCode: 200, body: "OK" };
=======
    } catch (err) {
      console.error("[خطأ عام]:", err);
      return { statusCode: 500, body: "Internal Server Error" };
>>>>>>> 3a3d88f2a54d43dabc53925d6844147867eb23a0
    }
  }
};

<<<<<<< HEAD
// ===== Gemini AI مع الذاكرة =====
async function getGeminiReply(history) {
=======
// =============================================
// المعالج الرئيسي
// =============================================
async function processMessage(userMessage) {
>>>>>>> 3a3d88f2a54d43dabc53925d6844147867eb23a0
  try {
    // جلب كل البيانات من Supabase
    const context = await fetchAllClinicData();

    // تمريرها لـ Gemini مع سؤال المستخدم
    return await getGeminiReply(userMessage, context);
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

  // جلب الأطباء والجداول بشكل متوازٍ
  const [doctors, schedules] = await Promise.all([
    sbFetch("doctors?select=id,name,specialty,description&excused=eq.false&order=specialty"),
    sbFetch("schedules?select=*&order=day,row_index"),
  ]);

  // بناء خريطة الأطباء للربط السريع
  const doctorMap = {};
  doctors.forEach((d) => (doctorMap[d.id] = d));

  // بناء الجداول مرتبة حسب الأيام
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

  // بناء نص السياق الكامل
  const lines = [
    `🗓️ اليوم: ${todayAr}`,
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
// Gemini
// =============================================
async function getGeminiReply(userMessage, context) {
  try {
    const systemPrompt = `أنت مساعد ذكي لمستشفى المرج التخصصي. مهمتك الإجابة عن مواعيد الأطباء وجداولهم وتخصصاتهم.

تعليمات صارمة:
1. أجب فقط بناءً على البيانات المقدمة أدناه. لا تخترع أي معلومة.
2. الرد يكون باللغة العربية دائماً، بأسلوب لطيف ومرتب.
3. إذا كان السؤال لا علاقة له بالأطباء أو الجداول أو تخصصات المستشفى، أجب بهذا النص حرفياً بدون أي إضافة:
"${OUT_OF_SCOPE_MSG}"

بيانات المستشفى:
${context}`;

    const res = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${GEMINI_API_KEY}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
<<<<<<< HEAD
          system_instruction: {
            parts: [{ text: buildSystemPrompt() }],
          },
          contents: history, // كل سجل المحادثة
          generationConfig: {
            maxOutputTokens: 350,
            temperature: 0.5,
          },
=======
          contents: [{ role: "user", parts: [{ text: userMessage }] }],
          system_instruction: { role: "system", parts: [{ text: systemPrompt }] },
          generationConfig: { temperature: 0.1, maxOutputTokens: 700 },
>>>>>>> 3a3d88f2a54d43dabc53925d6844147867eb23a0
        }),
      }
    );

    const data = await res.json();
    if (data.candidates?.[0]?.content) {
      return data.candidates[0].content.parts[0].text;
    }
<<<<<<< HEAD

    return "عذراً، حدث خطأ مؤقت. يرجى التواصل معنا على 📞 0928667081";
  } catch (error) {
    console.error("❌ Gemini error:", error);
    return "عذراً، حدث خطأ مؤقت. يرجى التواصل معنا على 📞 0928667081";
=======
    console.error("[Gemini Error]:", JSON.stringify(data));
    return OUT_OF_SCOPE_MSG;
  } catch (err) {
    console.error("[Gemini Fetch Error]:", err);
    return OUT_OF_SCOPE_MSG;
>>>>>>> 3a3d88f2a54d43dabc53925d6844147867eb23a0
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
          message: { text },
        }),
      }
    );
<<<<<<< HEAD

    const data = await response.json();
    if (data.error) {
      console.error("❌ Messenger error:", data.error);
    } else {
      console.log("✅ Message sent to", recipientId);
    }
  } catch (error) {
    console.error("❌ Send error:", error);
=======
    const data = await res.json();
    if (data.error) console.error("[FB Error]:", data.error);
    else console.log("[تم الإرسال ✅]");
  } catch (err) {
    console.error("[FB Network Error]:", err);
>>>>>>> 3a3d88f2a54d43dabc53925d6844147867eb23a0
  }
}

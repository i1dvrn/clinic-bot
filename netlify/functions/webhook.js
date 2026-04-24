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

              const reply = await processMessage(userMessage);
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
async function processMessage(userMessage) {
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
          contents: [{ role: "user", parts: [{ text: userMessage }] }],
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
          message: { text },
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

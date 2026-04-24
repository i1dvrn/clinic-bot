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

const DAY_AR_TO_EN = {
  "الأحد": "sunday",    "الاحد": "sunday",
  "الاثنين": "monday",
  "الثلاثاء": "tuesday", "الثلثاء": "tuesday",
  "الأربعاء": "wednesday", "الاربعاء": "wednesday",
  "الخميس": "thursday",
  "الجمعة": "friday",   "الجمعه": "friday",
  "السبت": "saturday",
};

const DAY_EN_TO_AR = {
  sunday: "الأحد", monday: "الاثنين", tuesday: "الثلاثاء",
  wednesday: "الأربعاء", thursday: "الخميس",
  friday: "الجمعة", saturday: "السبت",
};

const SESSION_AR = {
  morning: "صباحاً", evening: "مساءً", night: "مناوبة ليلية",
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
// المعالج الذكي للرسائل
// =============================================
async function processMessage(userMessage) {
  // 1. تحليل نية المستخدم
  const intent = detectIntent(userMessage);
  console.log(`[نية] النوع: ${intent.type}`, intent);

  // 2. إذا كان السؤال خارج النطاق — رد فوري بدون Gemini
  if (intent.type === "out_of_scope") {
    return OUT_OF_SCOPE_MSG;
  }

  // 3. جلب البيانات المستهدفة فقط من Supabase
  const context = await fetchTargetedData(intent);

  // 4. إذا لم توجد بيانات مطابقة
  if (!context) {
    return OUT_OF_SCOPE_MSG;
  }

  // 5. الرد من Gemini بناءً على البيانات المجلوبة فقط
  return await getGeminiReply(userMessage, context);
}

// =============================================
// كاشف النية الذكي
// =============================================
function detectIntent(msg) {
  const text = msg.toLowerCase();

  // كلمات تدل على الجداول والمواعيد
  const scheduleKeywords = [
    "جدول", "مواعيد", "موعد", "وقت", "دوام", "متى", "يوم",
    "صباح", "مساء", "مناوبة", "ليل", "ليلة",
    "اليوم", "غداً", "غدا", "بكرة",
    ...Object.keys(DAY_AR_TO_EN),
  ];

  // كلمات تدل على الأطباء
  const doctorKeywords = [
    "دكتور", "دكتورة", "د.", "طبيب", "طبيبة",
    "أخصائي", "اخصائي", "استشاري", "من يعمل", "من يكون",
  ];

  // خريطة الكلمات المفتاحية للتخصصات
  const specialtyMap = {
    "عيون":   "عيادة العيون",
    "جلدية":  "عيادة الجلدية",
    "أطفال":  "عيادة الأطفال", "اطفال": "عيادة الأطفال",
    "باطنة":  "عيادة الباطنة",
    "عظام":   "عيادة العظام",
    "نساء":   "نساء وولادة",   "ولادة": "نساء وولادة",
    "قلب":    "عيادة القلب والإيكو",
    "إيكو":   "عيادة القلب والإيكو", "ايكو": "عيادة القلب والإيكو",
    "أذن":    "أذن وأنف وحنجرة", "انف": "أذن وأنف وحنجرة", "حنجرة": "أذن وأنف وحنجرة",
    "جراحة":  "الجراحة العامة",
    "مسالك":  "عيادة المسالك",
    "أشعة":   "الأشعة والتصوير التلفزيوني",
    "مخ":     "باطنة مخ وأعصاب", "أعصاب": "باطنة مخ وأعصاب",
    "نفسية":  "الأمراض النفسية",
  };

  const isScheduleRelated  = scheduleKeywords.some((k) => text.includes(k));
  const isDoctorRelated    = doctorKeywords.some((k) => text.includes(k));
  const isSpecialtyRelated = Object.keys(specialtyMap).some((k) => text.includes(k));

  // تحديد اليوم المذكور
  let targetDay = null;
  for (const [ar, en] of Object.entries(DAY_AR_TO_EN)) {
    if (text.includes(ar)) { targetDay = en; break; }
  }
  if (!targetDay && (text.includes("اليوم") || text.includes("الآن") || text.includes("الان"))) {
    targetDay = DAY_EN_MAP[new Date().getDay()];
  }
  if (!targetDay && (text.includes("غدا") || text.includes("غداً") || text.includes("بكرة"))) {
    targetDay = DAY_EN_MAP[(new Date().getDay() + 1) % 7];
  }

  // تحديد التخصص المذكور
  let targetSpecialty = null;
  for (const [keyword, specialty] of Object.entries(specialtyMap)) {
    if (text.includes(keyword)) { targetSpecialty = specialty; break; }
  }

  // تحديد اسم الطبيب
  let doctorName = null;
  const nameMatch = msg.match(/د\.?\s*([\u0600-\u06FF\s]{3,30})/);
  if (nameMatch) doctorName = nameMatch[1].trim();

  // تصنيف النية
  if (doctorName)                        return { type: "doctor_name", doctorName };
  if (targetSpecialty && targetDay)      return { type: "specialty_and_day", targetSpecialty, targetDay };
  if (targetSpecialty)                   return { type: "specialty", targetSpecialty };
  if (targetDay)                         return { type: "day_schedule", targetDay };
  if (isScheduleRelated || isDoctorRelated || isSpecialtyRelated)
                                         return { type: "general_schedule" };

  return { type: "out_of_scope" };
}

// =============================================
// جلب البيانات المستهدفة فقط من Supabase
// =============================================
async function fetchTargetedData(intent) {
  try {
    switch (intent.type) {

      // سأل عن طبيب بالاسم
      case "doctor_name": {
        const doctors = await sbFetch(
          `doctors?select=id,name,specialty,description&excused=eq.false&name=ilike.*${encodeURIComponent(intent.doctorName)}*`
        );
        if (!doctors.length) return null;

        const doc = doctors[0];
        const schedules = await sbFetch(
          `schedules?select=day,clinic_name,morning,evening,night&or=(morning.eq.${doc.id},evening.eq.${doc.id},night.eq.${doc.id})`
        );
        return buildDoctorContext(doc, schedules);
      }

      // سأل عن تخصص + يوم معاً
      case "specialty_and_day": {
        const keyword = intent.targetSpecialty.split(" ").pop();
        const schedules = await sbFetch(
          `schedules?select=*&day=eq.${intent.targetDay}&clinic_name=ilike.*${encodeURIComponent(keyword)}*&order=row_index`
        );
        const doctorIds = extractDoctorIds(schedules);
        const doctors = doctorIds.length
          ? await sbFetch(`doctors?select=id,name&id=in.(${doctorIds.join(",")})&excused=eq.false`)
          : [];
        return buildScheduleContext(schedules, doctors, DAY_EN_TO_AR[intent.targetDay], intent.targetSpecialty);
      }

      // سأل عن تخصص فقط
      case "specialty": {
        const doctors = await sbFetch(
          `doctors?select=id,name,specialty,description&specialty=ilike.*${encodeURIComponent(intent.targetSpecialty)}*&excused=eq.false`
        );
        if (!doctors.length) return null;

        const ids = doctors.map((d) => `"${d.id}"`);
        const schedules = await sbFetch(
          `schedules?select=*&or=(morning.in.(${ids.join(",")}),evening.in.(${ids.join(",")}),night.in.(${ids.join(",")}))`
        );
        return buildSpecialtyContext(doctors, schedules, intent.targetSpecialty);
      }

      // سأل عن يوم محدد
      case "day_schedule": {
        const schedules = await sbFetch(
          `schedules?select=*&day=eq.${intent.targetDay}&order=row_index`
        );
        const doctorIds = extractDoctorIds(schedules);
        const doctors = doctorIds.length
          ? await sbFetch(`doctors?select=id,name,specialty&id=in.(${doctorIds.join(",")})&excused=eq.false`)
          : [];
        return buildScheduleContext(schedules, doctors, DAY_EN_TO_AR[intent.targetDay], null);
      }

      // سؤال عام — نجلب جدول اليوم الحالي
      case "general_schedule": {
        const todayEn = DAY_EN_MAP[new Date().getDay()];
        const schedules = await sbFetch(
          `schedules?select=*&day=eq.${todayEn}&order=row_index`
        );
        const doctorIds = extractDoctorIds(schedules);
        const doctors = doctorIds.length
          ? await sbFetch(`doctors?select=id,name,specialty&id=in.(${doctorIds.join(",")})&excused=eq.false`)
          : [];
        return buildScheduleContext(schedules, doctors, DAY_EN_TO_AR[todayEn], null);
      }

      default:
        return null;
    }
  } catch (err) {
    console.error("[خطأ Supabase]:", err);
    return null;
  }
}

// =============================================
// بناء السياقات النصية لـ Gemini
// =============================================
function buildDoctorContext(doc, schedules) {
  const lines = [
    `👨‍⚕️ ${doc.name}`,
    `🏥 التخصص: ${doc.specialty}`,
    `📋 ${doc.description}`,
    `\nالجدول الأسبوعي:`,
  ];

  const byDay = {};
  schedules.forEach((s) => {
    if (!byDay[s.day]) byDay[s.day] = [];
    if (s.morning === doc.id) byDay[s.day].push("صباحاً");
    if (s.evening === doc.id) byDay[s.day].push("مساءً");
    if (s.night   === doc.id) byDay[s.day].push("مناوبة ليلية");
  });

  ["saturday","sunday","monday","tuesday","wednesday","thursday","friday"].forEach((day) => {
    if (byDay[day]) lines.push(`• ${DAY_EN_TO_AR[day]}: ${byDay[day].join(" | ")}`);
  });

  return lines.join("\n");
}

function buildScheduleContext(schedules, doctors, dayLabel, specialtyLabel) {
  const doctorMap = {};
  doctors.forEach((d) => (doctorMap[d.id] = d.name));

  const title = specialtyLabel
    ? `📋 جدول ${specialtyLabel} — يوم ${dayLabel}:`
    : `📋 جدول يوم ${dayLabel}:`;

  const lines = [title];

  schedules
    .filter((s) => s.clinic_name?.trim())
    .forEach((s) => {
      const sessions = [];
      if (s.morning && doctorMap[s.morning]) sessions.push(`صباحاً: ${doctorMap[s.morning]}`);
      if (s.evening && doctorMap[s.evening]) sessions.push(`مساءً: ${doctorMap[s.evening]}`);
      if (s.night   && doctorMap[s.night])   sessions.push(`مناوبة: ${doctorMap[s.night]}`);
      if (sessions.length) lines.push(`• ${s.clinic_name}:\n  ${sessions.join("\n  ")}`);
    });

  return lines.length > 1 ? lines.join("\n") : null;
}

function buildSpecialtyContext(doctors, schedules, specialty) {
  const doctorMap = {};
  doctors.forEach((d) => (doctorMap[d.id] = d));

  const lines = [
    `🏥 ${specialty}`,
    `\n👨‍⚕️ الأطباء المتاحون:`,
    ...doctors.map((d) => `• ${d.name} — ${d.description}`),
    `\n📅 الجدول الأسبوعي:`,
  ];

  const byDay = {};
  schedules.forEach((s) => {
    if (!byDay[s.day]) byDay[s.day] = {};
    ["morning", "evening", "night"].forEach((session) => {
      if (s[session] && doctorMap[s[session]]) {
        if (!byDay[s.day][session]) byDay[s.day][session] = [];
        byDay[s.day][session].push(doctorMap[s[session]].name);
      }
    });
  });

  ["saturday","sunday","monday","tuesday","wednesday","thursday","friday"].forEach((day) => {
    if (!byDay[day]) return;
    const sessions = [];
    ["morning","evening","night"].forEach((s) => {
      if (byDay[day][s]) sessions.push(`${SESSION_AR[s]}: ${byDay[day][s].join(", ")}`);
    });
    if (sessions.length) lines.push(`• ${DAY_EN_TO_AR[day]}: ${sessions.join(" | ")}`);
  });

  return lines.join("\n");
}

// =============================================
// مساعدات
// =============================================
function extractDoctorIds(schedules) {
  const ids = new Set();
  schedules.forEach((s) => {
    if (s.morning) ids.add(`"${s.morning}"`);
    if (s.evening) ids.add(`"${s.evening}"`);
    if (s.night)   ids.add(`"${s.night}"`);
  });
  return [...ids];
}

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
// Gemini — يصيغ الرد بشكل لطيف ومرتب
// =============================================
async function getGeminiReply(userMessage, context) {
  try {
    const systemPrompt = `أنت مساعد ذكي لمستشفى المرج التخصصي. مهمتك الوحيدة هي الإجابة عن مواعيد الأطباء وجداولهم.

تعليمات صارمة:
- أجب فقط بناءً على البيانات المقدمة أدناه. لا تخترع أي معلومة.
- الرد يكون باللغة العربية دائماً.
- اجعل الرد واضحاً ومنظماً وسهل القراءة.
- إذا كان السؤال يتعلق بمعلومات غير موجودة في البيانات، أجب بالنص التالي حرفياً:
"${OUT_OF_SCOPE_MSG}"

البيانات المتاحة:
${context}`;

    const res = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${GEMINI_API_KEY}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          contents: [{ role: "user", parts: [{ text: userMessage }] }],
          system_instruction: { role: "system", parts: [{ text: systemPrompt }] },
          generationConfig: { temperature: 0.1, maxOutputTokens: 600 },
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

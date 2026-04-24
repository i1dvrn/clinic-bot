const fetch = (...args) =>
  import("node-fetch").then(({ default: fetch }) => fetch(...args));

const PAGE_ACCESS_TOKEN = process.env.PAGE_ACCESS_TOKEN;
const VERIFY_TOKEN = process.env.VERIFY_TOKEN;
const GEMINI_API_KEY = process.env.GEMINI_API_KEY;

exports.handler = async (event) => {
  // 1. التحقق من Webhook
  if (event.httpMethod === "GET") {
    const params = event.queryStringParameters;
    if (params["hub.mode"] === "subscribe" && params["hub.verify_token"] === VERIFY_TOKEN) {
      return { statusCode: 200, body: params["hub.challenge"] };
    }
    return { statusCode: 403, body: "Forbidden" };
  }

  // 2. استقبال ومعالجة الرسائل
  if (event.httpMethod === "POST") {
    try {
      const body = JSON.parse(event.body);
      if (body.object === "page") {
        for (const entry of body.entry) {
          for (const msg of entry.messaging) {
            if (msg.message && msg.message.text && !msg.message.is_echo) {
              const senderId = msg.sender.id;
              const userMessage = msg.message.text;

              console.log(`[1] استلمت رسالة من ${senderId}: ${userMessage}`);

              // طلب الرد من Gemini
              const reply = await getGeminiReply(userMessage);
              console.log(`[2] رد Gemini الجاهز: ${reply}`);

              // إرسال الرد لمسنجر
              await sendMessage(senderId, reply);
            }
          }
        }
      }
      return { statusCode: 200, body: "OK" };
    } catch (error) {
      console.error("[خطأ في المعالجة]:", error);
      return { statusCode: 500, body: "Internal Server Error" };
    }
  }
};

async function getGeminiReply(userMessage) {
  try {
    // استخدم إصدار v1beta لأنه يدعم نظام التعليمات (system_instruction) بشكل مستقر
    const response = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${GEMINI_API_KEY}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          // تم نقل نظام التعليمات ليكون جزءاً من الطلب بشكل صحيح
          system_instruction: { 
            parts: [{ text: "أنت مساعد ذكي لعيادة مستشفى المرج التخصصي. رد باختصار ولطف باللغة العربية." }] 
          },
          contents: [
            {
              parts: [{ text: userMessage }]
            }
          ]
        }),
      }
    );

    const data = await response.json();

    if (data.candidates && data.candidates[0]) {
      return data.candidates[0].content.parts[0].text;
    } else {
      console.error("خطأ في رد جوجل:", data);
      return "أهلاً بك في مستشفى المرج، كيف يمكنني مساعدتك؟";
    }
  } catch (error) {
    console.error("فشل الاتصال بـ Gemini:", error);
    return "شكراً لتواصلك معنا، سنرد عليك في أقرب وقت.";
  }
}

async function sendMessage(recipientId, text) {
  try {
    console.log(`[جاري إرسال الرد إلى المسنجر لـ ${recipientId}...]`);
    const response = await fetch(
      `https://graph.facebook.com/v19.0/me/messages?access_token=${PAGE_ACCESS_TOKEN}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          recipient: { id: recipientId },
          message: { text: text },
        }),
      }
    );
    const data = await response.json();
    if (data.error) {
      console.error("[Facebook Send Error]:", data.error);
    } else {
      console.log("[تم إرسال الرسالة بنجاح للمسنجر! ✅]");
    }
  } catch (error) {
    console.error("[Network Error while sending to FB]:", error);
  }
}

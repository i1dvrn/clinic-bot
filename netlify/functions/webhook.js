const fetch = (...args) =>
  import("node-fetch").then(({ default: fetch }) => fetch(...args));

const PAGE_ACCESS_TOKEN = process.env.PAGE_ACCESS_TOKEN;
const VERIFY_TOKEN = process.env.VERIFY_TOKEN;
const GEMINI_API_KEY = process.env.GEMINI_API_KEY;

// ===== التحقق من Webhook =====
exports.handler = async (event) => {
  if (event.httpMethod === "GET") {
    const params = event.queryStringParameters;
    if (
      params["hub.mode"] === "subscribe" &&
      params["hub.verify_token"] === VERIFY_TOKEN
    ) {
      console.log("Webhook verified successfully");
      return { statusCode: 200, body: params["hub.challenge"] };
    }
    return { statusCode: 403, body: "Forbidden" };
  }

  // ===== استقبال الرسائل =====
  if (event.httpMethod === "POST") {
    try {
      const body = JSON.parse(event.body);

      if (body.object === "page") {
        for (const entry of body.entry) {
          for (const msg of entry.messaging) {
            if (msg.message && msg.message.text && !msg.message.is_echo) {
              const senderId = msg.sender.id;
              const userMessage = msg.message.text;

              console.log(`Message from ${senderId}: ${userMessage}`);

              const reply = await getGeminiReply(userMessage);
              await sendMessage(senderId, reply);
            }
          }
        }
      }
      return { statusCode: 200, body: "OK" };
    } catch (error) {
      console.error("Error:", error);
      return { statusCode: 200, body: "OK" };
    }
  }

  return { statusCode: 405, body: "Method Not Allowed" };
};

// ===== Gemini AI =====
async function getGeminiReply(userMessage) {
  try {
    const response = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${GEMINI_API_KEY}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          system_instruction: {
            parts: [
              {
                text: `أنت مساعد ذكي لعيادة طبية متخصصة. مهمتك:
- الرد على استفسارات المرضى بلطف واحترافية باللغة العربية دائماً
- تقديم معلومات عن مواعيد العيادة وخدماتها
- مساعدة المرضى في الاستفسار عن الحجز
- الإجابة على الأسئلة الشائعة عن العيادة
- لا تقدم تشخيصاً طبياً أبداً — دائماً انصح بزيارة الطبيب
- إذا كان السؤال خارج نطاق العيادة، اعتذر بلطف وأعد توجيه المحادثة
- الردود تكون مختصرة وواضحة (3-5 جمل كحد أقصى)`,
              },
            ],
          },
          contents: [
            {
              parts: [{ text: userMessage }],
            },
          ],
          generationConfig: {
            maxOutputTokens: 300,
            temperature: 0.7,
          },
        }),
      }
    );

    const data = await response.json();

    if (data.candidates && data.candidates[0]) {
      return data.candidates[0].content.parts[0].text;
    }

    return "عذراً، حدث خطأ في معالجة رسالتك. يرجى المحاولة مرة أخرى أو التواصل معنا مباشرة.";
  } catch (error) {
    console.error("Gemini error:", error);
    return "عذراً، حدث خطأ مؤقت. يرجى المحاولة لاحقاً.";
  }
}

// ===== إرسال الرد لمسنجر =====
async function sendMessage(recipientId, text) {
  try {
    const response = await fetch(
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

    const data = await response.json();
    if (data.error) {
      console.error("Messenger send error:", data.error);
    }
  } catch (error) {
    console.error("Send message error:", error);
  }
}

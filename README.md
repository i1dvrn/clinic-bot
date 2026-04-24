# 🏥 بوت مسنجر عيادة - Gemini AI

## هيكل المشروع
```
clinic-bot/
├── netlify/
│   └── functions/
│       └── webhook.js      ← كود البوت الرئيسي
├── .env.example            ← نموذج المتغيرات
├── .gitignore
├── netlify.toml            ← إعدادات Netlify
├── package.json
└── README.md
```

## المتغيرات المطلوبة في Netlify

| المتغير | المصدر |
|---|---|
| `PAGE_ACCESS_TOKEN` | Facebook Developers → Messenger → Access Tokens |
| `VERIFY_TOKEN` | كلمة سرية تخترعها أنت |
| `GEMINI_API_KEY` | aistudio.google.com/apikey |

## رابط الـ Webhook

بعد النشر على Netlify سيكون:
```
https://اسم-موقعك.netlify.app/.netlify/functions/webhook
```

## خطوات النشر

1. ارفع المشروع على GitHub
2. اربطه بـ Netlify
3. أضف المتغيرات في Site Settings → Environment Variables
4. أدخل رابط الـ Webhook في Facebook Developers

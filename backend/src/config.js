// Централизованный конфиг — все env переменные только отсюда
export const config = {
  port: parseInt(process.env.PORT || '8090'),
  host: process.env.HOST || '0.0.0.0',
  jwtSecret: process.env.JWT_SECRET || 'dev_secret_change_me',
  // Секрет для шифрования чувствительных настроек (ключ OpenAI учителя) в БД (AES-256-GCM).
  // Отдельная переменная предпочтительна; при отсутствии — fallback на JWT_SECRET, чтобы не
  // требовать нового env на сервере. ⚠️ Смена секрета делает старые зашифрованные ключи нечитаемыми.
  settingsEncKey: process.env.SETTINGS_ENC_KEY || process.env.JWT_SECRET || 'dev_secret_change_me',
  databaseUrl: process.env.DATABASE_URL || 'postgresql://german_app:secret@localhost:5432/german_learning',
  anthropicApiKey: process.env.ANTHROPIC_API_KEY || '',
  openaiApiKey: process.env.OPENAI_API_KEY || '',
  unsplashAccessKey: process.env.UNSPLASH_ACCESS_KEY || '',
  uploadDir: process.env.UPLOAD_DIR || './uploads',
  // Stripe (подписки v2) — только сервер, в git не писать
  stripeSecretKey: process.env.STRIPE_SECRET_KEY || '',
  stripeWebhookSecret: process.env.STRIPE_WEBHOOK_SECRET || '',
  stripePriceMonthly: process.env.STRIPE_PRICE_MONTHLY || '',
  stripePriceYearly: process.env.STRIPE_PRICE_YEARLY || '',
  // Основной боевой домен. translate.seoshkin.tools — доп., редиректит сюда (см. nginx/).
  publicUrl: process.env.PUBLIC_URL || 'https://deutschlernen.ai',
  // Кто может загружать/обрабатывать уроки (тратит токены). Пока — только Павел(1) и Евгений(5).
  // Меняется env-переменной UPLOAD_ALLOWED_IDS="1,5,..." без правки кода.
  uploadAllowedIds: (process.env.UPLOAD_ALLOWED_IDS || '1,5,29').split(',').map(n => parseInt(n.trim())).filter(Boolean),
}

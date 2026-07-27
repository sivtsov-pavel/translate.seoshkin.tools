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
  // ── Локальные модели (ноутбук Павла) вместо платного OpenAI ──
  // Тексты: 'local' → Ollama; 'openai' → платный ключ (тратит реальные деньги).
  aiTextProvider: process.env.AI_TEXT_PROVIDER || 'openai',
  // Картинки: 'local' → Draw Things; 'openai' → gpt-image-1/dall-e (тратит деньги).
  aiImageProvider: process.env.AI_IMAGE_PROVIDER || 'openai',
  ollamaBaseUrl: process.env.OLLAMA_BASE_URL || 'http://host.docker.internal:11434',
  ollamaModel: process.env.OLLAMA_MODEL || 'qwen3:14b',
  // Быстрая модель для микро-задач (перевод одного слова перед генерацией картинки).
  // qwen3:14b на такое тратит ~2.5 мин из-за «размышлений» — здесь это ни к чему.
  ollamaFastModel: process.env.OLLAMA_FAST_MODEL || 'llama3.1:8b',
  ollamaVisionModel: process.env.OLLAMA_VISION_MODEL || 'gemma3:4b',
  drawThingsUrl: process.env.DRAW_THINGS_URL || 'http://host.docker.internal:7860',
}

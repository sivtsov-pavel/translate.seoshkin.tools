-- Глобальные настройки платформы — только для супер-админа (user id=1).
-- Одна строка (id=1) с JSONB-конфигом: реклама, монетизация, тарифы, фичи.
CREATE TABLE IF NOT EXISTS platform_settings (
  id         INT PRIMARY KEY DEFAULT 1,
  config     JSONB NOT NULL DEFAULT '{}'::jsonb,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT platform_settings_singleton CHECK (id = 1)
);

-- Значения по умолчанию: реклама выключена, показ только на планшете/десктопе;
-- freemium с дневным лимитом; тарифы в евро.
INSERT INTO platform_settings (id, config)
VALUES (1, '{
  "ads": {
    "enabled": false,
    "mobile": false,
    "tablet": true,
    "desktop": true,
    "provider": "adsense",
    "adsense_client": "",
    "adsense_slot": ""
  },
  "monetization": {
    "mode": "freemium",
    "free_daily_limit": 30,
    "paid_enabled": false
  },
  "pricing": {
    "currency": "EUR",
    "monthly": 4.99,
    "yearly": 39.99,
    "lifetime": 0
  },
  "features": {
    "trainer_free": true,
    "avatar_video": false,
    "catalog": true
  }
}'::jsonb)
ON CONFLICT (id) DO NOTHING;

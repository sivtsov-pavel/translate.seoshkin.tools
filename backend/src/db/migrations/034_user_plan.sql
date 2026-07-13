-- Тариф пользователя для монетизации (v2): 'free' | 'premium'.
-- По умолчанию все бесплатные; премиум выдаётся оплатой (Stripe) или супер-админом.
-- Реклама и дневной лимит завязаны на этот флаг.
ALTER TABLE users ADD COLUMN IF NOT EXISTS plan TEXT NOT NULL DEFAULT 'free';

-- Супер-админ (id=1) — всегда премиум (без рекламы и лимитов).
UPDATE users SET plan = 'premium' WHERE id = 1;

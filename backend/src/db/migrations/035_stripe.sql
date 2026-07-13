-- Stripe-подписки (v2): связь пользователя с клиентом Stripe и статус подписки.
ALTER TABLE users ADD COLUMN IF NOT EXISTS stripe_customer_id  TEXT;
ALTER TABLE users ADD COLUMN IF NOT EXISTS subscription_status TEXT;   -- active | canceled | past_due | null
ALTER TABLE users ADD COLUMN IF NOT EXISTS plan_until          TIMESTAMPTZ; -- до какого времени премиум

CREATE INDEX IF NOT EXISTS idx_users_stripe_customer ON users(stripe_customer_id);

-- Журнал операций: что система делала, чем считала и во сколько это обошлось.
-- Появился после ночных прогонов на локальных моделях: без журнала непонятно, что
-- отработало, что упало и потратились ли деньги. Главное поле — provider: сразу видно,
-- ушёл вызов на платный OpenAI или на бесплатную локальную модель.
CREATE TABLE IF NOT EXISTS operation_log (
  id          SERIAL PRIMARY KEY,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  user_id     INTEGER REFERENCES users(id) ON DELETE SET NULL,
  lesson_id   INTEGER REFERENCES lessons(id) ON DELETE CASCADE,
  -- Что делали: upload | extract | exercises | translate | image | dictation | topup | other
  kind        VARCHAR(32)  NOT NULL,
  -- Чем считали: openai | local | none (none — детерминированный код, без ИИ)
  provider    VARCHAR(16)  NOT NULL DEFAULT 'none',
  model       VARCHAR(64),
  status      VARCHAR(16)  NOT NULL DEFAULT 'ok',   -- ok | error
  message     TEXT,                                  -- текст ошибки или короткий итог
  items       INTEGER,                               -- сколько штук обработано
  duration_ms INTEGER,
  cost_usd    NUMERIC(10, 5) NOT NULL DEFAULT 0,     -- 0 для локальных и детерминированных
  meta        JSONB NOT NULL DEFAULT '{}'::jsonb
);

-- Лента журнала читается «свежее сверху», часто с фильтром по статусу/уроку.
CREATE INDEX IF NOT EXISTS idx_operation_log_created ON operation_log (created_at DESC);
CREATE INDEX IF NOT EXISTS idx_operation_log_lesson  ON operation_log (lesson_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_operation_log_status  ON operation_log (status, created_at DESC);

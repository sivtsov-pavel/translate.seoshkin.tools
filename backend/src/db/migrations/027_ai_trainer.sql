-- AI-тренер по ТЗ: сессии, сообщения, сквозная память между сессиями, отчёты

CREATE TABLE IF NOT EXISTS ai_trainer_sessions (
  id          SERIAL PRIMARY KEY,
  user_id     INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  character   VARCHAR(32)  NOT NULL DEFAULT 'lena',
  scenario    VARCHAR(48)  NOT NULL DEFAULT 'free',
  status      VARCHAR(16)  NOT NULL DEFAULT 'active',   -- 'active' | 'finished'
  started_at  TIMESTAMPTZ  DEFAULT NOW(),
  finished_at TIMESTAMPTZ
);
CREATE INDEX IF NOT EXISTS idx_ai_trainer_sessions_user ON ai_trainer_sessions(user_id);

-- Сырая история реплик — источник истины
CREATE TABLE IF NOT EXISTS ai_trainer_messages (
  id          SERIAL PRIMARY KEY,
  session_id  INTEGER NOT NULL REFERENCES ai_trainer_sessions(id) ON DELETE CASCADE,
  role        VARCHAR(16) NOT NULL,   -- 'trainer' | 'user'
  text        TEXT NOT NULL,
  correction  TEXT,
  translation TEXT,
  created_at  TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_ai_trainer_messages_session ON ai_trainer_messages(session_id);

-- Память о ученике (одна строка на пользователя) — рабочий контекст для AI
CREATE TABLE IF NOT EXISTS ai_trainer_memory (
  user_id            INTEGER PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  summary_text       TEXT DEFAULT '',
  known_facts        JSONB DEFAULT '{}'::jsonb,   -- {"имя": "...", "город": "...", ...}
  recurring_mistakes JSONB DEFAULT '[]'::jsonb,   -- [{type, example, times_seen, last_seen_at}]
  topics_covered     JSONB DEFAULT '[]'::jsonb,   -- [{topic, date}]
  sessions_total     INTEGER DEFAULT 0,
  updated_at         TIMESTAMPTZ DEFAULT NOW()
);

-- Отчёт по завершённой сессии
CREATE TABLE IF NOT EXISTS ai_trainer_reports (
  id            SERIAL PRIMARY KEY,
  session_id    INTEGER NOT NULL REFERENCES ai_trainer_sessions(id) ON DELETE CASCADE,
  mistakes      JSONB DEFAULT '[]'::jsonb,
  message_count INTEGER DEFAULT 0,
  created_at    TIMESTAMPTZ DEFAULT NOW()
);

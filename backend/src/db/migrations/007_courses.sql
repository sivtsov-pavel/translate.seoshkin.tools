CREATE TABLE IF NOT EXISTS courses (
  id           SERIAL PRIMARY KEY,
  owner_id     INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  title        VARCHAR(255) NOT NULL,
  description  TEXT,
  sort_order   INTEGER DEFAULT 0,
  created_at   TIMESTAMPTZ DEFAULT NOW()
);

-- Привязка урока к курсу + порядковый номер урока внутри курса
ALTER TABLE lessons ADD COLUMN IF NOT EXISTS course_id     INTEGER REFERENCES courses(id) ON DELETE SET NULL;
ALTER TABLE lessons ADD COLUMN IF NOT EXISTS lesson_number INTEGER;

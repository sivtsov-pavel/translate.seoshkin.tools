CREATE TABLE IF NOT EXISTS lessons (
  id         SERIAL PRIMARY KEY,
  owner_id   INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  date       DATE NOT NULL DEFAULT CURRENT_DATE,
  title      VARCHAR(255),
  status     VARCHAR(20) NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'processing', 'done', 'error')),
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS lesson_media (
  id             SERIAL PRIMARY KEY,
  lesson_id      INTEGER NOT NULL REFERENCES lessons(id) ON DELETE CASCADE,
  type           VARCHAR(10) NOT NULL CHECK (type IN ('photo', 'audio')),
  file_path      VARCHAR(500) NOT NULL,
  processed      BOOLEAN DEFAULT FALSE,
  raw_extraction JSONB
);

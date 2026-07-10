CREATE TABLE IF NOT EXISTS phrasebook (
  id          SERIAL PRIMARY KEY,
  user_id     INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  de          TEXT NOT NULL,
  ru          TEXT NOT NULL,
  category    VARCHAR(100),
  source      VARCHAR(20) DEFAULT 'manual',
  exercise_id INTEGER REFERENCES exercises(id) ON DELETE SET NULL,
  learned     BOOLEAN DEFAULT FALSE,
  created_at  TIMESTAMPTZ DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_phrasebook_user ON phrasebook(user_id);

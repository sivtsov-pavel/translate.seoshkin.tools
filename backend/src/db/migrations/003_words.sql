CREATE TABLE IF NOT EXISTS words (
  id               SERIAL PRIMARY KEY,
  lesson_id        INTEGER REFERENCES lessons(id) ON DELETE SET NULL,
  user_id          INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  word_de          VARCHAR(255) NOT NULL,
  translation_ru   VARCHAR(255) NOT NULL,
  example_sentence TEXT,
  easiness_factor  NUMERIC(4,2) DEFAULT 2.5,
  interval_days    INTEGER DEFAULT 0,
  repetitions      INTEGER DEFAULT 0,
  next_review_date DATE DEFAULT CURRENT_DATE,
  status           VARCHAR(20) DEFAULT 'new' CHECK (status IN ('new', 'learning', 'known')),
  created_at       TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(user_id, word_de)
);

CREATE TABLE IF NOT EXISTS grammar_points (
  id          SERIAL PRIMARY KEY,
  lesson_id   INTEGER NOT NULL REFERENCES lessons(id) ON DELETE CASCADE,
  description TEXT NOT NULL,
  example     TEXT
);

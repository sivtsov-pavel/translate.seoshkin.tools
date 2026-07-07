CREATE TABLE IF NOT EXISTS exercises (
  id               SERIAL PRIMARY KEY,
  lesson_id        INTEGER REFERENCES lessons(id) ON DELETE CASCADE,
  word_id          INTEGER REFERENCES words(id) ON DELETE CASCADE,
  type             VARCHAR(30) NOT NULL CHECK (type IN ('flashcard', 'fill_blank', 'multiple_choice')),
  payload          JSONB NOT NULL,
  easiness_factor  NUMERIC(4,2) DEFAULT 2.5,
  interval_days    INTEGER DEFAULT 0,
  repetitions      INTEGER DEFAULT 0,
  next_review_date DATE DEFAULT CURRENT_DATE,
  created_at       TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS exercise_attempts (
  id           SERIAL PRIMARY KEY,
  exercise_id  INTEGER NOT NULL REFERENCES exercises(id) ON DELETE CASCADE,
  user_id      INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  user_answer  TEXT,
  is_correct   BOOLEAN NOT NULL,
  quality      INTEGER CHECK (quality BETWEEN 0 AND 5),
  attempted_at TIMESTAMPTZ DEFAULT NOW()
);

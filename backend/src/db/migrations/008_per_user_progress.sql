-- SRS прогресс по каждому упражнению — отдельно для каждого пользователя
CREATE TABLE IF NOT EXISTS user_exercise_progress (
  user_id          INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  exercise_id      INTEGER NOT NULL REFERENCES exercises(id) ON DELETE CASCADE,
  easiness_factor  NUMERIC(4,2)  DEFAULT 2.5,
  interval_days    INTEGER       DEFAULT 0,
  repetitions      INTEGER       DEFAULT 0,
  next_review_date DATE          DEFAULT CURRENT_DATE,
  PRIMARY KEY (user_id, exercise_id)
);

-- Статус слова — отдельно для каждого пользователя
CREATE TABLE IF NOT EXISTS user_word_status (
  user_id  INTEGER NOT NULL REFERENCES users(id)  ON DELETE CASCADE,
  word_id  INTEGER NOT NULL REFERENCES words(id)  ON DELETE CASCADE,
  status   VARCHAR(20) NOT NULL DEFAULT 'new'
           CHECK (status IN ('new', 'learning', 'known')),
  PRIMARY KEY (user_id, word_id)
);

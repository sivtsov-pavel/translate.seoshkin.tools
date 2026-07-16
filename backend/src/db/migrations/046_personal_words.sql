-- Личный словарь ученика: слова из его тетради, которых нет в уроках школы.
-- Ученик грузит фото → OCR → дедуп → добавляем только новые как ЛИЧНЫЙ запас.
CREATE TABLE IF NOT EXISTS personal_words (
  id           SERIAL PRIMARY KEY,
  user_id      INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  target_lang  TEXT NOT NULL DEFAULT 'de',
  word         TEXT NOT NULL,             -- слово изучаемого языка
  translation  TEXT,                      -- перевод на родной язык ученика
  image_url    TEXT,                      -- из банка слов (бесплатно) или своя
  status       VARCHAR(20) NOT NULL DEFAULT 'new',  -- new | learning | known
  created_at   TIMESTAMPTZ DEFAULT now(),
  UNIQUE (user_id, target_lang, word)
);
CREATE INDEX IF NOT EXISTS idx_personal_words_user ON personal_words(user_id);

-- Хвосты для фраз. У упражнений такая таблица есть с миграции 056, а фразы живут
-- в своей модели, и пропуск фразы никуда не записывался: она просто оставалась
-- непройденной, и вернуться к ней можно было, только вспомнив, в каком наборе она была.
--
-- Правило то же, что у упражнений: пропустил → строка появилась, прошёл → удалилась.
CREATE TABLE IF NOT EXISTS phrase_deferrals (
  user_id    INTEGER NOT NULL REFERENCES users(id)   ON DELETE CASCADE,
  phrase_id  INTEGER NOT NULL REFERENCES phrases(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, phrase_id)
);
CREATE INDEX IF NOT EXISTS idx_phrase_deferrals_user ON phrase_deferrals(user_id);

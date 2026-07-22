-- «Хвосты»: упражнения, которые ученик осознанно пропустил в карусели (напр. «проговори слова»
-- ночью, когда неудобно говорить). Не теряются — копятся и должны быть пройдены для полного финиша.
-- Пропустил → строка появляется; прошёл упражнение (есть попытка) → строка удаляется.
CREATE TABLE IF NOT EXISTS exercise_deferrals (
  user_id     integer NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  exercise_id integer NOT NULL REFERENCES exercises(id) ON DELETE CASCADE,
  created_at  timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, exercise_id)
);
CREATE INDEX IF NOT EXISTS idx_deferrals_user ON exercise_deferrals(user_id);

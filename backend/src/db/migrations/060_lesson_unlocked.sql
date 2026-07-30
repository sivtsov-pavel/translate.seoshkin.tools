-- Факт открытия урока ученику. Пишется один раз, никогда не пересчитывается.
--
-- Зачем: доступ к урокам вычислялся каждый раз заново из правил прохождения, поэтому любое
-- ужесточение правил задним числом отнимало доступ у тех, кто уже занимался. 30.07.2026 так
-- и вышло: у трёх учениц цепочка гейта порвалась на первом уроке, и вместо пятнадцати
-- открытых уроков остался один. Теперь открытие фиксируется фактом: что открылось однажды,
-- закрыть уже нельзя, как бы ни менялись формулы.
CREATE TABLE IF NOT EXISTS user_lesson_unlocked (
  user_id    INTEGER NOT NULL REFERENCES users(id)   ON DELETE CASCADE,
  lesson_id  INTEGER NOT NULL REFERENCES lessons(id) ON DELETE CASCADE,
  opened_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (user_id, lesson_id)
);

CREATE INDEX IF NOT EXISTS idx_lesson_unlocked_user ON user_lesson_unlocked(user_id);

-- Разовое наполнение историей: всё, где ученик уже занимался, считаем открытым.
-- Без этого фиксация начнётся с нуля и прошлые заслуги не учтутся.
INSERT INTO user_lesson_unlocked (user_id, lesson_id)
SELECT DISTINCT uep.user_id, e.lesson_id
FROM user_exercise_progress uep
JOIN exercises e ON e.id = uep.exercise_id
ON CONFLICT DO NOTHING;

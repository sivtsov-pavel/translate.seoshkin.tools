-- Факт прохождения урока. Пишется один раз и никогда не пересчитывается вниз.
--
-- Зачем: «урок пройден» вычислялся каждый раз заново из ТЕКУЩЕГО набора упражнений.
-- Значит любое пополнение урока задним числом отнимало у ученика пройденное. 10.09.2026
-- так и вышло: догенерация недостающих упражнений добавила по паре карточек в девять
-- УЖЕ ПРОЙДЕННЫХ уроков — и все девять разом стали непройденными, карта закрылась на
-- четвёртом уроке, а виджет показал «47 из 48». Учитель добивает материал — у всего
-- класса схлопывается прогресс.
--
-- Это тот же урок, что и с доступом (см. 060_lesson_unlocked.sql): что заслужено
-- однажды, отнимать нельзя, как бы ни менялись формулы и наборы упражнений. Новые
-- упражнения по-прежнему всплывают в потоке (newExerciseIds) — их можно сделать,
-- но статус урока задним числом не откатывается.
--
-- Сбросить прохождение осознанно по-прежнему можно: «Повторить урок» (reset-lesson)
-- чистит и прогресс, и эту отметку.
CREATE TABLE IF NOT EXISTS user_lesson_passed (
  user_id    INTEGER NOT NULL REFERENCES users(id)   ON DELETE CASCADE,
  lesson_id  INTEGER NOT NULL REFERENCES lessons(id) ON DELETE CASCADE,
  passed_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (user_id, lesson_id)
);

CREATE INDEX IF NOT EXISTS idx_lesson_passed_user ON user_lesson_passed(user_id);

-- Разовое наполнение: всё, что проходит правило ПРЯМО СЕЙЧАС, фиксируем как пройденное.
-- Правило то же, что в drip.js (LESSON_PASSED_HAVING): по каждому слову урока отработаны
-- и карточка, и «выбери ответ». Держим его здесь текстом намеренно — миграция обязана
-- давать один и тот же результат через год, даже если формула в коде изменится.
INSERT INTO user_lesson_passed (user_id, lesson_id)
SELECT uep.user_id, e.lesson_id
FROM exercises e
JOIN user_exercise_progress uep ON uep.exercise_id = e.id
GROUP BY uep.user_id, e.lesson_id
HAVING count(DISTINCT e.word_id) FILTER (WHERE e.type IN ('flashcard', 'multiple_choice')) > 0
   AND count(DISTINCT e.word_id) FILTER (WHERE e.type = 'flashcard') =
       (SELECT count(DISTINCT e2.word_id) FROM exercises e2
         WHERE e2.lesson_id = e.lesson_id AND e2.type = 'flashcard')
   AND count(DISTINCT e.word_id) FILTER (WHERE e.type = 'multiple_choice') =
       (SELECT count(DISTINCT e2.word_id) FROM exercises e2
         WHERE e2.lesson_id = e.lesson_id AND e2.type = 'multiple_choice')
ON CONFLICT DO NOTHING;

-- Сведение повторов слов курса к одной записи — БЕЗ потери прогресса.
--
-- Задача (Павел, 01.10.2026): «у нас есть дубли слов, например с приставками типа sie или im,
-- помоги навести порядок». В немецком курсе 1622 слова, из них 310 — повторы: «und», «ich»,
-- «die», «im», «für» заведены по 4–5 раз, каждый раз со своим переводом («die» = «эта» /
-- «определённый артикль женского рода» / «артикль ж.р.»), вразнобой по регистру (Ich/ich).
--
-- Почему не просто DELETE. Удаление слова каскадом уносит его упражнения, а с ними — попытки
-- и отметки о пройденном. На боевых данных это 1724 упражнения, 306 записей прогресса Павла и
-- 355 его попыток за 20 дней: пропал бы график недели и, возможно, оборвалась серия. Человеку,
-- который неделю назад жаловался ровно на «прогресс не засчитался», такую чистку показывать
-- нельзя. Поэтому здесь не удаление, а СЛИЯНИЕ: всё нажитое переезжает на остающееся слово.
--
-- Порядок операций важен и обратному не поддаётся:
--   1. упражнения типов, которых у остающегося слова нет, переносим целиком (с историей);
--   2. у остальных переносим попытки и прогресс на упражнение-близнеца того же типа;
--   3. сливаем отметки «в изучение» и дописываем остающемуся слову картинку/пример/переводы;
--   4. и только теперь удаляем дубли — забирать с собой им уже нечего.
--
-- Параметры: :lang — код языка курса, :min_words — порог, ниже которого урок не чистим,
-- :apply — 0 показывает план и откатывает, 1 фиксирует.
--
-- Идемпотентен: повторный запуск находит ноль пар и ничего не делает.

\set ON_ERROR_STOP on
BEGIN;

-- ── Пары «дубль → остающееся слово» ──────────────────────────────────────────
-- Ключ слова — без артикля и регистронезависимо: «die Frau», «Die Frau» и «frau» — одно слово.
-- Остающимся считаем ПЕРВОЕ вхождение по порядку уроков: лексика должна оставаться там, где
-- учебник её вводит, а не уезжать в урок, где она просто повторяется.
CREATE TEMP TABLE _w ON COMMIT DROP AS
  SELECT w.id, w.lesson_id, l.owner_id, l.target_lang,
         COALESCE(l.lesson_number, 9999) AS num,
         lower(regexp_replace(w.word_de, '^(der|die|das|ein|eine|el|la|los|las|the|a|an)\s+', '', 'i')) AS key
    FROM words w
    JOIN lessons l ON l.id = w.lesson_id
   WHERE l.is_set = false AND l.is_personal = false AND l.target_lang = :'lang';

CREATE TEMP TABLE _ranked ON COMMIT DROP AS
  SELECT *,
         row_number() OVER pw                      AS rn,
         first_value(id)        OVER pw            AS canon_id,
         first_value(lesson_id) OVER pw            AS canon_lesson
    FROM _w
  WINDOW pw AS (PARTITION BY owner_id, target_lang, key ORDER BY num, id);

-- Урок, в котором после чистки осталось бы меньше :min_words слов, не трогаем вовсе: такая
-- страница учебника по смыслу повторительная, и вычищать её нечего — останется пустой урок.
CREATE TEMP TABLE pair ON COMMIT DROP AS
  SELECT r.id AS dup_id, r.lesson_id AS dup_lesson, r.canon_id, r.canon_lesson
    FROM _ranked r
    JOIN (SELECT lesson_id, count(*) n FROM _w GROUP BY 1) t ON t.lesson_id = r.lesson_id
    LEFT JOIN (SELECT lesson_id, count(*) n FROM _ranked WHERE rn > 1 GROUP BY 1) d ON d.lesson_id = r.lesson_id
   WHERE r.rn > 1
     AND t.n - COALESCE(d.n, 0) >= :min_words;

\echo ''
\echo '── План ─────────────────────────────────────────────────────────────'
SELECT (SELECT count(*) FROM _w)                                   AS слов_в_курсе,
       (SELECT count(*) FROM _ranked WHERE rn = 1)                 AS уникальных,
       (SELECT count(*) FROM pair)                                 AS сведём,
       (SELECT count(*) FROM _ranked WHERE rn > 1) - (SELECT count(*) FROM pair) AS оставим_как_есть;

SELECT l.lesson_number AS урок, left(l.title, 38) AS название,
       count(*) AS сведём,
       (SELECT count(*) FROM _w WHERE lesson_id = p.dup_lesson) AS было_слов
  FROM pair p JOIN lessons l ON l.id = p.dup_lesson
 GROUP BY 1, 2, p.dup_lesson ORDER BY 1;

\echo ''
\echo '── Что переедет на остающиеся слова (ничего не теряется) ────────────'
SELECT (SELECT count(*) FROM exercises e JOIN pair p ON p.dup_id = e.word_id)        AS упражнений_затронуто,
       (SELECT count(*) FROM exercise_attempts a JOIN exercises e ON e.id = a.exercise_id
          JOIN pair p ON p.dup_id = e.word_id)                                       AS попыток_переедет,
       (SELECT count(*) FROM user_exercise_progress pr JOIN exercises e ON e.id = pr.exercise_id
          JOIN pair p ON p.dup_id = e.word_id)                                       AS прогресса_переедет,
       (SELECT count(*) FROM user_word_status s JOIN pair p ON p.dup_id = s.word_id) AS отметок_переедет;

-- Контрольные суммы «до»: по ним после слияния проверяем, что история цела.
CREATE TEMP TABLE _before ON COMMIT DROP AS
  SELECT (SELECT count(*) FROM exercise_attempts)       AS attempts,
         (SELECT count(*) FROM user_exercise_progress)  AS progress;

\if :apply

-- ── 1. Упражнения, близнеца которых у остающегося слова нет — переносим целиком ──
-- Вместе с упражнением автоматически переезжают его попытки и прогресс: трогать их отдельно
-- не нужно, и это самый надёжный из переносов.
--
-- DISTINCT ON обязателен. Два разных дубля одного слова могут нести упражнение одного типа,
-- условие NOT EXISTS проверяется по снимку ДО обновления, и оба прошли бы его разом — а
-- уникальный индекс (lesson_id, word_id, type) принял бы только одно. Запрос упал бы целиком.
CREATE TEMP TABLE _move ON COMMIT DROP AS
  SELECT DISTINCT ON (p.canon_id, e.type) e.id, p.canon_id, p.canon_lesson
    FROM exercises e
    JOIN pair p ON p.dup_id = e.word_id
   WHERE NOT EXISTS (SELECT 1 FROM exercises c
                      WHERE c.word_id = p.canon_id AND c.lesson_id = p.canon_lesson AND c.type = e.type)
   ORDER BY p.canon_id, e.type, e.id;

UPDATE exercises e SET word_id = m.canon_id, lesson_id = m.canon_lesson
  FROM _move m WHERE e.id = m.id;

-- ── 2. У остальных — попытки на упражнение-близнеца того же типа ──────────────
UPDATE exercise_attempts a SET exercise_id = ce.id
  FROM exercises de
  JOIN pair p      ON p.dup_id = de.word_id
  JOIN exercises ce ON ce.word_id = p.canon_id AND ce.lesson_id = p.canon_lesson AND ce.type = de.type
 WHERE a.exercise_id = de.id;

-- ── 3. Прогресс SM-2: переносим, а при столкновении оставляем более продвинутый ──
-- «Более продвинутый» = с более дальним сроком следующего повтора. Брать любой нельзя:
-- слово, отработанное до интервала в год, откатилось бы к суткам, и SM-2 начал бы сначала.
INSERT INTO user_exercise_progress (user_id, exercise_id, easiness_factor, interval_days, repetitions, next_review_date)
SELECT DISTINCT ON (pr.user_id, ce.id)
       pr.user_id, ce.id, pr.easiness_factor, pr.interval_days, pr.repetitions, pr.next_review_date
  FROM user_exercise_progress pr
  JOIN exercises de ON de.id = pr.exercise_id
  JOIN pair p       ON p.dup_id = de.word_id
  JOIN exercises ce ON ce.word_id = p.canon_id AND ce.lesson_id = p.canon_lesson AND ce.type = de.type
 ORDER BY pr.user_id, ce.id, pr.next_review_date DESC
    ON CONFLICT (user_id, exercise_id) DO UPDATE
   SET easiness_factor  = EXCLUDED.easiness_factor,
       interval_days    = EXCLUDED.interval_days,
       repetitions      = EXCLUDED.repetitions,
       next_review_date = EXCLUDED.next_review_date
 WHERE EXCLUDED.next_review_date > user_exercise_progress.next_review_date;

-- ── 4. Отметки «новое / изучается / выучено» — оставляем сильнейшую ───────────
INSERT INTO user_word_status (user_id, word_id, status)
SELECT DISTINCT ON (s.user_id, p.canon_id) s.user_id, p.canon_id, s.status
  FROM user_word_status s JOIN pair p ON p.dup_id = s.word_id
 ORDER BY s.user_id, p.canon_id,
          CASE s.status WHEN 'known' THEN 3 WHEN 'learning' THEN 2 ELSE 1 END DESC
    ON CONFLICT (user_id, word_id) DO UPDATE SET status = EXCLUDED.status
 WHERE CASE EXCLUDED.status           WHEN 'known' THEN 3 WHEN 'learning' THEN 2 ELSE 1 END
     > CASE user_word_status.status   WHEN 'known' THEN 3 WHEN 'learning' THEN 2 ELSE 1 END;

-- ── 5. Содержимое: картинку, пример и переводы дописываем остающемуся, если пусто ──
-- Переводы сливаем так, чтобы свои у остающегося были сильнее: дубль дополняет, но не
-- перебивает — иначе «эта» из урока 18 затёрло бы «определённый артикль ж.р.» из урока 2.
UPDATE words c
   SET image_url            = COALESCE(c.image_url, d.image_url),
       example_sentence     = COALESCE(c.example_sentence, d.example_sentence),
       example_sentence_ru  = COALESCE(c.example_sentence_ru, d.example_sentence_ru),
       translations         = COALESCE(d.translations, '{}'::jsonb) || COALESCE(c.translations, '{}'::jsonb),
       example_translations = COALESCE(d.example_translations, '{}'::jsonb) || COALESCE(c.example_translations, '{}'::jsonb)
  FROM pair p JOIN words d ON d.id = p.dup_id
 WHERE c.id = p.canon_id;

-- ── 6. Теперь дубли можно удалять: забирать с собой им нечего ─────────────────
DELETE FROM words WHERE id IN (SELECT dup_id FROM pair);

\echo ''
\echo '── Проверка: история должна остаться целой ──────────────────────────'
-- Попытки и прогресс не исчезают, а переезжают. Расхождение означает, что какое-то упражнение
-- унесло их с собой — значит перенос не покрыл какой-то случай, и коммитить нельзя.
SELECT b.attempts AS попыток_было, (SELECT count(*) FROM exercise_attempts) AS стало,
       b.attempts - (SELECT count(*) FROM exercise_attempts) AS потеряно_попыток,
       b.progress AS прогресса_было, (SELECT count(*) FROM user_exercise_progress) AS прогресса_стало,
       b.progress - (SELECT count(*) FROM user_exercise_progress) AS потеряно_прогресса
  FROM _before b;

\echo ''
\echo 'Слияние выполнено.'
COMMIT;

\else

\echo ''
\echo 'Это ПЛАН, база не изменена. Выполнить: -v apply=1'
ROLLBACK;

\endif

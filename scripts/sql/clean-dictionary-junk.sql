-- Мусор в словаре: пустота, записанная словом, и команды учебника, принятые за лексику.
--
-- Оба случая Павел показал скриншотом словаря 01.10.2026.
--
--   1. «der Supermarkt — супермаркет, null». Примера у слова нет, но в колонке лежит строка
--      "null": модель, которой нечего ответить, иногда пишет это текстом, а проверка
--      `example || null` пропускает её — строка непустая. Причина закрыта в коде
--      (normalizeExample в services/processor.js), здесь убираем след.
--
--   2. «Markieren Sie.» как словарная статья. Это не слово, а подпись к заданию со страницы
--      учебника: «Hören Sie.», «Lesen Sie.», «Schreiben Sie.». Глаголы hören, lesen,
--      markieren, schreiben, sprechen в курсе уже есть отдельными словами — команда
--      добавляет к ним седьмой комплект упражнений и ничему не учит.
--
-- Команду удаляем ТОЛЬКО если по ней никто не занимался. Отработанное не трогаем ни при
-- каких условиях: вычистить словарь ценой чужого прогресса — не чистка, а потеря.
--
-- Параметры: :lang — код языка курса, :apply — 0 показывает план и откатывает, 1 фиксирует.
-- Идемпотентен: повторный запуск находит ноль строк.

\set ON_ERROR_STOP on
BEGIN;

-- ── 1. Строка "null" и её родня вместо отсутствующего примера ─────────────────
CREATE TEMP TABLE _fake_example ON COMMIT DROP AS
  SELECT w.id, w.word_de, l.lesson_number
    FROM words w JOIN lessons l ON l.id = w.lesson_id
   WHERE l.target_lang = :'lang'
     AND (btrim(w.example_sentence)    ~* '^(null|undefined|none|nil|n/a|-|—)$'
       OR btrim(w.example_sentence_ru) ~* '^(null|undefined|none|nil|n/a|-|—)$');

-- ── 2. Команды учебника, записанные как слова ─────────────────────────────────
-- Признак: повелительная форма с вежливым «Sie» и точкой на конце — «Hören Sie.».
-- Узкий шаблон намеренно: под «фразу в словаре» попали бы и настоящие устойчивые
-- выражения вроде «Guten Morgen», которым в словаре самое место.
CREATE TEMP TABLE _command ON COMMIT DROP AS
  SELECT w.id, w.word_de, w.translation_ru, l.lesson_number,
         (SELECT count(*) FROM exercises e WHERE e.word_id = w.id)                   AS упражнений,
         (SELECT count(*) FROM user_exercise_progress p
            JOIN exercises e ON e.id = p.exercise_id WHERE e.word_id = w.id)         AS отработано
    FROM words w JOIN lessons l ON l.id = w.lesson_id
   WHERE l.target_lang = :'lang' AND l.is_set = false
     AND w.word_de ~ '^[A-ZÄÖÜ][a-zäöüß]+ Sie\.$';

\echo ''
\echo '── 1. Примеры со строкой-пустышкой ──────────────────────────────────'
SELECT lesson_number AS урок, word_de AS слово FROM _fake_example ORDER BY 1, 2;

\echo ''
\echo '── 2. Команды учебника в словаре ────────────────────────────────────'
SELECT lesson_number AS урок, word_de AS фраза, translation_ru AS перевод,
       упражнений, отработано,
       CASE WHEN отработано > 0 THEN 'НЕ ТРОГАЕМ — по ней занимались' ELSE 'удалим' END AS решение
  FROM _command ORDER BY 1, 2;

\if :apply

UPDATE words SET
    example_sentence    = CASE WHEN btrim(example_sentence)    ~* '^(null|undefined|none|nil|n/a|-|—)$'
                               THEN NULL ELSE example_sentence END,
    example_sentence_ru = CASE WHEN btrim(example_sentence_ru) ~* '^(null|undefined|none|nil|n/a|-|—)$'
                               THEN NULL ELSE example_sentence_ru END
  WHERE id IN (SELECT id FROM _fake_example);

DELETE FROM words WHERE id IN (SELECT id FROM _command WHERE отработано = 0);

\echo ''
\echo 'Чистка выполнена.'
COMMIT;

\else

\echo ''
\echo 'Это ПЛАН, база не изменена. Выполнить: -v apply=1'
ROLLBACK;

\endif

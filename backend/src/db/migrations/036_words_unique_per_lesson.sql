-- Слова должны быть уникальны В ПРЕДЕЛАХ УРОКА, а не глобально у учителя.
-- Старое UNIQUE(user_id, word_de) не давало одному слову попасть в несколько уроков:
-- при повторе (напр. «trinken» из Урока 5) ON CONFLICT обновлял старую строку,
-- и в новый урок слово не добавлялось. Теперь одно слово может быть в разных уроках.
ALTER TABLE words DROP CONSTRAINT IF EXISTS words_user_id_word_de_key;
DROP INDEX IF EXISTS words_user_id_word_de_key;

-- Дубли внутри одного урока уже почищены — индекс создастся без конфликтов.
CREATE UNIQUE INDEX IF NOT EXISTS words_lesson_word_key ON words(lesson_id, word_de);

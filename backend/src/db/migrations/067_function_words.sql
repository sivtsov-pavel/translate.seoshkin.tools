-- Служебные слова (die, ein, und, ist, nicht…) — пометка, чтобы не попадали
-- в обычные упражнения. Карточка «die = эта» с картинкой ничему не учит:
-- артикль и местоимение живут только внутри фразы, а не сами по себе.
-- Место таких слов — грамматические типы (article, declension, conjugation),
-- которые генерируются отдельно и на флаг не смотрят.
ALTER TABLE words ADD COLUMN IF NOT EXISTS is_function_word BOOLEAN NOT NULL DEFAULT false;

CREATE INDEX IF NOT EXISTS idx_words_function ON words (lesson_id) WHERE is_function_word;

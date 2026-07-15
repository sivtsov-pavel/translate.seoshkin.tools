-- Связь слова со сканом (фото учебника), с которого оно извлечено.
-- Нужна для фильтра в Словаре «слова с этой страницы/скана».
-- Заполняется при обработке урока (по raw_extraction каждого фото). Старые слова — NULL.
ALTER TABLE words ADD COLUMN IF NOT EXISTS media_id INTEGER REFERENCES lesson_media(id) ON DELETE SET NULL;
CREATE INDEX IF NOT EXISTS idx_words_media ON words(media_id);

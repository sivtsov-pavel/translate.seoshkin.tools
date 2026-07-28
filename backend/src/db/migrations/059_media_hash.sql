-- Отпечаток содержимого загруженного файла.
--
-- Повод: Павел загрузил урок, обновил страницу, загрузка пошла заново — и создался
-- ВТОРОЙ урок с теми же страницами (48 слов против 55, 43 общих). Заплачено дважды,
-- в списке два одинаковых урока. Проверка по имени файла не спасает: каждая загрузка
-- получает новый UUID. Сравниваем содержимое.
ALTER TABLE lesson_media ADD COLUMN IF NOT EXISTS file_hash VARCHAR(64);
CREATE INDEX IF NOT EXISTS idx_lesson_media_hash ON lesson_media (file_hash) WHERE file_hash IS NOT NULL;

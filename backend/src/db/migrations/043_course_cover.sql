-- Обложка курса (фото учебника), загружается учителем. Nullable — старые
-- курсы без обложки получают плейсхолдер на фронте.
ALTER TABLE courses ADD COLUMN IF NOT EXISTS cover_image_url TEXT;

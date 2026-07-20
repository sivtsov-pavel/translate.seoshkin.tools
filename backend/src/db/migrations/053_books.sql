-- Книги для Читалки: учитель загружает PDF/TXT → извлекаем текст → ученики читают в Читалке.
-- Как курсы: файл + обложка. Текст хранится целиком (content), на абзацы бьётся на клиенте
-- детерминированно — чтобы индекс абзаца-закладки был стабилен между сессиями.
CREATE TABLE IF NOT EXISTS books (
  id              SERIAL PRIMARY KEY,
  owner_id        INTEGER NOT NULL REFERENCES users(id)   ON DELETE CASCADE,
  school_id       INTEGER REFERENCES schools(id)          ON DELETE CASCADE,
  title           TEXT    NOT NULL,
  cover_image_url TEXT,
  target_lang     TEXT    NOT NULL DEFAULT 'de',
  source_type     TEXT    NOT NULL DEFAULT 'txt',          -- 'pdf' | 'txt'
  content         TEXT    NOT NULL DEFAULT '',
  char_count      INTEGER NOT NULL DEFAULT 0,
  created_at      TIMESTAMPTZ DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_books_school ON books(school_id);
CREATE INDEX IF NOT EXISTS idx_books_owner  ON books(owner_id);

-- «Закладка»: на каком абзаце ученик остановился (по одному на пару ученик+книга).
-- para_index — индекс абзаца, который был вверху экрана; при открытии возвращаемся к нему.
CREATE TABLE IF NOT EXISTS book_progress (
  user_id    INTEGER NOT NULL REFERENCES users(id)  ON DELETE CASCADE,
  book_id    INTEGER NOT NULL REFERENCES books(id)  ON DELETE CASCADE,
  para_index INTEGER NOT NULL DEFAULT 0,
  updated_at TIMESTAMPTZ DEFAULT now(),
  PRIMARY KEY (user_id, book_id)
);

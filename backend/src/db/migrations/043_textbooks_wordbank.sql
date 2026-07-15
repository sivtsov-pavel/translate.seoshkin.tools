-- Каталог учебников + банк слов (общий справочник для всех школ).
-- Идея: не плодить одно и то же — учитель «подключает» готовый учебник из каталога
-- (слова/упражнения/картинки уже сгенерированы), а картинки/переводы копятся в банке
-- и переиспользуются. Фаза схемы — аддитивно, wiring поверх существующего дедупа.

-- Каталог учебников
CREATE TABLE IF NOT EXISTS textbooks (
  id          SERIAL PRIMARY KEY,
  name        TEXT NOT NULL,
  publisher   TEXT,
  level       TEXT,                       -- A1/A2/B1…
  target_lang TEXT NOT NULL DEFAULT 'de',
  cover_url   TEXT,
  is_public   BOOLEAN DEFAULT true,       -- виден всем школам (общий каталог)
  created_by  INTEGER REFERENCES users(id),
  created_at  TIMESTAMPTZ DEFAULT now()
);
-- Урок может относиться к учебнику каталога
ALTER TABLE lessons ADD COLUMN IF NOT EXISTS textbook_id INTEGER REFERENCES textbooks(id);
CREATE INDEX IF NOT EXISTS idx_lessons_textbook ON lessons(textbook_id);

-- Банк слов: канонический словарь. Картинка — по СМЫСЛУ (concept), одна на все языки;
-- переводы — по (слово + изучаемый язык). uses — счётчик переиспользований.
CREATE TABLE IF NOT EXISTS word_bank (
  id               SERIAL PRIMARY KEY,
  target_lang      TEXT NOT NULL,
  word             TEXT NOT NULL,            -- нормализованное слово изучаемого языка
  concept          TEXT,                     -- смысл (перевод-ключ) — ключ картинки, общий для языков
  image_url        TEXT,
  translations     JSONB DEFAULT '{}',
  example_sentence TEXT,
  uses             INTEGER DEFAULT 0,
  created_at       TIMESTAMPTZ DEFAULT now(),
  UNIQUE (target_lang, word)
);
CREATE INDEX IF NOT EXISTS idx_word_bank_concept ON word_bank (lower(concept));

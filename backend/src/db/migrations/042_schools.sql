-- Мультиарендность (SaaS): Школа → Класс → Учитель → Ученик.
-- Фаза 1 — только схема + бэкфилл «Школы по умолчанию». Аддитивно и безопасно:
-- пока никто не читает school_id, поведение не меняется. Scoping запросов — фаза 2.

CREATE TABLE IF NOT EXISTS schools (
  id         SERIAL PRIMARY KEY,
  name       TEXT NOT NULL,
  owner_id   INTEGER REFERENCES users(id),   -- школа-админ (учитель-арендатор)
  plan       TEXT DEFAULT 'free',
  limits     JSONB DEFAULT '{}',             -- лимиты: картинки/OCR/ученики и т.д.
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE IF NOT EXISTS classes (
  id         SERIAL PRIMARY KEY,
  school_id  INTEGER NOT NULL REFERENCES schools(id) ON DELETE CASCADE,
  name       TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_classes_school ON classes(school_id);

CREATE TABLE IF NOT EXISTS class_members (
  class_id  INTEGER NOT NULL REFERENCES classes(id) ON DELETE CASCADE,
  user_id   INTEGER NOT NULL REFERENCES users(id)  ON DELETE CASCADE,
  role      VARCHAR(20) DEFAULT 'student',   -- teacher | student
  joined_at TIMESTAMPTZ DEFAULT now(),
  PRIMARY KEY (class_id, user_id)
);

-- Привязка к школе (scoping). Пока nullable, читать начнём в фазе 2.
ALTER TABLE users   ADD COLUMN IF NOT EXISTS school_id INTEGER REFERENCES schools(id);
ALTER TABLE users   ADD COLUMN IF NOT EXISTS is_school_admin BOOLEAN DEFAULT false;
ALTER TABLE lessons ADD COLUMN IF NOT EXISTS school_id INTEGER REFERENCES schools(id);
ALTER TABLE courses ADD COLUMN IF NOT EXISTS school_id INTEGER REFERENCES schools(id);
CREATE INDEX IF NOT EXISTS idx_users_school   ON users(school_id);
CREATE INDEX IF NOT EXISTS idx_lessons_school ON lessons(school_id);
CREATE INDEX IF NOT EXISTS idx_courses_school ON courses(school_id);

-- Школа по умолчанию для всех существующих данных (владелец — супер-админ id=1).
INSERT INTO schools (name, owner_id)
  SELECT 'Моя школа', 1 WHERE NOT EXISTS (SELECT 1 FROM schools);
UPDATE users   SET school_id = (SELECT id FROM schools ORDER BY id LIMIT 1) WHERE school_id IS NULL;
UPDATE lessons SET school_id = (SELECT id FROM schools ORDER BY id LIMIT 1) WHERE school_id IS NULL;
UPDATE courses SET school_id = (SELECT id FROM schools ORDER BY id LIMIT 1) WHERE school_id IS NULL;
UPDATE users   SET is_school_admin = true WHERE id = 1;

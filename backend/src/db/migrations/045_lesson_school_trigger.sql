-- Гарантия: у каждого урока есть school_id (иначе scoping спрячет его от учеников).
-- Триггер ставит school_id из школы владельца при вставке, если не задан явно.
-- Так любой путь создания урока (перераспределение, свой набор, читалка) не «теряет» школу.
CREATE OR REPLACE FUNCTION set_lesson_school() RETURNS trigger AS $$
BEGIN
  IF NEW.school_id IS NULL THEN
    SELECT school_id INTO NEW.school_id FROM users WHERE id = NEW.owner_id;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_lesson_school ON lessons;
CREATE TRIGGER trg_lesson_school BEFORE INSERT ON lessons
  FOR EACH ROW EXECUTE FUNCTION set_lesson_school();

-- Бэкфилл на всякий случай (идемпотентно)
UPDATE lessons SET school_id = (SELECT school_id FROM users WHERE users.id = lessons.owner_id) WHERE school_id IS NULL;

-- Дрип-выдача уроков курса: ученик выбирает удобные дни недели, уроки открываются по одному
-- в каждый учебный день от даты старта. Push при открытии нового урока.
CREATE TABLE IF NOT EXISTS course_schedules (
  id              SERIAL PRIMARY KEY,
  user_id         INTEGER NOT NULL REFERENCES users(id)   ON DELETE CASCADE,
  course_id       INTEGER NOT NULL REFERENCES courses(id) ON DELETE CASCADE,
  weekdays        INTEGER[] NOT NULL DEFAULT '{1,2,3,4,5}', -- ISO-дни недели: 1=Пн … 7=Вс
  start_date      DATE    NOT NULL DEFAULT CURRENT_DATE,
  last_push_index INTEGER NOT NULL DEFAULT 0,               -- сколько уроков уже отправлено в push (защита от дублей)
  created_at      TIMESTAMPTZ DEFAULT now(),
  UNIQUE (user_id, course_id)
);

CREATE INDEX IF NOT EXISTS idx_course_schedules_course ON course_schedules(course_id);
CREATE INDEX IF NOT EXISTS idx_course_schedules_user   ON course_schedules(user_id);

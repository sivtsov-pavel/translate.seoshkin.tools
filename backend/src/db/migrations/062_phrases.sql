-- Наборы фраз: тема (KOCHEN / A1) + её фразы + прогресс ученика по каждой фразе.
-- Существующие phrase_sets (011) — это сохранённые тексты из TextReader, к фразам
-- отношения не имеют и НЕ трогаются. Старый phrasebook (019) переносится отдельно.

CREATE TABLE IF NOT EXISTS phrase_topics (
  id          SERIAL PRIMARY KEY,
  slug        VARCHAR(80)  NOT NULL,
  lang        VARCHAR(5)   NOT NULL,               -- целевой язык: de | en | es
  level       VARCHAR(4)   NOT NULL DEFAULT 'A1',  -- A0 | A1 | A2 | B1 | B2
  title       VARCHAR(120) NOT NULL,               -- на целевом языке: «Kochen»
  title_i18n  JSONB        NOT NULL DEFAULT '{}',  -- переводы названия на 10 локалей
  emoji       VARCHAR(8),
  image_url   TEXT,
  source      VARCHAR(12)  NOT NULL,               -- catalog | lesson | teacher | student
  owner_id    INTEGER REFERENCES users(id)   ON DELETE CASCADE,  -- NULL = общий каталог
  school_id   INTEGER REFERENCES schools(id) ON DELETE CASCADE,
  lesson_id   INTEGER REFERENCES lessons(id) ON DELETE CASCADE,
  published   BOOLEAN      NOT NULL DEFAULT FALSE, -- черновик, пока человек не вычитал
  created_at  TIMESTAMPTZ  DEFAULT now()
);
-- Один набор на урок: повторный прогон скрипта не плодит дубли.
CREATE UNIQUE INDEX IF NOT EXISTS idx_phrase_topics_lesson
  ON phrase_topics(lesson_id) WHERE lesson_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_phrase_topics_owner ON phrase_topics(owner_id);

CREATE TABLE IF NOT EXISTS phrases (
  id           SERIAL PRIMARY KEY,
  topic_id     INTEGER NOT NULL REFERENCES phrase_topics(id) ON DELETE CASCADE,
  position     INTEGER NOT NULL,
  text         TEXT    NOT NULL,                   -- «Ich wasche meine Hände.»
  translations JSONB   NOT NULL DEFAULT '{}',      -- {ru: '…', en: '…'} — 10 локалей
  emoji        VARCHAR(8),
  word_ids     INTEGER[] NOT NULL DEFAULT '{}',    -- слова урока, задействованные во фразе
  created_at   TIMESTAMPTZ DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_phrases_topic ON phrases(topic_id);

-- Прогресс по фразе. Шаг «говорю» необязателен (в Safari/iOS распознавания нет вовсе),
-- поэтому пройденной фраза считается по двум первым шагам.
CREATE TABLE IF NOT EXISTS user_phrase_progress (
  user_id          INTEGER NOT NULL REFERENCES users(id)   ON DELETE CASCADE,
  phrase_id        INTEGER NOT NULL REFERENCES phrases(id) ON DELETE CASCADE,
  step_listen      BOOLEAN NOT NULL DEFAULT FALSE,
  step_build       BOOLEAN NOT NULL DEFAULT FALSE,
  step_speak       BOOLEAN NOT NULL DEFAULT FALSE,
  easiness_factor  NUMERIC(4,2) DEFAULT 2.5,
  interval_days    INTEGER      DEFAULT 0,
  repetitions      INTEGER      DEFAULT 0,
  next_review_date DATE         DEFAULT CURRENT_DATE,
  updated_at       TIMESTAMPTZ  DEFAULT now(),
  PRIMARY KEY (user_id, phrase_id)
);
CREATE INDEX IF NOT EXISTS idx_user_phrase_progress_review
  ON user_phrase_progress(user_id, next_review_date);

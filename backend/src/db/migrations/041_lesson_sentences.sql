-- Реальные предложения урока (из учебника/тетради/доски) — источник для упражнений.
-- Упражнения (пропуск/напиши предложение) строятся из НИХ, а не выдумываются,
-- чтобы закреплять именно то, что разбирали (склонения, тема урока).
CREATE TABLE IF NOT EXISTS lesson_sentences (
  id             SERIAL PRIMARY KEY,
  lesson_id      INTEGER NOT NULL REFERENCES lessons(id) ON DELETE CASCADE,
  text           TEXT NOT NULL,
  translation_ru TEXT,
  source         VARCHAR(20) DEFAULT 'textbook',  -- textbook | extra (тетрадь/доска)
  created_at     TIMESTAMPTZ DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_lesson_sentences_lesson ON lesson_sentences(lesson_id);

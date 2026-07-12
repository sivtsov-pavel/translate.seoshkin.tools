-- Слова урока для режима «Тренер по уроку» (lesson_vocab) — тренер фокусируется на них
ALTER TABLE ai_trainer_sessions ADD COLUMN IF NOT EXISTS target_words JSONB;

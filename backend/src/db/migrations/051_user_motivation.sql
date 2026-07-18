-- Мотивационные напоминания: храним, что уже отправлено (вехи, вечернее), чтобы не спамить.
-- motivation: { lastWordsMilestone, lastLessonsMilestone, lastEveningPush: 'YYYY-MM-DD' }
ALTER TABLE users ADD COLUMN IF NOT EXISTS motivation jsonb NOT NULL DEFAULT '{}'::jsonb;

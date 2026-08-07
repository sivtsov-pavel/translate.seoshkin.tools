-- Гейт предложений из тетради: предложение, не прошедшее грамматическую проверку,
-- остаётся в базе (для истории/отладки), но помечается is_usable=false и НЕ используется
-- как источник упражнений (getLessonSentences). Откровенный мусор (разорванные слова,
-- кириллица в немецком) вообще не сохраняется — см. saveSentences.
ALTER TABLE lesson_sentences ADD COLUMN IF NOT EXISTS is_usable BOOLEAN DEFAULT TRUE;

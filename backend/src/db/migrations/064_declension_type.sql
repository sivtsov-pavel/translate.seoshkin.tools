-- Новый тип упражнения «declension» — склонение существительного по падежам.
--
-- Зачем отдельно от conjugation: спряжение (conjugation) есть только у глаголов, а их
-- в базе 317 против 1029 существительных. Из-за этого в уроке оказывалось одно-два
-- упражнения «Склонение», хотя склоняемых слов там десяток.
ALTER TABLE exercises DROP CONSTRAINT IF EXISTS exercises_type_check;
ALTER TABLE exercises ADD CONSTRAINT exercises_type_check
  CHECK (type IN ('flashcard','fill_blank','multiple_choice','sentence_write','letter_fill',
                  'dictation','speech','conjugation','declension'));

-- Новый тип упражнения «article» — выбери артикль (der/die/das).
--
-- Зачем: служебные слова (die, das, ein) стояли в словаре карточками, хотя карточкой
-- артикль не выучить — его учат вместе с существительным. Теперь это отдельное
-- упражнение по 1029 существительным, а не 43 бессмысленные карточки.
ALTER TABLE exercises DROP CONSTRAINT IF EXISTS exercises_type_check;
ALTER TABLE exercises ADD CONSTRAINT exercises_type_check
  CHECK (type IN ('flashcard','fill_blank','multiple_choice','sentence_write','letter_fill',
                  'dictation','speech','conjugation','declension','article'));

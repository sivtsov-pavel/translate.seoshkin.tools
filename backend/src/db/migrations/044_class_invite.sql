-- Код-приглашение для класса: ученик вводит код → присоединяется к классу/школе.
ALTER TABLE classes ADD COLUMN IF NOT EXISTS invite_code TEXT UNIQUE;

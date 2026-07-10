-- Чат: беседы и сообщения
CREATE TABLE IF NOT EXISTS chat_conversations (
  id         SERIAL PRIMARY KEY,
  type       VARCHAR(20) NOT NULL DEFAULT 'support', -- 'support' | 'teacher'
  student_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS chat_messages (
  id              SERIAL PRIMARY KEY,
  conversation_id INTEGER NOT NULL REFERENCES chat_conversations(id) ON DELETE CASCADE,
  sender_id       INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  body            TEXT    NOT NULL,
  read_at         TIMESTAMPTZ,
  created_at      TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_chat_messages_conv ON chat_messages(conversation_id, created_at);
CREATE INDEX IF NOT EXISTS idx_chat_conv_student  ON chat_conversations(student_id);
CREATE INDEX IF NOT EXISTS idx_chat_conv_type     ON chat_conversations(type);

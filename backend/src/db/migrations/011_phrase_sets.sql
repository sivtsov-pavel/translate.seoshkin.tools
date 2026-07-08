CREATE TABLE IF NOT EXISTS phrase_sets (
  id         SERIAL PRIMARY KEY,
  owner_id   INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  title      VARCHAR(255) NOT NULL,
  content    TEXT NOT NULL,
  created_at TIMESTAMP DEFAULT NOW()
);

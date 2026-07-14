-- Игра «Класс говорит»: набор разных фраз из урока, раздача ученикам, перевод на локаль каждого.
CREATE TABLE IF NOT EXISTS class_games (
  id         SERIAL PRIMARY KEY,
  lesson_id  INTEGER REFERENCES lessons(id) ON DELETE CASCADE,
  owner_id   INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  title      TEXT,
  format     TEXT NOT NULL DEFAULT 'relay',   -- relay | qa
  status     TEXT NOT NULL DEFAULT 'generating', -- generating | ready | error
  progress   TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS class_game_lines (
  id               SERIAL PRIMARY KEY,
  game_id          INTEGER NOT NULL REFERENCES class_games(id) ON DELETE CASCADE,
  ord              INTEGER NOT NULL DEFAULT 0,
  sentence_de      TEXT NOT NULL,
  translations     JSONB NOT NULL DEFAULT '{}'::jsonb,  -- {ru,uk,en,bg,tr,ar,es,fr,sq}
  role             TEXT NOT NULL DEFAULT 'statement',   -- question | answer | statement
  assigned_user_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
  read_at          TIMESTAMPTZ
);
CREATE INDEX IF NOT EXISTS idx_cgl_game ON class_game_lines(game_id);
CREATE INDEX IF NOT EXISTS idx_cgl_user ON class_game_lines(assigned_user_id);

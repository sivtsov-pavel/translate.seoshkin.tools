-- Токены виджета на домашнем экране (Android).
--
-- Нативный код виджета живёт вне браузера и до куки/localStorage сайта не достаёт:
-- Custom Tabs изолирован. Поэтому при включении виджета в настройках выдаётся отдельный
-- узкий токен — он умеет ровно одно: читать GET /api/widget/state. Основной JWT в
-- нативную часть не отдаём: у него полный доступ и короткий срок.
--
-- Храним ТОЛЬКО хеш (sha256): утечка дампа не должна давать доступ к чужому прогрессу.
CREATE TABLE IF NOT EXISTS widget_tokens (
  id           SERIAL PRIMARY KEY,
  user_id      INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  token_hash   TEXT NOT NULL UNIQUE,
  device_label TEXT,                       -- «Pixel 7», для списка устройств в настройках
  -- Изучаемый язык ученика. Живёт здесь, а не в заголовке запроса: нативная часть виджета
  -- не знает, что человек выбрал в приложении, и гадать по языку системы нельзя — ученик,
  -- перешедший на испанский, видел бы на домашнем экране прогресс по немецкому.
  target_lang  TEXT NOT NULL DEFAULT 'de',
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  last_used_at TIMESTAMPTZ,                -- видно, живой виджет или давно снесён
  expires_at   TIMESTAMPTZ NOT NULL,
  revoked_at   TIMESTAMPTZ                 -- выключение тумблера в настройках
);

-- Горячий путь: «есть ли у пользователя живой токен» (тумблер в настройках) и
-- «сколько устройств». Частичный индекс — только по действующим.
CREATE INDEX IF NOT EXISTS widget_tokens_active_idx
  ON widget_tokens (user_id) WHERE revoked_at IS NULL;

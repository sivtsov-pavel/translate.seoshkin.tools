#!/bin/bash
# Зеркалирование прода на локальную машину: база + загруженные файлы.
#
# Зачем: локальная копия нужна, чтобы пробовать генерацию, вёрстку и миграции на РЕАЛЬНЫХ
# данных, не трогая боевой сайт. Раньше в локальной базе лежало 10 тестовых уроков, и
# проверить на ней что-либо всерьёз было нельзя.
#
# ⚠️ ОДНОСТОРОННЯЯ операция: прод → ноут. Локальные база и файлы ПОЛНОСТЬЮ заменяются.
# Обратно (ноут → прод) скрипт не умеет и уметь не должен.
# Перед заменой делается бэкап локальной базы — на случай, если там было что-то нужное.
#
# Использование:
#   bash scripts/sync-from-prod.sh          # база + файлы
#   bash scripts/sync-from-prod.sh --db     # только база (быстро, ~20 МБ)
#   bash scripts/sync-from-prod.sh --files  # только файлы (~600 МБ)
set -euo pipefail

SSH_HOST="${PROD_SSH_HOST:-gcloud-seosite}"
PROD_DIR="${PROD_DIR:-/home/seosite/translate}"
DCP="docker compose -f docker-compose.prod.yml"
LOCAL_DIR="$(cd "$(dirname "$0")/.." && pwd)"
STAMP=$(date +%Y%m%d-%H%M%S)
BACKUP_DIR="$LOCAL_DIR/.local-backups"

DO_DB=1; DO_FILES=1
[[ "${1:-}" == "--db" ]] && DO_FILES=0
[[ "${1:-}" == "--files" ]] && DO_DB=0

cd "$LOCAL_DIR"
mkdir -p "$BACKUP_DIR"

# Локальный стек должен быть поднят — иначе некуда восстанавливать.
if ! docker compose ps --status running --format '{{.Service}}' | grep -q '^db$'; then
  echo "Локальная база не запущена. Поднимаю..."
  docker compose up -d db
  sleep 8
fi

if [[ $DO_DB == 1 ]]; then
  echo "── База ────────────────────────────────────────────"
  echo "1/4 Бэкап локальной базы (на всякий случай)…"
  docker compose exec -T db pg_dump -U german_app german_learning \
    | gzip > "$BACKUP_DIR/local-before-sync-$STAMP.sql.gz"
  echo "    → $BACKUP_DIR/local-before-sync-$STAMP.sql.gz"

  echo "2/4 Снимаю дамп прода…"
  ssh "$SSH_HOST" "cd $PROD_DIR && $DCP exec -T db pg_dump -U german_app german_learning" \
    | gzip > "$BACKUP_DIR/prod-$STAMP.sql.gz"
  echo "    → $BACKUP_DIR/prod-$STAMP.sql.gz ($(du -h "$BACKUP_DIR/prod-$STAMP.sql.gz" | cut -f1))"

  echo "3/4 Пересоздаю локальную базу…"
  # Рвём чужие подключения (бэкенд держит пул), иначе DROP DATABASE не пройдёт.
  docker compose exec -T db psql -U german_app -d postgres -c \
    "SELECT pg_terminate_backend(pid) FROM pg_stat_activity WHERE datname='german_learning' AND pid<>pg_backend_pid();" >/dev/null
  docker compose exec -T db psql -U german_app -d postgres -c "DROP DATABASE IF EXISTS german_learning;" >/dev/null
  docker compose exec -T db psql -U german_app -d postgres -c "CREATE DATABASE german_learning;" >/dev/null

  echo "4/4 Восстанавливаю…"
  gunzip -c "$BACKUP_DIR/prod-$STAMP.sql.gz" | docker compose exec -T db psql -U german_app -d german_learning -q >/dev/null
  echo "    ✓ база синхронизирована"
fi

if [[ $DO_FILES == 1 ]]; then
  echo "── Файлы (картинки, сканы уроков) ──────────────────"
  echo "Тяну ~600 МБ, это займёт несколько минут…"
  # Пакуем на проде и распаковываем прямо в локальный том — без промежуточного файла на диске.
  ssh "$SSH_HOST" "cd $PROD_DIR && $DCP exec -T backend tar czf - -C /data uploads" \
    | docker compose exec -T backend tar xzf - -C /data
  echo "    ✓ файлы синхронизированы"
fi

echo
echo "── Проверка ────────────────────────────────────────"
docker compose exec -T db psql -U german_app -d german_learning -t -A -c \
  "SELECT 'уроков: '||count(*) FROM lessons UNION ALL SELECT 'слов: '||count(*) FROM words
   UNION ALL SELECT 'упражнений: '||count(*) FROM exercises UNION ALL SELECT 'пользователей: '||count(*) FROM users;"
docker compose exec -T backend sh -c "du -sh /data/uploads 2>/dev/null || true"
echo
echo "Готово. Локальное приложение: http://localhost:8091"
echo "⚠️ Пароли пользователей — с прода (bcrypt). Входи своим обычным паролем."
echo "⚠️ Режим ИИ приехал из прода (openai). Для бесплатной работы переключи в"
echo "   Админ → 🤖 ИИ-провайдер, либо задай AI_*_PROVIDER=local в .env и перезапусти бэкенд."

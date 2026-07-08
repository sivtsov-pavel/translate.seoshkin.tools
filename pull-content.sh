#!/bin/bash
# Тянет БД и медиафайлы с продакшен-сервера на локалку

set -e

echo "⬇️  Дамп базы данных..."
ssh gcloud-seosite "docker compose -f /home/seosite/translate/docker-compose.yml exec -T db pg_dump -U german_app german_learning" > /tmp/german_dump.sql

echo "⬇️  Заливаем в локальную БД..."
docker compose exec -T db psql -U german_app -d german_learning < /tmp/german_dump.sql

echo "⬇️  Синхронизируем медиафайлы..."
rsync -avz --progress gcloud-seosite:/home/seosite/translate/uploads/ ./uploads/

echo ""
echo "✓ Готово — БД и медиа синхронизированы с сервером"

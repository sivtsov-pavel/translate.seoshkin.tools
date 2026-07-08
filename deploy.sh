#!/bin/bash
# Деплой на сервер: git pull + docker compose build + up
set -e

echo "==> git pull"
git pull origin main

echo "==> docker compose build"
docker compose -f docker-compose.prod.yml build

echo "==> docker compose up"
docker compose -f docker-compose.prod.yml up -d

echo "==> Done! Containers:"
docker compose -f docker-compose.prod.yml ps

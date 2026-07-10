# Деплой translate.seoshkin.tools

## Структура

- **Локальная разработка**: Docker на localhost, порты 8090 (backend) 8091 (frontend)
- **Продакшн**: сервер GCP `34.179.228.86`, проект в `/home/seosite/translate/`
- **Nginx**: `/var/www/translate.seoshkin.tools/nginx.conf` — это НЕ директория проекта, только конфиг

## Workflow

```
Разработка → тест на localhost → git commit → git push → deploy на сервер
```

## Локальная разработка

```bash
# Запустить всё локально
docker compose up -d

# Пересобрать после изменений frontend
docker compose build frontend && docker compose up -d frontend

# Пересобрать после изменений backend
docker compose build backend && docker compose up -d backend
```

Открыть: http://localhost:8091

## Деплой на продакшн

Claude Code может деплоить сам через SSH (ключ `~/.ssh/gcloud_seosite`, хост `gcloud-seosite`):

```bash
# 1. Пул новых изменений
ssh gcloud-seosite "cd /home/seosite/translate && git pull origin main"

# 2. Сборка образов
ssh gcloud-seosite "cd /home/seosite/translate && docker compose -f docker-compose.prod.yml build frontend backend"

# 3. Перезапуск
ssh gcloud-seosite "cd /home/seosite/translate && docker compose -f docker-compose.prod.yml up -d frontend backend"
```

## Частые ошибки

| Ошибка | Причина | Решение |
|--------|---------|---------|
| `./deploy.sh: No such file or directory` | Запуск из `/var/www/...` вместо `/home/seosite/translate/` | Запускать из правильной директории |
| Браузер показывает старую версию | PWA Service Worker кеш | Ctrl+Shift+R (жёсткий сброс) |
| Backend 204 но ничего не удалилось | Проверка `owner_id` в SQL | Исправлено: owner может удалять любой курс |

## SSH доступ

Хост настроен в `~/.ssh/config` как `gcloud-seosite`:
```
Host gcloud-seosite
    HostName 34.179.228.86
    User seosite
    IdentityFile ~/.ssh/gcloud_seosite
```

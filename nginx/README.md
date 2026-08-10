# nginx/ — конфиги доменов проекта translate

**Это источник истины для входных доменов приложения.** Правим ТОЛЬКО здесь, в git.

После переезда на `seoshkin-tools-core` (август 2026) каталог `nginx/` смонтирован в шлюз
**целиком** (`/home/seosite/translate/nginx` → `/etc/nginx/conf.d/translate`), склейка файлов
руками больше НЕ нужна. Применить правку:

```bash
ssh seoshkin-tools-core 'cd /home/seosite/translate && git pull && \
  docker exec ecosystem_router nginx -t && docker exec ecosystem_router nginx -s reload'
```

⚠️ **После каждого деплоя с пересозданием контейнеров** (`build` + `up -d`) шлюзу нужен
`nginx -s reload`: nginx кеширует IP контейнеров при загрузке конфига, у пересозданных
контейнеров IP новые → сайт отдаёт 502, пока шлюз не перечитает конфиг (наступили 10.08.2026).

## ⛔ Правила (чтобы не перетереть и не сломать прод)

- **Не редактировать конфиги домена на сервере руками.** Меняем файл здесь → `git push` →
  на сервере `git pull` → reload. Если кто-то поправил на сервере — вернуть из git:
  `git checkout -- nginx/`.
- **`proxy_pass` только на имя контейнера** `http://translate-frontend-1:80` — шлюз работает
  внутри docker-сети `translate_default`. `127.0.0.1` внутри контейнера шлюза = сам шлюз, НЕ
  приложение (частая причина «сайт лёг»).
- **443-блок нового домена включаем только ПОСЛЕ выпуска серта** — иначе nginx не стартует
  (нет файла сертификата) и при пересоздании контейнера падают ВСЕ сайты шлюза.

## 🗺️ Топология (как устроено сейчас)

```
Интернет :80/:443
      │
      ▼
ecosystem_router  (docker-контейнер nginx:alpine, общий шлюз всех проектов сервера)
  ├─ conf.d/translate/ ← /home/seosite/translate/nginx/ (каталог целиком, оба домена)
  ├─ conf.d/arina/, conf.d/sport/, … ← nginx/ других проектов
  └─ /etc/letsencrypt ← /var/www/seoshkin.com/certbot/conf (общий certbot-store)
        │  (оба server_name → одно приложение)
        ▼
  translate-frontend-1:80  (проект translate: /home/seosite/translate/docker-compose.prod.yml)
        ▼
  translate-backend-1  →  translate-db-1
```

- **Домены:** `deutschlernen.ai` — ОСНОВНОЙ; `translate.seoshkin.tools` — дополнительный
  (пока ученики не переведены на новый домен).
- **Серты:** хранятся в certbot-store шлюза — `/var/www/seoshkin.com/certbot/conf`
  (= `/etc/letsencrypt` внутри контейнера). ACME webroot — `/var/www/seoshkin.com/certbot/www`
  (= `/var/www/certbot` внутри контейнера).
- Приложение translate полностью отдельно (свой docker-compose, БД, сеть). Пересечение со
  шлюзом — только монтирование этих conf-файлов + подключение шлюза к сети `translate_default`.

## ➕ Как добавить новый домен

1. Создать `nginx/<домен>.conf` по образцу `deutschlernen.ai.conf` (сначала только 80-блок,
   443 закомментирован). `git push`.
2. На сервере: `cd /home/seosite/translate && git pull` (каталог уже смонтирован в шлюз —
   отдельное монтирование прописывать не нужно).
4. Выпустить серт (webroot):
   ```
   sudo docker run --rm \
     -v /var/www/seoshkin.com/certbot/conf:/etc/letsencrypt \
     -v /var/www/seoshkin.com/certbot/www:/var/www/certbot \
     certbot/certbot certonly --webroot -w /var/www/certbot \
     -d <домен> -d www.<домен> \
     --email sivtsov.pavel@gmail.com --agree-tos --no-eff-email --non-interactive
   ```
5. Раскомментировать 443-блок в `nginx/<домен>.conf`, `git push`, на сервере `git pull` +
   `docker exec ecosystem_router nginx -t && docker exec ecosystem_router nginx -s reload`.

## 🔮 Вывод проекта translate на свой сервер (в будущем)

Убрать монтирования translate/deutschlernen из шлюза seoshkin, поднять для translate
собственный reverse-proxy на 80/443 (свой certbot). Конфиги уже здесь, в репо — едут с
проектом. seoshkin остаётся чистым.

## 📌 TODO

- [ ] **Локальная разработка на `local.deutschlernen.ai`** — прописать в `/etc/hosts`
      `127.0.0.1 local.deutschlernen.ai` и добавить хост в `frontend/vite.config.js`
      (`server.allowedHosts`). Отдельный шаг, к проду не относится.

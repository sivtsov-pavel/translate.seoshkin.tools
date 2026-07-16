# Хендофф для Fable — независимые задачи (Deutsch Lernen)

> Проект: `/Users/pabloseoshkin/Klients/Projects/translate.seoshkin.tools` — German-learning PWA.
> Стек: **Fastify 4 + React 18/Vite + Zustand + PostgreSQL 16 (raw SQL) + Docker Compose**.
> Комментарии в коде — русский, имена переменных/функций — английский.
> i18n: 10 локалей `frontend/src/i18n/*.js`, доступ `useI18nStore().t.<section>.<key>`; контент через `getLessonTitle/getTranslation` (`utils/translation.js`).

## Деплой (проверяй сборку до пуша!)
```bash
cd frontend && npx vite build          # локальная проверка сборки
# затем:
git add … && git commit -m "…" && git push origin main
ssh gcloud-seosite "cd /home/seosite/translate && git pull --ff-only && \
  docker compose -f docker-compose.prod.yml build backend frontend && \
  docker compose -f docker-compose.prod.yml up -d backend frontend"
```
Миграции применяются на старте бэкенда автоматически (нумерованные SQL в `backend/src/db/migrations/`, следующий свободный номер — после `049`).
Если ставишь npm-пакет — делай `npm i` в `frontend`, коммить `package.json` + `package-lock.json` (Docker сам поставит на сервере; локально сборка упадёт без `npm i`).

## Правила
- Не трогать логику вне задачи. Никаких `git reset --hard`.
- Каждая задача — отдельный коммит, собирается без ошибок.
- Картинки (gpt-image-1) — платные: НЕ вызывать генерацию из клиента/ученика. Загрузка учителем своего файла — можно.

---

## Task 1 — Админ-фильтр «без картинок» в Словаре
**Зачем:** Павлу-админу видеть слова, которым не хватает картинок (необработанные фото).
**Файл:** `frontend/src/pages/Vocabulary.jsx` (данные из `api.get('/words')`, у слова есть `image_url`).
- Маленькая **круглая кнопка** (только для `user.role==='owner'`) с иконкой перечёркнутой картинки (например `🚫🖼️` или bootstrap-иконка `bi-image` с диагональю).
- Клик → показывать ТОЛЬКО слова где `!image_url`. Повторный клик — снять фильтр (тумблер, активное состояние подсвечено).
- Рядом счётчик, сколько таких слов.
- Проверь, что `/api/words` возвращает `image_url` (см. `backend/src/routes/words.js`); если нет — добавь поле в SELECT.

## Task 2 — Учитель: заменить картинку слова своей
**Зачем:** базовые картинки авто, а Павел вручную заливает свои «рисовашки».
- Бэкенд: роут `POST /api/words/:id/image` (owner-only), принимает файл (multipart, плагин `uploadPlugin` уже есть — см. `fastify.saveUploadedFile`), сохраняет в `/uploads/word-images/`, пишет путь в `words.image_url`. Пример сохранения картинок — `backend/src/services/imageGen.js` (`saveOptimizedImage`).
- Фронт: в Словаре (`Vocabulary.jsx`) и/или карточке слова — кнопка «🖼️ Заменить картинку» (owner-only) → выбор файла → загрузка → обновить превью.

## Task 3 — Печать набора упражнений на один лист (A4)
**Зачем:** учитель распечатывает каждому ученику лист с заданиями для урока.
- Новая страница-роут `frontend/src/pages/PrintSheet.jsx` + маршрут `/print/:lessonId` в `App.jsx`.
- Грузит упражнения набора: `api.get('/exercises/today?lesson_id=<id>')` (или отдельный эндпоинт всех упражнений урока).
- Рендерит **на одном A4-листе** (print CSS `@media print`, `@page { size: A4; margin: 12mm }`): задания типа **letter_fill** (вставь буквы: слово с пропущенными буквами) и **fill_blank** (вставь слово в предложение — берётся из реальных предложений набора). Плюс мелкий блок «слова урока».
- Кнопка «🖨️ Печать» (owner-only) на карточке набора (`Dashboard.jsx` `LessonCard`) → открывает `/print/:id` → `window.print()`.
- Всё компактно, ч/б-дружелюбно, влезает на один лист (≤10 слов из учебника).

## Task 4 — Экспорт документации в PDF
**Зачем:** выгрузить инструкции (учитель/ученик/как работает) в PDF.
- Страница документации: `frontend/src/pages/Docs.jsx` (маршрут `/docs`).
- Кнопка «⬇️ Скачать PDF» → печать в PDF через `window.print()` + print-CSS (без внешних libs) ИЛИ пакет `html2pdf.js` (тогда `npm i` во `frontend`, инлайн, без CDN — CSP запрещает внешние хосты).
- Раздельные разделы «Для учителя» / «Для ученика» / «Как работает».

---

Каждую задачу — отдельным коммитом и деплоем. По готовности отчитайся Павлу списком «сделано / где проверить».

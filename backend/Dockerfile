FROM node:20-alpine
WORKDIR /app
# poppler-utils → pdftoppm: конвертация PDF учебника в страницы-картинки
RUN apk add --no-cache poppler-utils
COPY package*.json ./
RUN npm ci --only=production
COPY src/ ./src/
# Скрипты обслуживания (аудит базы, разбор по наборам, разовые починки) запускаются
# на проде через `docker compose exec backend node scripts/...` — значит должны лежать
# в образе. Раньше их сюда не копировали, и каждый такой запуск падал с MODULE_NOT_FOUND.
COPY scripts/ ./scripts/
RUN mkdir -p /data/uploads
EXPOSE 8090
CMD ["node", "src/index.js"]

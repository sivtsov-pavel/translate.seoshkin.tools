FROM node:20-alpine
WORKDIR /app
COPY package*.json ./
RUN npm ci --only=production
COPY src/ ./src/
RUN mkdir -p /data/uploads
EXPOSE 8090
CMD ["node", "src/index.js"]

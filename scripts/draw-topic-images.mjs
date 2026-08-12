#!/usr/bin/env node
// Картинки к наборам фраз: рисует на НОУТБУКЕ, отдаёт на прод. Бесплатно.
//
// Отдельно от draw-images-worker.mjs намеренно: там картинка к СЛОВУ — один предмет
// по центру, детская флеш-карта. Здесь картинка к ТЕМЕ («Kochen») — бытовая сцена,
// как на образце Павла: человек готовит на кухне. Разные промпты и разные размеры,
// смешивать в одном скрипте — плодить условия в чужой рабочей механике.
//
// 💸 ДЕНЕГ НЕ ТРАТИТ: понятие переводит Ollama, рисует Draw Things — обе на ноутбуке.
//
//   caffeinate -i node scripts/draw-topic-images.mjs --dry     # список
//   caffeinate -i node scripts/draw-topic-images.mjs --limit 5 # первые пять
//   caffeinate -i node scripts/draw-topic-images.mjs           # все без картинок
//
// Требуется: запущенный Draw Things и Ollama, открытая крышка ноутбука.
import { mkdtempSync, readFileSync, rmSync } from 'fs'
import { tmpdir } from 'os'
import { join } from 'path'
import { execFileSync, spawn } from 'child_process'
import sharp from '../backend/node_modules/sharp/lib/index.js'
import { conceptToEnglish, generateImageLocally, localAiHealth } from '../backend/src/services/localAi.js'
import { config } from '../backend/src/config.js'

// Скрипт идёт с ноутбука, а не из докера: докерные хосты снаружи не существуют.
config.drawThingsUrl = config.drawThingsUrl.replace('host.docker.internal', 'localhost')
config.ollamaBaseUrl = config.ollamaBaseUrl.replace('host.docker.internal', 'localhost')

const args = process.argv.slice(2)
const argOf = (name, def = null) => { const i = args.indexOf(name); return i >= 0 ? args[i + 1] : def }
const limit = parseInt(argOf('--limit', '100'))
const dry = args.includes('--dry')
const ids = (argOf('--ids', '') || '').split(',').map(n => parseInt(n)).filter(Boolean)

// Сервер переехал: старый gcloud-seosite удаляется 20.08.2026 (см. CLAUDE.md)
const SSH_HOST = process.env.PROD_SSH_HOST || 'seoshkin-tools-core'
const PROD_DIR = process.env.PROD_DIR || '/home/seosite/translate'
const DC = `docker compose -f docker-compose.prod.yml`

const prodSql = (sql) => execFileSync('ssh', [SSH_HOST,
  `cd ${PROD_DIR} && ${DC} exec -T db psql -U german_app -d german_learning -t -A -c ` +
  JSON.stringify(sql.replace(/\s+/g, ' ').trim()),
], { encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 }).trim()

const pushFile = (localPath, remoteName) => execFileSync('ssh', [SSH_HOST,
  `cd ${PROD_DIR} && ${DC} exec -T backend sh -c ` +
  JSON.stringify(`mkdir -p /data/uploads/topic-images && cat > /data/uploads/topic-images/${remoteName}`),
], { input: readFileSync(localPath) })

// ── Что рисуем ────────────────────────────────────────────────────────────────
const where = ids.length ? `t.id = ANY(ARRAY[${ids.join(',')}]::int[])` : 't.image_url IS NULL'
const topics = JSON.parse(prodSql(`
  SELECT COALESCE(json_agg(row_to_json(x)), '[]') FROM (
    SELECT t.id, t.title, t.lang, t.level,
           (SELECT string_agg(p.text, ' | ') FROM (
              SELECT text FROM phrases WHERE topic_id = t.id ORDER BY position LIMIT 3) p) AS sample
    FROM phrase_topics t
    WHERE ${where}
    ORDER BY t.id LIMIT ${limit}) x`))

console.log(`Тем без картинки: ${topics.length}`)
if (!topics.length) { console.log('Делать нечего.'); process.exit(0) }
if (dry) {
  topics.forEach(t => console.log(`  ${t.id} ${t.title} [${t.level}] — ${t.sample || ''}`))
  process.exit(0)
}

const health = await localAiHealth()
if (!health.image) { console.error('❌ Draw Things не отвечает — запусти его на ноутбуке'); process.exit(1) }
if (!health.text) console.warn('⚠️ Ollama не отвечает: тему не переведём на английский, качество будет хуже')

// ── Туннель к прод-базе ───────────────────────────────────────────────────────
const password = execFileSync('ssh', [SSH_HOST,
  `grep -m1 '^POSTGRES_PASSWORD=' ${PROD_DIR}/.env | cut -d= -f2-`], { encoding: 'utf8' }).trim()
const { default: pg } = await import('../backend/node_modules/pg/lib/index.js')
// IP контейнера базы меняется при каждом пересоздании (был .2, стал .4) — зашитый
// адрес давал ECONNRESET на ровном месте. Спрашиваем адрес у самого docker.
const dbIp = execFileSync('ssh', [SSH_HOST,
  `docker inspect -f '{{range .NetworkSettings.Networks}}{{.IPAddress}} {{end}}' translate-db-1`],
  { encoding: 'utf8' }).trim().split(/\s+/)[0]
const tunnel = spawn('ssh', ['-N', '-L', `55433:${dbIp}:5432`, SSH_HOST], { stdio: 'ignore' })
await new Promise(r => setTimeout(r, 2500))
const db = new pg.Client({ host: '127.0.0.1', port: 55433, user: 'german_app', database: 'german_learning', password })
await db.connect()

const tmp = mkdtempSync(join(tmpdir(), 'topic-'))

// Промпт сцены, а не предмета: на образце Павла — человек за делом в обстановке темы.
// Горизонтальная картинка: на экране набора она идёт широкой полосой над списком фраз.
const scenePrompt = (concept) =>
  `A cheerful everyday scene: ${concept}. Warm flat vector illustration, friendly cartoon style, ` +
  `soft bright colors, clean thick outlines, cozy detailed background, wide horizontal composition, ` +
  `no text, no letters, no words`

let ok = 0, failed = 0
const started = Date.now()
try {
  for (const [i, t] of topics.entries()) {
    const t0 = Date.now()
    const eta = ok ? Math.round(((Date.now() - started) / ok) * (topics.length - i - 1) / 60000) : '?'
    process.stdout.write(`[${i + 1}/${topics.length}] ${t.title} … (осталось ~${eta} мин) `)
    try {
      // Немецкое название темы диффузионная модель понимает плохо и рисует надписи —
      // переводим в английское понятие, как это делается для слов.
      const concept = await conceptToEnglish(t.title, t.sample || t.title) || t.title
      const buf = await generateImageLocally(scenePrompt(concept))

      const base = `topic_${t.id}`
      await sharp(buf).resize(960, 540, { fit: 'cover' }).webp({ quality: 82 })
        .toFile(join(tmp, `${base}.webp`))
      pushFile(join(tmp, `${base}.webp`), `${base}.webp`)

      const url = `/uploads/topic-images/${base}.webp?v=${Date.now()}`
      await db.query('UPDATE phrase_topics SET image_url = $1 WHERE id = $2', [url, t.id])

      ok++
      console.log(`✓ ${concept} (${((Date.now() - t0) / 1000).toFixed(0)}s)`)
    } catch (e) {
      failed++
      console.log(`✗ ${e.message}`)
      if (/fetch failed|ECONNREFUSED|timeout/i.test(e.message)) {
        console.error('Локальный генератор недоступен — останавливаюсь. Запусти снова, продолжит с этого места.')
        break
      }
    }
  }
} finally {
  await db.end().catch(() => {})
  tunnel.kill()
  rmSync(tmp, { recursive: true, force: true })
}
console.log(`\nГотово: нарисовано ${ok}, ошибок ${failed}, потрачено $0. Время: ${((Date.now() - started) / 60000).toFixed(0)} мин`)

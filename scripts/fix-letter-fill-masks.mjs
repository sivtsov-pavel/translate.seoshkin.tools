#!/usr/bin/env node
// Починка нерешаемых упражнений «Добавь букву» на проде.
//
// Аудит 27.07.2026: 600 из 1894 (31.7%) масок невыполнимы — длина не сходится с ответом
// или открытые символы не совпадают («d_s W_st_r» при «das Wasser», «h___d__t» при
// «hundert»). Подставь букву — слово всё равно не сойдётся. Валидации при генерации
// не было ни в одном пути, поэтому брак уезжал прямо в базу. Код починен (letterFill.js),
// этот скрипт лечит УЖЕ НАКОПЛЕННЫЕ данные.
//
// 💸 ДЕНЕГ НЕ ТРАТИТ: маска строится детерминированно, ИИ не вызывается ни разу.
//
//   node scripts/fix-letter-fill-masks.mjs            # показать, что будет изменено
//   node scripts/fix-letter-fill-masks.mjs --apply    # записать в прод
//
import { execFileSync, spawn } from 'child_process'
import { isValidMask, buildMask } from '../backend/src/services/letterFill.js'

const apply = process.argv.includes('--apply')
const SSH_HOST = process.env.PROD_SSH_HOST || 'gcloud-seosite'
const PROD_DIR = process.env.PROD_DIR || '/home/seosite/translate'
const DB_IP = process.env.PROD_DB_IP || '172.19.0.2'
const PORT = 55432

function prodSql(sql) {
  return execFileSync('ssh', [SSH_HOST,
    `cd ${PROD_DIR} && docker compose -f docker-compose.prod.yml exec -T db ` +
    `psql -U german_app -d german_learning -t -A -c ${JSON.stringify(sql.replace(/\s+/g, ' ').trim())}`,
  ], { encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 }).trim()
}

// ── Что чиним ─────────────────────────────────────────────────────────────────
const rows = JSON.parse(prodSql(`
  SELECT COALESCE(json_agg(row_to_json(t)), '[]') FROM (
    SELECT e.id, e.lesson_id, e.payload->>'masked' AS masked,
           COALESCE(e.payload->>'answer', e.payload->>'word_de') AS answer
    FROM exercises e WHERE e.type = 'letter_fill') t`))

const broken = rows.filter(r => !isValidMask(r.masked, r.answer))
const fixes = []
const hopeless = []
for (const r of broken) {
  const masked = buildMask(r.answer)
  if (masked && isValidMask(masked, r.answer)) fixes.push({ ...r, masked })
  else hopeless.push(r)
}

console.log(`Всего letter_fill: ${rows.length}`)
console.log(`Нерешаемых: ${broken.length} (${(broken.length / rows.length * 100).toFixed(1)}%)`)
console.log(`Чинится: ${fixes.length}, не чинится: ${hopeless.length}`)
for (const h of hopeless.slice(0, 10)) console.log(`  ✗ ${h.id}: «${h.answer}» — маскировать нечего`)

if (!apply) {
  console.log('\nПримеры починки:')
  for (const f of fixes.slice(0, 15)) console.log(`  ${f.id}: "${f.masked}" ← было "${f.masked === null ? '' : rows.find(r => r.id === f.id).masked}" (ответ «${f.answer}»)`)
  console.log(`\nЭто пробный прогон. Записать: --apply`)
  process.exit(0)
}

// ── Запись через ssh-туннель (порт наружу не публикуется) ─────────────────────
const password = prodSql(`SELECT 1`) && execFileSync('ssh', [SSH_HOST,
  `grep -m1 '^POSTGRES_PASSWORD=' ${PROD_DIR}/.env | cut -d= -f2-`], { encoding: 'utf8' }).trim()

// Файл отката: старые маски с id — вернуть можно точечно, без разворачивания дампа.
const { writeFileSync } = await import('fs')
const rollback = `letter-fill-rollback-${rows.length}-${fixes.length}.json`
writeFileSync(rollback, JSON.stringify(
  fixes.map(f => ({ id: f.id, masked: rows.find(r => r.id === f.id).masked })), null, 1))
console.log(`Откат сохранён: ${rollback}`)

const { default: pg } = await import('../backend/node_modules/pg/lib/index.js')
const tunnel = spawn('ssh', ['-N', '-L', `${PORT}:${DB_IP}:5432`, SSH_HOST], { stdio: 'ignore' })
await new Promise(r => setTimeout(r, 2500))

const client = new pg.Client({ host: '127.0.0.1', port: PORT, user: 'german_app', database: 'german_learning', password })
try {
  await client.connect()
  let n = 0
  for (const f of fixes) {
    // Меняем ТОЛЬКО поле masked, остальной payload не трогаем.
    await client.query(
      `UPDATE exercises SET payload = jsonb_set(payload, '{masked}', to_jsonb($1::text)) WHERE id = $2`,
      [f.masked, f.id])
    n++
  }
  console.log(`Обновлено: ${n}`)
} finally {
  await client.end().catch(() => {})
  tunnel.kill()
}

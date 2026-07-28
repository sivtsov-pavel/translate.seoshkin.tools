#!/usr/bin/env node
// Воркер картинок: рисует на НОУТБУКЕ, отдаёт на ПРОД. Бесплатно.
//
// Почему так, а не «прод рисует сам»: сервер Google физически не видит твой ноутбук.
// Чтобы он видел, ноут пришлось бы выставить в интернет через туннель — тогда домашний
// интернет становится частью продакшена, а закрытая крышка ломает генерацию на сайте.
// Здесь наоборот: ноут САМ ходит за работой. Наружу ничего не открываем, ноут уснул —
// просто ничего не произошло, следующий запуск продолжит с того же места.
//
// 💸 ДЕНЕГ НЕ ТРАТИТ: понятие переводит Ollama, рисует Draw Things — обе на ноутбуке.
// Платный gpt-image-1 не вызывается ни разу (он стоит ~4¢ за штуку — на 2737 слов >100$).
//
// Ночной запуск (caffeinate не даёт ноуту уснуть, пока идёт работа):
//   caffeinate -i node scripts/draw-images-worker.mjs --limit 200
//
// Режимы:
//   --mode missing  (по умолчанию) слова вообще без картинки
//   --mode photos   заменить фото Unsplash (.jpg) на рисовашки
// Фильтры: --lang de|es|...   --limit N   --dry (только показать список)
//
import { mkdtempSync, readFileSync, rmSync } from 'fs'
import { tmpdir } from 'os'
import { join } from 'path'
import { execFileSync, spawn } from 'child_process'
import { conceptToEnglish, generateImageLocally, localAiHealth } from '../backend/src/services/localAi.js'
import { saveOptimizedImage } from '../backend/src/services/imageOptimize.js'
import { config } from '../backend/src/config.js'
import { isFunctionWord } from '../backend/src/services/imageGen.js'

// Скрипт запускается НА МАКЕ, а не в докере. Дефолты в config.js — докерные
// (host.docker.internal): снаружи контейнера такого хоста нет, и запрос падает с
// «Draw Things не отвечает». Правим сам config, а не process.env: импорты выполняются
// раньше любого кода, к этому моменту config уже прочитал переменные окружения.
config.drawThingsUrl = config.drawThingsUrl.replace('host.docker.internal', 'localhost')
config.ollamaBaseUrl = config.ollamaBaseUrl.replace('host.docker.internal', 'localhost')

const args = process.argv.slice(2)
const argOf = (name, def = null) => { const i = args.indexOf(name); return i >= 0 ? args[i + 1] : def }
const mode = argOf('--mode', 'missing')
const lang = argOf('--lang', null)
const limit = parseInt(argOf('--limit', '50'))
const dry = args.includes('--dry')

const SSH_HOST = process.env.PROD_SSH_HOST || 'gcloud-seosite'
const PROD_DIR = process.env.PROD_DIR || '/home/seosite/translate'
const DC = `docker compose -f docker-compose.prod.yml`

function prodSql(sql) {
  return execFileSync('ssh', [SSH_HOST,
    `cd ${PROD_DIR} && ${DC} exec -T db psql -U german_app -d german_learning -t -A -c ` +
    JSON.stringify(sql.replace(/\s+/g, ' ').trim()),
  ], { encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 }).trim()
}

// Кладём файл в том с картинками на проде: читаем со stdin прямо внутри контейнера,
// без промежуточных копий на диске сервера.
function pushFile(localPath, remoteName) {
  execFileSync('ssh', [SSH_HOST,
    `cd ${PROD_DIR} && ${DC} exec -T backend sh -c ` +
    JSON.stringify(`mkdir -p /data/uploads/word-images && cat > /data/uploads/word-images/${remoteName}`),
  ], { input: readFileSync(localPath) })
}

// ── Что рисуем ────────────────────────────────────────────────────────────────
// Считаем и обновляем ПО СЛОВУ, а не по строке таблицы. Одно и то же слово лежит в базе
// несколько раз (пришло из разных уроков), и словарь показывает лишь один экземпляр —
// тот же дедуп, что в /api/words. Отсюда две ошибки, если работать построчно:
//   • объём завышен (в немецком 151 строка против 83 слов в словаре — 68 лишних часов работы);
//   • перерисовали одну строку, а словарь показывает другую — старое фото на месте.
// Ключ дедупа — как в словаре: без артикля, регистр первой буквы значим.
const B = `regexp_replace(w.word_de, '^(der|die|das|ein|eine|el|la|los|las|the)\\s+', '', 'i')`
const KEY = `(left(${B}, 1) || lower(substr(${B}, 2)))`
const langFilter = lang ? `AND l.target_lang = '${lang.replace(/[^a-z]/gi, '')}'` : ''
// .jpg = фото Unsplash, .webp = рисунок ИИ. Маркер простой и точный (см. HANDOFF_LOCAL_AI.md).
const groupFilter = mode === 'photos'
  ? `drawn = 0 AND with_img > 0`      // есть только фото — заменяем на рисовашку
  : mode === 'align'
    // Есть рисовашка И есть экземпляры вообще без картинки. Слова с фото сюда не попадают:
    // заменять фото — дело режима photos, а не выравнивания.
    ? `drawn > 0 AND n > with_img`
    : `with_img = 0`                  // нет картинки вообще ни у одного экземпляра

const rows = JSON.parse(prodSql(`
  WITH k AS (
    SELECT w.id, w.word_de, w.translation_ru, w.created_at, l.target_lang, l.id AS lesson_id,
           ${KEY} AS kkey,
           COALESCE(w.image_url, (SELECT e.image_url FROM exercises e
             WHERE e.word_id = w.id AND e.image_url IS NOT NULL LIMIT 1)) AS img
    FROM words w JOIN lessons l ON l.id = w.lesson_id
    WHERE TRUE ${langFilter}
  ), g AS (
    SELECT kkey, min(id) AS lead_id, array_agg(id) AS ids, count(*) AS n,
           count(*) FILTER (WHERE img ILIKE '%.webp%') AS drawn,
           count(*) FILTER (WHERE img IS NOT NULL) AS with_img,
           (array_agg(img) FILTER (WHERE img ILIKE '%.webp%'))[1] AS drawn_url
    FROM k GROUP BY kkey
  )
  SELECT COALESCE(json_agg(row_to_json(t)), '[]') FROM (
    SELECT k.id, k.word_de, k.translation_ru, k.target_lang, k.lesson_id, g.ids, g.drawn_url
    FROM g JOIN k ON k.id = g.lead_id
    WHERE ${groupFilter}
    ORDER BY k.id LIMIT ${limit}) t`))

// Служебные слова (предлоги, артикли, числа) иллюстрировать бессмысленно — тот же фильтр,
// что и в боевой генерации. Но в режиме align мы ничего не рисуем, а раздаём уже готовую
// картинку дублям — там фильтр не нужен: раз рисовашка есть, пусть будет у всех экземпляров.
const todo = mode === 'align' ? rows : rows.filter(r => !isFunctionWord(r.word_de))
const verb = mode === 'align' ? 'к выравниванию' : 'к рисованию'
console.log(`Режим «${mode}»${lang ? `, язык ${lang}` : ''}: кандидатов ${rows.length}, ${verb} ${todo.length}`)
if (!todo.length) { console.log('Делать нечего.'); process.exit(0) }
if (dry) {
  todo.forEach(r => console.log(`  ${r.id} ${r.word_de} — ${r.translation_ru}`))
  process.exit(0)
}

// ── Режим align: рисовать не нужно, локальные службы не требуются ────────────
// Одно и то же слово лежит в базе несколько раз (пришло из разных уроков). Если рисовашка
// есть хотя бы у одного экземпляра — раздаём её остальным: в словаре слово и так покажется
// с картинкой (дедуп выбирает экземпляр с картинкой), а вот во флеш-карте урока картинка
// берётся по конкретному word_id — и у дубля её не было. Операция бесплатная, без ИИ.
const health = mode === 'align' ? { text: true, image: true } : await localAiHealth()
if (!health.image) { console.error('❌ Draw Things не отвечает — запусти его на ноутбуке'); process.exit(1) }
if (!health.text) console.warn('⚠️ Ollama не отвечает: понятие не переведём на английский, качество будет хуже')

// ── Туннель к прод-базе (порт наружу не публикуется) ──────────────────────────
const password = execFileSync('ssh', [SSH_HOST,
  `grep -m1 '^POSTGRES_PASSWORD=' ${PROD_DIR}/.env | cut -d= -f2-`], { encoding: 'utf8' }).trim()
const { default: pg } = await import('../backend/node_modules/pg/lib/index.js')
const tunnel = spawn('ssh', ['-N', '-L', '55432:172.19.0.2:5432', SSH_HOST], { stdio: 'ignore' })
await new Promise(r => setTimeout(r, 2500))
const db = new pg.Client({ host: '127.0.0.1', port: 55432, user: 'german_app', database: 'german_learning', password })
await db.connect()

// Пишем в тот же журнал операций, что и приложение, — утром всё видно в админке.
const logOp = (f) => db.query(
  `INSERT INTO operation_log (lesson_id, kind, provider, model, status, message, items, duration_ms, cost_usd, meta)
   VALUES ($1,'image','local','draw-things',$2,$3,$4,$5,0,$6)`,
  [f.lessonId ?? null, f.status, f.message ?? null, f.items ?? null, f.durationMs ?? null,
    JSON.stringify(f.meta || {})]).catch(e => console.error('  журнал:', e.message))

// Картинки сохраняем во временную папку — config.uploadDir указывает на прод-путь,
// которого на ноутбуке нет.
const tmp = mkdtempSync(join(tmpdir(), 'draw-'))
config.uploadDir = tmp

const localPrompt = (c) => `A ${c}, simple cheerful flat vector illustration for a children flashcard, cute minimalist cartoon, bright friendly colors, plain light background, one centered object, thick clean outlines, kindergarten style`

let ok = 0, failed = 0
const started = Date.now()
try {
  for (const [i, w] of todo.entries()) {
    const t0 = Date.now()
    const left = todo.length - i - 1
    const eta = ok ? Math.round(((Date.now() - started) / ok) * left / 60000) : '?'
    process.stdout.write(`[${i + 1}/${todo.length}] ${w.word_de} … (осталось ~${eta} мин) `)
    try {
      if (mode === 'align') {
        // ТОЛЬКО реально пустым. Раньше условие было «у кого нет рисовашки», под него
        // попадали слова с фото Unsplash — и выравнивание молча заменяло фото рисовашкой
        // (5 слов, замечено Павлом). Замена фото — это осознанное действие, у него свой
        // режим --mode photos; выравнивание должно лишь заполнять пустоту.
        await db.query('UPDATE words SET image_url = $1 WHERE id = ANY($2::int[]) AND image_url IS NULL',
          [w.drawn_url, w.ids])
        await logOp({ lessonId: w.lesson_id, status: 'ok', items: 1, durationMs: Date.now() - t0,
          message: 'выравнивание дублей (без генерации)', meta: { word_de: w.word_de, word_id: w.id, mode } })
        ok++; console.log('✓ выровнено')
        continue
      }
      // Русский концепт диффузионная модель не понимает и рисует НАДПИСЬ («стол» → буквы «СТОЛ»).
      const concept = await conceptToEnglish(w.translation_ru, w.word_de)
        || String(w.word_de).replace(/^(der|die|das|ein|eine|el|la|los|las|the)\s+/i, '').trim()
      const buf = await generateImageLocally(localPrompt(concept))
      const url = await saveOptimizedImage(buf, w.id)   // делает word_<id>.webp и _sm.webp

      pushFile(join(tmp, 'word-images', `word_${w.id}.webp`), `word_${w.id}.webp`)
      pushFile(join(tmp, 'word-images', `word_${w.id}_sm.webp`), `word_${w.id}_sm.webp`)
      // Обновляем ВСЕ экземпляры слова (w.ids), а не только тот, по которому рисовали:
      // иначе словарь покажет соседний дубль со старым фото. Кэш-бастер — имя файла прежнее.
      await db.query('UPDATE words SET image_url = $1 WHERE id = ANY($2::int[])',
        [`${url}?v=${Date.now()}`, w.ids])

      const ms = Date.now() - t0
      await logOp({ lessonId: w.lesson_id, status: 'ok', items: 1, durationMs: ms,
        message: `концепт: ${concept}`, meta: { word_de: w.word_de, word_id: w.id, mode } })
      ok++
      console.log(`✓ ${concept} (${(ms / 1000).toFixed(0)}s)`)
    } catch (e) {
      failed++
      await logOp({ lessonId: w.lesson_id, status: 'error', durationMs: Date.now() - t0,
        message: e.message, meta: { word_de: w.word_de, word_id: w.id, mode } })
      console.log(`✗ ${e.message}`)
      // Draw Things мог закрыться / ноут уснул — дальше рисовать смысла нет.
      if (/fetch failed|ECONNREFUSED|timeout/i.test(e.message)) {
        console.error('Локальный генератор недоступен — останавливаюсь. Запусти скрипт снова, продолжит с этого места.')
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

import { join } from 'path'
import { config } from '../config.js'
import { db } from '../db/index.js'
import { extractFromPhoto, mergeLesson, generateExercises, generateLessonMeta, enrichWords, translateWordsToAllLangs, translateExercisePayloads, translateLessonMeta, groupWordsByTheme, classifyWordsToThemes, CORE_EXERCISE_TYPES, usage, resetUsage, usageCostUSD } from './claude.js'
import { transcribeAudio } from './whisper.js'
import { fetchImageUrl, downloadAndSave } from './unsplash.js'
import { generateWordImage, isFunctionWord } from './imageGen.js'
import { getOwnerClient, ownerHasOwnKey } from './openaiClient.js'
import { logOperation, textProvider } from './opLog.js'
import { normalizeIncomingWord } from './wordNormalize.js'
import { bareWord, articlePattern } from './articles.js'
import { auditLesson } from './lessonAudit.js'

// Сопоставление сгенерированного word_de со словом урока: GPT иногда возвращает слово
// без артикля или в другом регистре → точное совпадение промахивается и упражнение
// повисает с word_id = NULL. Карта держит и точный, и нормализованный ключ.
const wordKeyNorm = (s) => String(s || '').toLowerCase().replace(/^(der|die|das|ein|eine|el|la|los|las|the)\s+/, '').trim()
function buildWordMap(rows) {
  const map = Object.create(null)
  for (const w of rows) { const k = wordKeyNorm(w.word_de); if (!(k in map)) map[k] = w.id }
  for (const w of rows) if (!(w.word_de in map)) map[w.word_de] = w.id
  return map
}
const wordIdFor = (map, wordDe) => map[wordDe] ?? map[wordKeyNorm(wordDe)] ?? null

// К какому скану (lesson_media) относится слово — ищем в извлечениях по каждому фото.
// pairs: [{ mediaId, extraction }]. Совпадение по слову (без артикля, регистронезависимо).
function mediaIdForWord(wordDe, pairs) {
  const norm = s => String(s || '').toLowerCase().replace(/^(der|die|das|ein|eine)\s+/, '').trim()
  const t = norm(wordDe)
  for (const p of pairs) {
    const ws = p.extraction?.words || []
    if (ws.some(w => norm(w.word_de) === t)) return p.mediaId || null
  }
  return null
}

// «Нарисовать недостающие»: детсадовские ИИ-картинки для слов урока без фото.
// Служебные слова (предлоги/артикли/местоимения/числа) пропускаем — им картинка не нужна.
export async function drawLessonImages(lessonId) {
  const lrow = (await db.query('SELECT owner_id, target_lang FROM lessons WHERE id=$1', [lessonId])).rows[0]
  const targetLang = lrow?.target_lang || 'de'
  const client = await getOwnerClient(lrow?.owner_id) // ключ владельца или платформенный
  const { rows } = await db.query('SELECT id, word_de, translation_ru FROM words WHERE lesson_id=$1 AND image_url IS NULL ORDER BY id', [lessonId])
  const target = rows.filter(w => !isFunctionWord(w.word_de))
  let done = 0
  for (const w of target) {
    await setProgress(lessonId, `Рисую картинки ${done + 1}/${target.length}...`)
    try {
      // Банк слов: переиспользуем существующую картинку такого же слова (0 затрат)
      const existing = await findExistingWordImage(w.word_de, w.translation_ru, targetLang, w.id)
      if (existing) { await db.query('UPDATE words SET image_url=$1 WHERE id=$2', [existing, w.id]); done++; continue }
      const url = await generateWordImage(w.word_de, w.translation_ru, w.id, targetLang, client, { lessonId })
      if (url) { await db.query('UPDATE words SET image_url=$1 WHERE id=$2', [url, w.id]); done++ }
    } catch (e) { console.error('drawLessonImages', w.word_de, e.message) }
  }
  return done
}

// Уже принятые написания слов этого языка — эталон для сверки новых.
// Берём один раз на обработку урока: слов тысячи, дёргать базу на каждое слово дорого.
async function knownWordsFor(targetLang) {
  try {
    const { rows } = await db.query(
      `SELECT DISTINCT w.word_de FROM words w JOIN lessons l ON l.id = w.lesson_id
       WHERE l.target_lang = $1 AND w.word_de IS NOT NULL`, [targetLang])
    return rows.map(r => r.word_de)
  } catch (e) { console.error('knownWordsFor:', e.message); return [] }
}

// Проверка урока сразу после генерации: непроходимые упражнения, слова без полного
// набора, текст не на языке курса. Отчёт уходит в журнал операций (Админ → 📜 Журнал),
// чтобы учитель видел качество материала, а не узнавал о браке от ученика.
// Никогда не роняет обработку: аудит — это наблюдение, а не часть генерации.
export async function auditLessonAndLog(lessonId, userId = null) {
  try {
    const [{ rows: exercises }, { rows: words }] = await Promise.all([
      db.query(`SELECT e.id, e.type, e.payload, e.word_id, l.target_lang
                FROM exercises e JOIN lessons l ON l.id = e.lesson_id WHERE e.lesson_id = $1`, [lessonId]),
      db.query(`SELECT w.id, w.word_de, l.target_lang
                FROM words w JOIN lessons l ON l.id = w.lesson_id WHERE w.lesson_id = $1`, [lessonId]),
    ])
    const r = auditLesson({ exercises, words })
    await logOperation({
      kind: 'audit', lessonId, userId, provider: 'none',
      status: r.blockers.length ? 'error' : 'ok',
      message: r.summary,
      items: r.blockers.length + r.warns.length + r.uncovered.length,
      meta: {
        blockers: r.blockers.slice(0, 20),
        warns: r.warns.slice(0, 20),
        uncovered: r.uncovered.slice(0, 20).map(w => w.word_de),
      },
    })
    return r
  } catch (e) {
    console.error('auditLessonAndLog:', e.message)
    return null
  }
}

async function setProgress(lessonId, text) {
  await db.query('UPDATE lessons SET progress = $1 WHERE id = $2', [text, lessonId])
}

// Обёртка «замерь и запиши в журнал» для шагов, которые тратят деньги или могут упасть.
// Считает реальную цену через счётчик токенов (usage) — в журнале видно, во сколько
// обошёлся конкретный разбор фото или пачка переводов, а не общая сумма за день.
// Журнал никогда не ломает работу: ошибку пробрасываем как есть, запись — best effort.
async function tracked({ kind, lessonId, items = null, message = null, meta = {} }, fn) {
  const t0 = Date.now()
  resetUsage()
  const provider = textProvider()
  const model = provider === 'local' ? config.ollamaModel : Object.keys(usage.byModel)[0] || null
  try {
    const result = await fn()
    await logOperation({
      kind, lessonId, provider, items, message, meta,
      model: provider === 'local' ? config.ollamaModel : (Object.keys(usage.byModel)[0] || model),
      status: 'ok', durationMs: Date.now() - t0,
      costUsd: provider === 'local' ? 0 : usageCostUSD(),
    })
    return result
  } catch (e) {
    await logOperation({
      kind, lessonId, provider, model, meta,
      status: 'error', message: e.message, durationMs: Date.now() - t0,
      costUsd: provider === 'local' ? 0 : usageCostUSD(),
    })
    throw e
  }
}

// Сохранить реальные предложения урока (из учебника/тетради/доски) — источник упражнений.
// Дедуп по тексту в рамках урока. Служебные пустые/короткие обрывки пропускаем.
async function saveSentences(lessonId, sentences, source) {
  if (!Array.isArray(sentences)) return
  for (const s of sentences) {
    const text = (typeof s === 'string' ? s : s?.text || '').trim()
    if (!text || text.length < 4) continue
    const tr = (typeof s === 'object' && s) ? (s.translation_ru || null) : null
    await db.query(
      `INSERT INTO lesson_sentences (lesson_id, text, translation_ru, source)
       SELECT $1, $2, $3, $4
       WHERE NOT EXISTS (SELECT 1 FROM lesson_sentences WHERE lesson_id = $1 AND lower(text) = lower($2))`,
      [lessonId, text, tr, source])
  }
}

// Реальные предложения урока — для генерации упражнений из них
async function getLessonSentences(lessonId) {
  const { rows } = await db.query('SELECT text FROM lesson_sentences WHERE lesson_id = $1 ORDER BY id', [lessonId])
  return rows.map(r => r.text)
}

// «Перераспределить»: разбить урок на тематические под-уроки (14 → 14.1, 14.2, …).
// Исходный урок остаётся как есть («книга»); под-уроки — отдельные тематические наборы
// из его слов. Слова копируются С картинками и переводами (без затрат OpenAI на них),
// упражнения генерируются заново из слов + релевантных предложений.
export async function redistributeLesson(lessonId) {
  try {
    const { rows: lr } = await db.query(
      'SELECT owner_id, course_id, target_lang, lesson_number, title FROM lessons WHERE id=$1', [lessonId])
    const L = lr[0]
    if (!L) return
    const client = await getOwnerClient(L.owner_id) // ключ владельца или платформенный
    await setProgress(lessonId, 'Разбиваю урок на темы...')
    const { rows: words } = await db.query(
      'SELECT id, word_de, translation_ru, example_sentence, image_url, translations, source, media_id FROM words WHERE lesson_id=$1 ORDER BY id', [lessonId])
    if (words.length < 4) { await db.query("UPDATE lessons SET progress='Мало слов для разбивки (нужно ≥4)' WHERE id=$1", [lessonId]); return }

    const groups = await groupWordsByTheme(words, L.target_lang, client)
    if (!groups.length) { await db.query("UPDATE lessons SET progress='Не удалось разбить на темы' WHERE id=$1", [lessonId]); return }

    const base = (String(L.title || '').match(/(\d+)/) || [])[1] || L.lesson_number || lessonId
    const { rows: sents } = await db.query('SELECT text, translation_ru, source FROM lesson_sentences WHERE lesson_id=$1', [lessonId])
    const wById = Object.fromEntries(words.map(w => [w.id, w]))
    const norm = s => String(s || '').toLowerCase().replace(/^(der|die|das|ein|eine)\s+/, '').trim()

    let n = 0
    for (const g of groups) {
      const gw = (g.word_ids || []).map(id => wById[id]).filter(Boolean)
      if (!gw.length) continue
      n++
      await setProgress(lessonId, `Создаю набор ${n}/${groups.length}: ${g.title}...`)
      const { rows: nl } = await db.query(
        `INSERT INTO lessons (owner_id, title, course_id, lesson_number, target_lang, parent_lesson_id, status, progress)
         VALUES ($1,$2,$3,$4,$5,$6,'processing','Готовлю набор...') RETURNING id`,
        [L.owner_id, `Урок ${base}.${n} — ${g.title}`, L.course_id, L.lesson_number, L.target_lang, lessonId])
      const newId = nl[0].id

      // Копируем слова (картинки/переводы переносятся как есть — без затрат)
      for (const w of gw) {
        await db.query(
          `INSERT INTO words (lesson_id, user_id, word_de, translation_ru, example_sentence, image_url, translations, source, media_id)
           VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9) ON CONFLICT (lesson_id, word_de) DO NOTHING`,
          [newId, L.owner_id, w.word_de, w.translation_ru, w.example_sentence, w.image_url, w.translations, w.source, w.media_id])
      }
      // Копируем релевантные предложения (где встречается слово группы)
      for (const s of sents) {
        const low = String(s.text || '').toLowerCase()
        if (gw.some(w => low.includes(norm(w.word_de)))) {
          await saveSentences(newId, [{ text: s.text, translation_ru: s.translation_ru }], s.source || 'textbook')
        }
      }
      // Упражнения из слов набора + его предложений
      const { rows: nw } = await db.query('SELECT id, word_de, translation_ru, example_sentence FROM words WHERE lesson_id=$1 ORDER BY id', [newId])
      const exercises = await generateExercises(nw, [], L.target_lang, await getLessonSentences(newId), client)
      const wordMap = buildWordMap(nw)
      for (const ex of exercises) {
        await db.query('INSERT INTO exercises (lesson_id, word_id, type, payload) VALUES ($1,$2,$3,$4)',
          [newId, wordIdFor(wordMap, ex.word_de), ex.type, JSON.stringify(ex.payload)])
      }
      for (const w of nw) {
        const p = JSON.stringify({ word_de: w.word_de, translation_ru: w.translation_ru })
        await db.query('INSERT INTO exercises (lesson_id, word_id, type, payload) VALUES ($1,$2,$3,$4)', [newId, w.id, 'dictation', p])
        await db.query('INSERT INTO exercises (lesson_id, word_id, type, payload) VALUES ($1,$2,$3,$4)', [newId, w.id, 'speech', p])
      }
      await enrichLesson(newId) // переводы упражнений/заголовка (слова и картинки уже есть → пропустит)
      await db.query("UPDATE lessons SET status='done', progress=$1 WHERE id=$2", [`Готово! Слов: ${nw.length}`, newId])
    }
    await db.query("UPDATE lessons SET progress=$1 WHERE id=$2", [`Разбито на ${n} тематических набора`, lessonId])
  } catch (e) {
    console.error('redistributeLesson:', e.message)
    await db.query("UPDATE lessons SET progress=$1 WHERE id=$2", [String(e.message).slice(0, 100), lessonId])
  }
}

// «Обработать всё»: докидываем недостающее для урока — переводы/примеры слов, картинки,
// переводы слов и упражнений на все языки. НЕ трогает упражнения и прогресс ученика.
// Вызывается в конце обработки и по кнопке «Обработать всё» для готового урока.
// Активные родные локали для целевого языка (из супер-админки). Для испанского —
// только те, что учитель включил (напр. ru+es), чтобы не переводить и не тратить на лишние.
const ALL_LOCALES = ['ru', 'uk', 'de', 'en', 'bg', 'tr', 'ar', 'es', 'fr', 'sq']
async function getActiveLocales(targetLang) {
  try {
    const { rows } = await db.query("SELECT config #> $1 AS l FROM platform_settings WHERE id=1", [['targetLocales', targetLang]])
    const l = rows[0]?.l
    if (Array.isArray(l) && l.length) return l
  } catch { /* нет настройки — все */ }
  return ALL_LOCALES
}

// «Банк слов» (фаза 1): если такое же слово (без артикля, регистронезависимо) уже имеет
// картинку/переводы в другом уроке того же изучаемого языка — переиспользуем, не тратим OpenAI.
const WORD_MATCH = `regexp_replace(lower(w.word_de),'^(der|die|das|ein|eine)\\s+','')=regexp_replace(lower($1),'^(der|die|das|ein|eine)\\s+','')`
async function findExistingWordImage(wordDe, translationRu, targetLang, excludeId = 0) {
  // Картинка = смысл, не зависит от языка. Ищем по переводу (значению) среди ЛЮБЫХ языков —
  // картинка дома одна на нем./исп./фр. Картинки теперь без текста, поэтому шарятся.
  const tr = String(translationRu || '').trim().toLowerCase()
  if (tr.length > 1) {
    const { rows } = await db.query(
      `SELECT image_url FROM words WHERE lower(trim(translation_ru))=$1 AND image_url IS NOT NULL AND id<>$2 LIMIT 1`,
      [tr, excludeId])
    if (rows[0]?.image_url) return rows[0].image_url
  }
  // Фолбэк: точное слово того же изучаемого языка
  const { rows } = await db.query(
    `SELECT w.image_url FROM words w JOIN lessons l ON l.id=w.lesson_id
     WHERE ${WORD_MATCH} AND l.target_lang=$2 AND w.image_url IS NOT NULL AND w.id<>$3 LIMIT 1`,
    [wordDe, targetLang, excludeId])
  return rows[0]?.image_url || null
}
async function findExistingTranslations(wordDe, targetLang, excludeId = 0) {
  const { rows } = await db.query(
    `SELECT w.translations FROM words w JOIN lessons l ON l.id=w.lesson_id
     WHERE ${WORD_MATCH} AND l.target_lang=$2 AND w.translations IS NOT NULL AND (w.translations ? 'sq') AND w.id<>$3 LIMIT 1`,
    [wordDe, targetLang, excludeId])
  return rows[0]?.translations || null
}

// Платформенный ключ OpenAI на генерацию картинок использует только супер-админ (Павел).
// Другой учитель генерит свои картинки за свой счёт, добавив свой ключ OpenAI в настройках
// (см. ownerHasOwnKey). Без ключа чужим авто-генерация недоступна — только банк слов (бесплатно).
const IMAGE_GEN_OWNER_ID = 1

export async function enrichLesson(lessonId) {
  const lrow = (await db.query('SELECT owner_id, target_lang FROM lessons WHERE id=$1', [lessonId])).rows[0] || {}
  const targetLang = lrow.target_lang || 'de'
  const client = await getOwnerClient(lrow.owner_id) // ключ владельца или платформенный
  // Платная авто-генерация картинок: супер-админ (платформенный ключ) ИЛИ учитель со своим ключом OpenAI.
  const canGenImages = lrow.owner_id === IMAGE_GEN_OWNER_ID || await ownerHasOwnKey(lrow.owner_id)
  const activeLocales = await getActiveLocales(targetLang) // напр. ['ru','es'] для испанского
  // 1) Переводы + примеры для неполных слов урока
  try {
    const { rows } = await db.query(
      `SELECT id, word_de, translation_ru FROM words
       WHERE lesson_id = $1 AND (example_sentence IS NULL OR word_de = translation_ru) ORDER BY id`, [lessonId])
    for (let i = 0; i < rows.length; i += 20) {
      const res = await enrichWords(rows.slice(i, i + 20), client)
      for (const r of res) {
        if (!r) continue
        await db.query(
          `UPDATE words SET translation_ru = CASE WHEN word_de = translation_ru THEN $1 ELSE translation_ru END,
             example_sentence = COALESCE(example_sentence, $2), example_sentence_ru = COALESCE(example_sentence_ru, $3) WHERE id = $4`,
          [r.translation_ru, r.example_sentence, r.example_sentence_ru, r.id])
      }
    }
  } catch (e) { console.error('enrichLesson words:', e.message) }

  // 2) Картинки для слов урока — НАШИ детские рисунки (gpt-image-1). Unsplash отключён.
  //    Режим авто/вручную — из супер-админки (features.autoImages). Вручную → пропускаем
  //    (учитель нарисует кнопкой). Служебные слова всегда пропускаем (им картинка не нужна).
  try {
    const { rows: ps } = await db.query("SELECT config->'features'->>'autoImages' AS ai FROM platform_settings WHERE id=1")
    const autoImages = ps[0]?.ai !== 'false' // по умолчанию авто; управляет ТОЛЬКО платной генерацией
    await setProgress(lessonId, 'Подбираю картинки...')
    const { rows } = await db.query('SELECT id, word_de, translation_ru FROM words WHERE lesson_id = $1 AND image_url IS NULL ORDER BY id', [lessonId])
    for (const w of rows) {
      if (isFunctionWord(w.word_de, targetLang)) continue
      try {
        // Банк слов: уже есть картинка такого же слова → переиспользуем ВСЕГДА (0 затрат, всем,
        // независимо от тумблера авто-генерации — иначе после перераспределения слова, у которых
        // картинка есть в банке, остаются пустыми). Правило Павла: есть в банке → берём оттуда.
        const existing = await findExistingWordImage(w.word_de, w.translation_ru, targetLang, w.id)
        if (existing) { await db.query('UPDATE words SET image_url = $1 WHERE id = $2', [existing, w.id]); continue }
        // Платная генерация (gpt-image-1) — только при вкл. авто И доступе (супер-админ / свой ключ).
        if (!autoImages || !canGenImages) continue
        const url = await generateWordImage(w.word_de, w.translation_ru, w.id, targetLang, client, { lessonId })
        if (url) await db.query('UPDATE words SET image_url = $1 WHERE id = $2', [url + '?v=3', w.id])
      } catch (e) { console.error('enrichLesson draw', w.word_de, e.message) }
    }
  } catch (e) { console.error('enrichLesson images:', e.message) }

  // 3) Переводы слов на все языки локалей
  try {
    await setProgress(lessonId, 'Перевожу слова на все языки...')
    const { rows } = await db.query(
      `SELECT id, word_de, translation_ru FROM words
       WHERE lesson_id = $1 AND (translations IS NULL OR translations = '{}' OR NOT (translations ? 'sq')) ORDER BY id`, [lessonId])
    if (rows.length) {
      // Банк слов: если перевод такого же слова уже есть — переиспользуем, остальные переводим
      const toTranslate = []
      for (const w of rows) {
        const existing = await findExistingTranslations(w.word_de, targetLang, w.id)
        if (existing) await db.query('UPDATE words SET translations = COALESCE(translations, \'{}\'::jsonb) || $1::jsonb WHERE id = $2', [JSON.stringify(existing), w.id])
        else toTranslate.push(w)
      }
      const results = toTranslate.length
        ? await tracked({ kind: 'translate', lessonId, items: toTranslate.length, message: 'слова на локали' },
            () => translateWordsToAllLangs(toTranslate, activeLocales, client))
        : {}
      for (const [id, t] of Object.entries(results)) {
        await db.query('UPDATE words SET translations = COALESCE(translations, \'{}\'::jsonb) || $1::jsonb WHERE id = $2', [JSON.stringify(t), parseInt(id)])
      }
    }
  } catch (e) { console.error('enrichLesson word-langs:', e.message) }

  // 3.5) Добивка недостающих упражнений: у КАЖДОГО слова урока должны быть все core-типы +
  // диктант/произношение. Старые уроки страдали от усечения батча генерации («20 слов из
  // учебника, а в типе меньше») — «✨ Обработать всё» теперь чинит это. Вставляем только
  // недостающие (слово, тип) — без дублей; новые упражнения переведутся шагом 4 ниже.
  try {
    const wKey = (s) => String(s || '').toLowerCase().replace(/^(der|die|das|ein|eine|el|la|los|las|the)\s+/, '').trim()
    const { rows: wRows } = await db.query(
      'SELECT id, word_de, translation_ru, example_sentence FROM words WHERE lesson_id=$1 ORDER BY id', [lessonId])
    const { rows: exRows } = await db.query('SELECT word_id, type FROM exercises WHERE lesson_id=$1', [lessonId])
    const have = new Map() // word_id -> Set(типов)
    for (const r of exRows) {
      if (!r.word_id) continue
      if (!have.has(r.word_id)) have.set(r.word_id, new Set())
      have.get(r.word_id).add(r.type)
    }
    // Диктант/произношение — детерминированно, без ИИ (payload = слово+перевод)
    for (const w of wRows) {
      const set = have.get(w.id) || new Set()
      for (const type of ['dictation', 'speech']) {
        if (set.has(type)) continue
        const p = JSON.stringify({ word_de: w.word_de, translation_ru: w.translation_ru })
        await db.query('INSERT INTO exercises (lesson_id, word_id, type, payload) VALUES ($1,$2,$3,$4)', [lessonId, w.id, type, p])
        set.add(type)
      }
      have.set(w.id, set)
    }
    // Core-типы — догенерация ИИ только для недобранных слов
    const missing = wRows.filter(w => CORE_EXERCISE_TYPES.some(t => !(have.get(w.id)?.has(t))))
    if (missing.length) {
      await setProgress(lessonId, `Докидываю упражнения (${missing.length} слов)...`)
      // Считаем расход именно этого шага: сбрасываем счётчик, гоняем, читаем цену.
      const t0 = Date.now(); resetUsage()
      const generated = await generateExercises(missing, [], targetLang, await getLessonSentences(lessonId), client)
      await logOperation({
        kind: 'exercises', lessonId, provider: textProvider(), model: config.aiTextProvider === 'local' ? config.ollamaModel : 'gpt-4o-mini',
        items: generated.length, durationMs: Date.now() - t0, costUsd: usageCostUSD(),
        message: `догенерация по ${missing.length} словам`, meta: { words: missing.length, calls: usage.calls },
      })
      const idByWord = new Map(wRows.map(w => [wKey(w.word_de), w.id]))
      for (const ex of generated) {
        const wid = idByWord.get(wKey(ex.word_de))
        if (!wid) continue
        const set = have.get(wid) || new Set()
        if (set.has(ex.type)) continue
        await db.query('INSERT INTO exercises (lesson_id, word_id, type, payload) VALUES ($1,$2,$3,$4)',
          [lessonId, wid, ex.type, JSON.stringify(ex.payload)])
        set.add(ex.type)
        have.set(wid, set)
      }
    }
  } catch (e) { console.error('enrichLesson ex-topup:', e.message) }

  // 4) Переводы упражнений (варианты/вопросы) на все языки
  try {
    await setProgress(lessonId, 'Перевожу упражнения...')
    const { rows } = await db.query(
      `SELECT id, type, payload FROM exercises
       WHERE lesson_id = $1 AND type IN ('multiple_choice','fill_blank','sentence_write')
         AND (payload_translations IS NULL OR payload_translations = '{}' OR NOT (payload_translations ? 'sq')) ORDER BY id`, [lessonId])
    for (let i = 0; i < rows.length; i += 15) {
      try {
        const results = await tracked({ kind: 'translate', lessonId, items: Math.min(15, rows.length - i), message: 'упражнения на локали' },
          () => translateExercisePayloads(rows.slice(i, i + 15), activeLocales, client))
        for (const [id, langs] of Object.entries(results)) {
          await db.query('UPDATE exercises SET payload_translations = COALESCE(payload_translations, \'{}\'::jsonb) || $1::jsonb WHERE id = $2', [JSON.stringify(langs), parseInt(id)])
        }
      } catch (e) { console.error('enrichLesson ex-batch:', e.message) }
    }
  } catch (e) { console.error('enrichLesson exercises:', e.message) }

  // 5) ИИ-название урока, если оно ещё дефолтное «Урок N» или пустое (на любом пути обработки)
  try {
    const { rows: lr0 } = await db.query('SELECT title FROM lessons WHERE id=$1', [lessonId])
    const curTitle = (lr0[0]?.title || '').trim()
    const isDefault = !curTitle || /^Урок\s*\d+$/i.test(curTitle) || /^Lektion\s*\d+$/i.test(curTitle)
    if (isDefault) {
      const { rows: ws } = await db.query('SELECT word_de, translation_ru FROM words WHERE lesson_id=$1 ORDER BY id', [lessonId])
      if (ws.length >= 3) {
        await setProgress(lessonId, 'Придумываю название урока...')
        const meta = await generateLessonMeta(ws, [], targetLang) // { title, description }
        if (meta?.title) {
          // Сохраняем номер, если был: «Урок 1» → «Урок 1: <тема>»
          const num = (curTitle.match(/\d+/) || [])[0]
          const newTitle = num ? `Урок ${num}: ${meta.title}` : meta.title
          await db.query('UPDATE lessons SET title=$1, description=COALESCE(NULLIF(description,\'\'),$2) WHERE id=$3',
            [newTitle, meta.description || null, lessonId])
        }
      }
    }
  } catch (e) { console.error('enrichLesson title-gen:', e.message) }

  // 5b) Колонки редактирования (📘 учебник / ✏️ тетрадь) — заполняем из слов по источнику, если пусто.
  // Нужно на пути «добавить фото» (processNewMedia не пишет эти блоки, в отличие от полного процесса).
  try {
    const { rows: lc } = await db.query('SELECT text_content, text_content_extra FROM lessons WHERE id=$1', [lessonId])
    const L = lc[0] || {}
    const cols = [
      { col: 'text_content',       where: "(source='textbook' OR source IS NULL)", cur: L.text_content },
      { col: 'text_content_extra', where: "source='extra'",                        cur: L.text_content_extra },
    ]
    for (const c of cols) {
      if (c.cur && String(c.cur).trim()) continue // не затираем существующий текст
      const { rows: ws } = await db.query(
        `SELECT word_de, translation_ru FROM words WHERE lesson_id=$1 AND ${c.where} ORDER BY id`, [lessonId])
      if (ws.length) {
        const lines = ws.map(w => `${w.word_de} — ${w.translation_ru}`).join('\n')
        await db.query(`UPDATE lessons SET ${c.col}=$1 WHERE id=$2`, [lines, lessonId])
      }
    }
  } catch (e) { console.error('enrichLesson fill-columns:', e.message) }

  // Перевод ЗАГОЛОВКА и ОПИСАНИЯ урока на активные локали (для страницы «Сегодня»/списка)
  try {
    const { rows: lr } = await db.query(
      'SELECT title, description, title_translations, description_translations FROM lessons WHERE id=$1', [lessonId])
    const L = lr[0]
    if (L && L.title) {
      // Языки, на которые реально переводим (без ru[база] и de[фолбэк на ru])
      const need = (activeLocales || ALL_LOCALES).filter(l => l !== 'ru') // вкл. de: учитель немецкого проверяет
      const titleMissing = need.some(l => !(L.title_translations && L.title_translations[l]))
      const hasDesc = L.description && String(L.description).trim()
      const descMissing = hasDesc && need.some(l => !(L.description_translations && L.description_translations[l]))
      if (titleMissing || descMissing) {
        await setProgress(lessonId, 'Перевожу заголовок и описание урока...')
        const meta = await translateLessonMeta(L.title, L.description, activeLocales, client)
        await db.query(
          `UPDATE lessons SET
             title_translations = COALESCE(title_translations, '{}'::jsonb) || $1::jsonb,
             description_translations = COALESCE(description_translations, '{}'::jsonb) || $2::jsonb
           WHERE id = $3`,
          [JSON.stringify(meta.title), JSON.stringify(meta.description), lessonId])
      }
    }
  } catch (e) { console.error('enrichLesson meta-langs:', e.message) }
}

// Генерация упражнений из уже существующих слов в БД (без сканирования фото)
export async function regenerateExercisesFromDb(lessonId) {
  await db.query("UPDATE lessons SET status = 'processing', progress = 'Генерирую упражнения из существующих слов...' WHERE id = $1", [lessonId])

  try {
    // Берём слова урока из БД
    const { rows: wordRows } = await db.query(
      `SELECT id, word_de, translation_ru, example_sentence
       FROM words WHERE lesson_id = $1 ORDER BY id`,
      [lessonId]
    )
    if (!wordRows.length) throw new Error('Нет слов для этого урока')
    const lrow = (await db.query('SELECT owner_id, target_lang FROM lessons WHERE id=$1', [lessonId])).rows[0]
    const targetLang = lrow?.target_lang || 'de'
    const client = await getOwnerClient(lrow?.owner_id) // ключ владельца или платформенный

    const words = wordRows.map(w => ({
      word_de: w.word_de,
      translation_ru: w.translation_ru,
      example_sentence: w.example_sentence,
    }))
    const wordMap = buildWordMap(wordRows)

    // Удаляем старые упражнения (если есть)
    await db.query('DELETE FROM exercises WHERE lesson_id = $1', [lessonId])

    await setProgress(lessonId, `Генерирую упражнения для ${words.length} слов...`)

    // Генерируем упражнения батчами по 15 слов
    const exercises = await generateExercises(words, [], targetLang, await getLessonSentences(lessonId), client)

    for (const ex of exercises) {
      const wordId = wordIdFor(wordMap, ex.word_de)
      await db.query(
        'INSERT INTO exercises (lesson_id, word_id, type, payload) VALUES ($1, $2, $3, $4)',
        [lessonId, wordId, ex.type, JSON.stringify(ex.payload)]
      )
    }

    // Диктант + «Проговори слова» (speech) — по одному на каждое слово
    for (const word of words) {
      const wordId = wordIdFor(wordMap, word.word_de)
      const payload = JSON.stringify({ word_de: word.word_de, translation_ru: word.translation_ru })
      await db.query('INSERT INTO exercises (lesson_id, word_id, type, payload) VALUES ($1, $2, $3, $4)', [lessonId, wordId, 'dictation', payload])
      await db.query('INSERT INTO exercises (lesson_id, word_id, type, payload) VALUES ($1, $2, $3, $4)', [lessonId, wordId, 'speech', payload])
    }

    const total = exercises.length + words.length
    await db.query(
      "UPDATE lessons SET status = 'done', progress = $1 WHERE id = $2",
      [`Готово! Слов: ${words.length}, упражнений: ${total}`, lessonId]
    )
    return { lessonId, wordsCount: words.length, exercisesCount: total }
  } catch (err) {
    await db.query(
      "UPDATE lessons SET status = 'error', progress = $1 WHERE id = $2",
      [`Ошибка: ${err.message}`, lessonId]
    )
    throw err
  }
}

// БЕЗОПАСНАЯ перегенерация: обновляет контент упражнений НЕ теряя прогресс ученика.
// В отличие от regenerateExercisesFromDb (DELETE+INSERT → новые ID → сирые attempts/SRS),
// здесь сопоставляем новые упражнения со старыми по ключу `word_id|type` и UPDATE-им payload
// на месте (ID сохраняется → история попыток и расписание SRS целы). Недостающее добавляем,
// лишнее НЕ удаляем. Возвращает { updated, inserted }.
export async function regenerateExercisesSafe(lessonId) {
  const { rows: wordRows } = await db.query(
    `SELECT id, word_de, translation_ru, example_sentence FROM words WHERE lesson_id = $1 ORDER BY id`,
    [lessonId]
  )
  if (!wordRows.length) throw new Error('Нет слов для этого урока')
  const lrow = (await db.query('SELECT owner_id, target_lang FROM lessons WHERE id=$1', [lessonId])).rows[0]
  const targetLang = lrow?.target_lang || 'de'
  const client = await getOwnerClient(lrow?.owner_id)
  const words = wordRows.map(w => ({ word_de: w.word_de, translation_ru: w.translation_ru, example_sentence: w.example_sentence }))
  const wordMap = buildWordMap(wordRows)

  // Пул существующих упражнений: очередь ID по ключу `word_id|type` — берём по одному под каждое новое.
  const { rows: existing } = await db.query(
    'SELECT id, word_id, type FROM exercises WHERE lesson_id = $1 ORDER BY id', [lessonId]
  )
  const pool = new Map()
  for (const e of existing) {
    const k = `${e.word_id}|${e.type}`
    if (!pool.has(k)) pool.set(k, [])
    pool.get(k).push(e.id)
  }
  const takeId = (wordId, type) => {
    const q = pool.get(`${wordId}|${type}`)
    return q && q.length ? q.shift() : null
  }

  await setProgress(lessonId, `Обновляю упражнения (без потери прогресса) для ${words.length} слов...`)

  // Генерируем свежие GPT-упражнения (карточка/пропуск/выбор/предложение/буквы)
  const generated = await generateExercises(words, [], targetLang, await getLessonSentences(lessonId), client)

  let updated = 0, inserted = 0
  for (const ex of generated) {
    const wordId = wordIdFor(wordMap, ex.word_de)
    const reuseId = takeId(wordId, ex.type)
    if (reuseId) {
      // payload сменился → старые переводы (10 локалей) больше не соответствуют содержимому.
      // Сбрасываем — enrichLesson (шаг «Перевожу упражнения») переведёт заново.
      await db.query("UPDATE exercises SET payload = $1, payload_translations = '{}' WHERE id = $2", [JSON.stringify(ex.payload), reuseId])
      updated++
    } else {
      await db.query('INSERT INTO exercises (lesson_id, word_id, type, payload) VALUES ($1,$2,$3,$4)',
        [lessonId, wordId, ex.type, JSON.stringify(ex.payload)])
      inserted++
    }
  }

  // Диктант/speech — детерминированные, по одному на слово. Существующие оставляем (ID целы),
  // добавляем только тем словам, у кого их ещё нет.
  for (const w of wordRows) {
    const payload = JSON.stringify({ word_de: w.word_de, translation_ru: w.translation_ru })
    for (const t of ['dictation', 'speech']) {
      if (takeId(w.id, t)) continue // уже есть — не трогаем
      await db.query('INSERT INTO exercises (lesson_id, word_id, type, payload) VALUES ($1,$2,$3,$4)',
        [lessonId, w.id, t, payload])
      inserted++
    }
  }

  await db.query("UPDATE lessons SET status = 'done', progress = $1 WHERE id = $2",
    [`Обновлено: ${updated}, добавлено: ${inserted} (прогресс сохранён)`, lessonId])
  return { lessonId, updated, inserted }
}

// Шаг 1 превью (#5, создание урока): извлечь+смёржить ТОЛЬКО необработанные фото урока
// и вернуть учителю на правку — БЕЗ вставки слов/упражнений в БД (только пометка фото
// processed+raw_extraction, как в processNewMedia, чтобы не гонять vision дважды).
export async function extractLessonPreview(lessonId) {
  const { rows: fresh } = await db.query(
    "SELECT * FROM lesson_media WHERE lesson_id=$1 AND type='photo' AND processed=false ORDER BY id", [lessonId])

  // Незакрытый разбор: превью посчитано, но учитель ещё не подтвердил выбор
  // (после подтверждения preview очищается — см. commitLessonWords).
  const { rows: saved } = await db.query('SELECT preview FROM lessons WHERE id=$1', [lessonId])
  const pendingPreview = saved[0]?.preview || null

  // Уже готовое превью отдаём сразу — не тратим деньги на повторный разбор.
  if (!fresh.length && pendingPreview) return pendingPreview

  // Фото помечаются обработанными сразу после распознавания. Дальше два случая, и в обоих
  // берём страницы из raw_extraction, где разбор уже лежит, — vision второй раз не платим:
  //  • связь оборвалась ПОСЛЕ пометки, но ДО сохранения превью (иначе вернулась бы пустота);
  //  • учитель догрузил страницы поверх неподтверждённого разбора. Тогда считать только новые
  //    нельзя: превью перезапишется ими, и ранее распознанное молча пропадёт из выбора.
  const older = (pendingPreview || !fresh.length)
    ? (await db.query(
        "SELECT * FROM lesson_media WHERE lesson_id=$1 AND type='photo' AND raw_extraction IS NOT NULL ORDER BY id",
        [lessonId])).rows
    : []
  const seen = new Set(fresh.map(m => m.id))
  const media = [...older.filter(m => !seen.has(m.id)), ...fresh].sort((a, b) => a.id - b.id)
  if (!media.length) return { words: [], sentences: [], grammar_points: [] }
  const { rows: lrow } = await db.query('SELECT owner_id, target_lang, status FROM lessons WHERE id=$1', [lessonId])
  const ownerId = lrow[0]?.owner_id
  const targetLang = lrow[0]?.target_lang || 'de'
  // Куда вернуть урок после разбора. Для НОВОГО урока это 'pending' (слов ещё нет,
  // разбор впереди). Для готового — 'done': учитель дозагрузил тетрадь в урок, который
  // уже проходят ученики, и на время выбора галочек урок не должен исчезать у них из
  // списка (ученику видны только done-уроки).
  const backTo = lrow[0]?.status === 'done' ? 'done' : 'pending'
  const client = await getOwnerClient(ownerId)
  await db.query("UPDATE lessons SET status='processing', progress=$1 WHERE id=$2", [`Распознаю ${media.length} фото...`, lessonId])

  const { rows: existRows } = await db.query('SELECT word_de FROM words WHERE lesson_id=$1', [lessonId])
  const existingWords = existRows.map(r => r.word_de)

  // Что учитель уже проходил в этом языке: слово → урок, где оно встречалось.
  // Нужно, чтобы в превью отделить НОВЫЕ слова от повторов: на повторы упражнения
  // уже созданы, и добавлять их второй раз незачем.
  const { rows: knownRows } = await db.query(
    `SELECT w.word_de, l.id AS lesson_id, l.title
       FROM words w JOIN lessons l ON l.id = w.lesson_id
      WHERE l.owner_id = $1 AND l.target_lang = $2 AND l.id <> $3
      ORDER BY l.id DESC`, [ownerId, targetLang, lessonId])
  const knownByWord = new Map()
  for (const r of knownRows) {
    const k = wordKeyNorm(r.word_de)
    if (!knownByWord.has(k)) knownByWord.set(k, { lessonId: r.lesson_id, title: r.title })
  }

  const words = []
  const sentences = []
  const grammarPoints = []
  try {
    for (const src of ['textbook', 'extra']) {
      const list = media.filter(m => (m.source === 'extra' ? 'extra' : 'textbook') === src)
      if (!list.length) continue
      const pairs = []
      for (const photo of list) {
        try {
          // Страница уже разобрана (повтор после обрыва связи) — берём сохранённое,
          // vision не вызываем: он самый дорогой шаг, платить дважды незачем.
          const extraction = photo.raw_extraction
            ? (typeof photo.raw_extraction === 'string' ? JSON.parse(photo.raw_extraction) : photo.raw_extraction)
            : await tracked({ kind: 'extract', lessonId, items: 1, meta: { file: photo.file_path } },
                () => extractFromPhoto(join(config.uploadDir, photo.file_path), targetLang, client))
          pairs.push({ mediaId: photo.id, extraction })
          if (!photo.raw_extraction) {
            await db.query('UPDATE lesson_media SET processed=true, raw_extraction=$1 WHERE id=$2', [JSON.stringify(extraction), photo.id])
          }
        } catch (e) { console.error('extractLessonPreview extract', e.message) }
      }
      if (!pairs.length) continue
      // Сверяем с уже имеющимися словами урока (тетрадь после учебника — не дублируем)
      const cons = await mergeLesson(pairs.map(p => p.extraction), null, existingWords, targetLang, client)
      for (const w of (cons.words || [])) {
        const mediaId = mediaIdForWord(w.word_de, pairs) // с какого скана слово
        // Помечаем каждое слово, чтобы учитель не вычитывал список глазами:
        //  • seenIn — где это слово уже встречалось (повтор, упражнения на него уже есть);
        //  • isFunction — служебное (артикли, местоимения, предлоги) либо кусок подписи
        //    к заданию вроде «Sehen Sie die Bilder an» — такие в словарь не нужны.
        const seenIn = knownByWord.get(wordKeyNorm(w.word_de)) || null
        words.push({
          word_de: w.word_de, translation_ru: w.translation_ru || '',
          example_sentence: w.example_sentence || null, source: src, media_id: mediaId,
          isNew: !seenIn, seenIn,
          isFunction: isFunctionWord(w.word_de, targetLang),
        })
        existingWords.push(w.word_de) // между textbook/extra в одном превью тоже не дублировать
      }
      for (const s of (cons.sentences || [])) {
        const text = (typeof s === 'string' ? s : s?.text || '').trim()
        if (text) sentences.push({ text, translation_ru: (typeof s === 'object' && s ? s.translation_ru : null) || null, source: src })
      }
      if (Array.isArray(cons.grammar_points)) grammarPoints.push(...cons.grammar_points)
    }
    const preview = { words, sentences, grammar_points: grammarPoints }
    await db.query("UPDATE lessons SET status=$4, progress=$1, preview=$2 WHERE id=$3",
      [`Превью готово: слов ${words.length}, предложений ${sentences.length}`, JSON.stringify(preview), lessonId, backTo])
  } catch (err) {
    // Готовый урок в 'error' не роняем: у него есть слова и упражнения, ученики его проходят.
    // Ошибка распознавания новых фото не должна выключать рабочий урок.
    await db.query("UPDATE lessons SET status=$3, progress=$1 WHERE id=$2",
      [String(err.message).slice(0, 150), lessonId, backTo === 'done' ? 'done' : 'error'])
    throw err
  }
  return { words, sentences, grammar_points: grammarPoints }
}

// Шаг 2 превью: учитель отметил галочками/дописал слова и предложения — коммитим
// ТОЛЬКО их (INSERT слов/предложений/грамматики), генерируем упражнения для новых слов,
// затем enrichLesson (переводы/картинки на все языки). Идёт в фоне, статус — как обычно.
export async function commitLessonWords(lessonId, words = [], sentences = [], grammarPoints = []) {
  try {
    const { rows: lrow } = await db.query('SELECT owner_id, target_lang FROM lessons WHERE id=$1', [lessonId])
    const ownerId = lrow[0]?.owner_id
    const targetLang = lrow[0]?.target_lang || 'de'
    if (!ownerId) throw new Error('Урок не найден')
    const client = await getOwnerClient(ownerId)
    await setProgress(lessonId, 'Сохраняю урок...')

    const known = await knownWordsFor(targetLang)
    for (const w of (words || [])) {
      if (!w?.word_de) continue
      // Мусорные префиксы («verb: kochen») срезаем, опечатки приводим к уже принятому
      // написанию («Enthschuldigung» → «die Entschuldigung»): иначе ученик получал
      // диктант, который невозможно пройти.
      const wordDe = normalizeIncomingWord(w.word_de, known)
      if (!wordDe) continue
      const source = w.source === 'extra' ? 'extra' : 'textbook'
      await db.query(
        `INSERT INTO words (lesson_id, user_id, word_de, translation_ru, example_sentence, source, media_id)
         VALUES ($1,$2,$3,$4,$5,$6,$7) ON CONFLICT (lesson_id, word_de)
         DO UPDATE SET example_sentence = COALESCE(EXCLUDED.example_sentence, words.example_sentence),
                       media_id = COALESCE(words.media_id, EXCLUDED.media_id)`,
        [lessonId, ownerId, wordDe, (w.translation_ru || '').trim() || null,
         w.example_sentence || null, source, w.media_id || null])
    }

    const bySource = { textbook: [], extra: [] }
    for (const s of (sentences || [])) {
      const src = s?.source === 'extra' ? 'extra' : 'textbook'
      bySource[src].push(s)
    }
    for (const src of ['textbook', 'extra']) {
      if (bySource[src].length) await saveSentences(lessonId, bySource[src], src)
    }

    for (const gp of (grammarPoints || [])) {
      if (!gp?.description) continue
      await db.query('INSERT INTO grammar_points (lesson_id, description, example) VALUES ($1, $2, $3)', [lessonId, gp.description, gp.example || null])
    }

    // Упражнения ТОЛЬКО для слов урока без упражнений (новые) — без дублей
    const { rows: wordRows } = await db.query(
      `SELECT w.id, w.word_de, w.translation_ru, w.example_sentence FROM words w
       WHERE w.lesson_id=$1 AND NOT EXISTS (SELECT 1 FROM exercises e WHERE e.word_id=w.id AND e.lesson_id=$1)`, [lessonId])
    if (wordRows.length) {
      await setProgress(lessonId, `Создаю упражнения для ${wordRows.length} слов...`)
      const exercises = await generateExercises(wordRows, grammarPoints, targetLang, await getLessonSentences(lessonId), client)
      const wordMap = buildWordMap(wordRows)
      for (const ex of exercises) {
        await db.query('INSERT INTO exercises (lesson_id, word_id, type, payload) VALUES ($1,$2,$3,$4)',
          [lessonId, wordIdFor(wordMap, ex.word_de), ex.type, JSON.stringify(ex.payload)])
      }
      for (const w of wordRows) {
        const p = JSON.stringify({ word_de: w.word_de, translation_ru: w.translation_ru })
        await db.query('INSERT INTO exercises (lesson_id, word_id, type, payload) VALUES ($1,$2,$3,$4)', [lessonId, w.id, 'dictation', p])
        await db.query('INSERT INTO exercises (lesson_id, word_id, type, payload) VALUES ($1,$2,$3,$4)', [lessonId, w.id, 'speech', p])
      }
    }

    await enrichLesson(lessonId)
    // Превью подтверждено и больше не нужно — чистим, чтобы не подсовывать старый разбор
    // при следующей дозагрузке фото в этот же урок.
    // Проверку качества запускаем и здесь: подтверждение превью — ОСНОВНОЙ путь создания
    // урока, а аудит был подключён только к обработке фото, и новые уроки его не проходили.
    const audit = await auditLessonAndLog(lessonId, ownerId)
    await db.query("UPDATE lessons SET status='done', progress=$1, preview=NULL WHERE id=$2",
      [`Готово! Слов: ${words.length}${audit ? `. Проверка: ${audit.summary}` : ''}`, lessonId])
    await auditLessonAndLog(lessonId, ownerId)   // отчёт о качестве — в журнал
  } catch (err) {
    console.error('commitLessonWords:', err.message)
    await db.query("UPDATE lessons SET status='error', progress=$1 WHERE id=$2", [String(err.message).slice(0, 150), lessonId])
  }
}

// Обработать ТОЛЬКО новые (необработанные) фото урока: извлечь слова + упражнения
// для новых слов (без пересоздания существующих). Возвращает число обработанных фото.
export async function processNewMedia(lessonId) {
  const { rows: media } = await db.query(
    "SELECT * FROM lesson_media WHERE lesson_id=$1 AND type='photo' AND processed=false", [lessonId])
  if (!media.length) return 0
  const { rows: lrow } = await db.query('SELECT owner_id, target_lang FROM lessons WHERE id=$1', [lessonId])
  const ownerId = lrow[0]?.owner_id
  const targetLang = lrow[0]?.target_lang || 'de'
  const client = await getOwnerClient(ownerId) // ключ владельца или платформенный
  await setProgress(lessonId, `Обрабатываю ${media.length} новых фото...`)

  for (const src of ['textbook', 'extra']) {
    const list = media.filter(m => (m.source === 'extra' ? 'extra' : 'textbook') === src)
    if (!list.length) continue
    const pairs = []
    for (const photo of list) {
      try {
        const extraction = await tracked({ kind: 'extract', lessonId, items: 1, meta: { file: photo.file_path } },
          () => extractFromPhoto(join(config.uploadDir, photo.file_path), targetLang, client))
        pairs.push({ mediaId: photo.id, extraction })
        await db.query('UPDATE lesson_media SET processed=true, raw_extraction=$1 WHERE id=$2', [JSON.stringify(extraction), photo.id])
      } catch (e) { console.error('processNewMedia extract', e.message) }
    }
    if (!pairs.length) continue
    // Умная обработка: сверяем с уже имеющимися словами урока (тетрадь после учебника)
    const { rows: existRows } = await db.query('SELECT word_de FROM words WHERE lesson_id=$1', [lessonId])
    const cons = await mergeLesson(pairs.map(p => p.extraction), null, existRows.map(r => r.word_de), targetLang, client)
    const known = await knownWordsFor(targetLang)
    for (const w of (cons.words || [])) {
      const wordDe = normalizeIncomingWord(w.word_de, known)
      if (!wordDe) continue
      const mediaId = mediaIdForWord(wordDe, pairs) // с какого скана слово
      await db.query(
        `INSERT INTO words (lesson_id, user_id, word_de, translation_ru, example_sentence, source, media_id)
         VALUES ($1,$2,$3,$4,$5,$6,$7) ON CONFLICT (lesson_id, word_de)
         DO UPDATE SET example_sentence = COALESCE(EXCLUDED.example_sentence, words.example_sentence),
                       media_id = COALESCE(words.media_id, EXCLUDED.media_id)`,
        [lessonId, ownerId, w.word_de, w.translation_ru, w.example_sentence || null, src, mediaId])
    }
    await saveSentences(lessonId, cons.sentences, src) // реальные предложения урока
  }

  // Упражнения ТОЛЬКО для слов урока без упражнений (новые) — без дублей
  const { rows: wordRows } = await db.query(
    `SELECT w.id, w.word_de, w.translation_ru, w.example_sentence FROM words w
     WHERE w.lesson_id=$1 AND NOT EXISTS (SELECT 1 FROM exercises e WHERE e.word_id=w.id AND e.lesson_id=$1)`, [lessonId])
  if (wordRows.length) {
    await setProgress(lessonId, `Создаю упражнения для ${wordRows.length} новых слов...`)
    const exercises = await generateExercises(wordRows, [], targetLang, await getLessonSentences(lessonId), client)
    const wordMap = buildWordMap(wordRows)
    for (const ex of exercises) {
      await db.query('INSERT INTO exercises (lesson_id, word_id, type, payload) VALUES ($1,$2,$3,$4)',
        [lessonId, wordIdFor(wordMap, ex.word_de), ex.type, JSON.stringify(ex.payload)])
    }
    for (const w of wordRows) {
      const p = JSON.stringify({ word_de: w.word_de, translation_ru: w.translation_ru })
      await db.query('INSERT INTO exercises (lesson_id, word_id, type, payload) VALUES ($1,$2,$3,$4)', [lessonId, w.id, 'dictation', p])
      await db.query('INSERT INTO exercises (lesson_id, word_id, type, payload) VALUES ($1,$2,$3,$4)', [lessonId, w.id, 'speech', p])
    }
  }
  return media.length
}

// «Свои упражнения»: собрать набор упражнений из выбранных слов (по их id).
// Слова уже существуют (из других уроков/словаря) — упражнения ссылаются на них.
// Добавить слова с фото (камера) в урок: вставить новые слова, сгенерировать им
// упражнения (без пересоздания существующих) и дополнить переводами/картинками.
export async function saveCameraWords(lessonId, words) {
  try {
    const { rows: lrow } = await db.query('SELECT owner_id, target_lang FROM lessons WHERE id=$1', [lessonId])
    const ownerId = lrow[0]?.owner_id
    const targetLang = lrow[0]?.target_lang || 'de'
    if (!ownerId) throw new Error('Урок не найден')
    const client = await getOwnerClient(ownerId) // ключ владельца или платформенный
    await setProgress(lessonId, 'Добавляю слова с фото...')
    const knownCam = await knownWordsFor(targetLang)
    for (const w of words) {
      if (!w || !w.de) continue
      const wordDe = normalizeIncomingWord(w.de, knownCam)
      if (!wordDe) continue
      await db.query(
        `INSERT INTO words (lesson_id, user_id, word_de, translation_ru, source)
         VALUES ($1,$2,$3,$4,'camera') ON CONFLICT (lesson_id, word_de) DO NOTHING`,
        [lessonId, ownerId, wordDe, (w.tr || '').trim() || null])
    }
    // Упражнения только для слов урока БЕЗ упражнений (новые)
    const { rows: wordRows } = await db.query(
      `SELECT w.id, w.word_de, w.translation_ru, w.example_sentence FROM words w
       WHERE w.lesson_id=$1 AND NOT EXISTS (SELECT 1 FROM exercises e WHERE e.word_id=w.id AND e.lesson_id=$1)`, [lessonId])
    if (wordRows.length) {
      await setProgress(lessonId, `Создаю упражнения для ${wordRows.length} новых слов...`)
      const exercises = await generateExercises(wordRows, [], targetLang, await getLessonSentences(lessonId), client)
      const wordMap = buildWordMap(wordRows)
      for (const ex of exercises) {
        await db.query('INSERT INTO exercises (lesson_id, word_id, type, payload) VALUES ($1,$2,$3,$4)',
          [lessonId, wordIdFor(wordMap, ex.word_de), ex.type, JSON.stringify(ex.payload)])
      }
      for (const w of wordRows) {
        const p = JSON.stringify({ word_de: w.word_de, translation_ru: w.translation_ru })
        await db.query('INSERT INTO exercises (lesson_id, word_id, type, payload) VALUES ($1,$2,$3,$4)', [lessonId, w.id, 'dictation', p])
        await db.query('INSERT INTO exercises (lesson_id, word_id, type, payload) VALUES ($1,$2,$3,$4)', [lessonId, w.id, 'speech', p])
      }
    }
    await enrichLesson(lessonId)
    await db.query("UPDATE lessons SET status='done', progress=$1 WHERE id=$2", [`Готово! Слова с фото добавлены.`, lessonId])
    await auditLessonAndLog(lessonId, ownerId)
  } catch (err) {
    console.error('saveCameraWords:', err.message)
    await db.query("UPDATE lessons SET status='done', progress=$1 WHERE id=$2", [String(err.message).slice(0, 100), lessonId])
  }
}

export async function generateCustomSet(lessonId, wordIds) {
  try {
    await setProgress(lessonId, 'Собираю упражнения из выбранных слов...')
    const lrow = (await db.query('SELECT owner_id, target_lang FROM lessons WHERE id=$1', [lessonId])).rows[0]
    const tl = lrow?.target_lang || 'de'
    const client = await getOwnerClient(lrow?.owner_id) // ключ владельца или платформенный
    const { rows: words } = await db.query(
      'SELECT id, word_de, translation_ru, example_sentence FROM words WHERE id = ANY($1::int[]) ORDER BY id', [wordIds])
    if (!words.length) {
      await db.query("UPDATE lessons SET status='error', progress='Нет слов' WHERE id=$1", [lessonId])
      return
    }
    const exercises = await generateExercises(words, [], tl, await getLessonSentences(lessonId), client)
    const wordMap = buildWordMap(words)
    for (const ex of exercises) {
      await db.query('INSERT INTO exercises (lesson_id, word_id, type, payload) VALUES ($1,$2,$3,$4)',
        [lessonId, wordIdFor(wordMap, ex.word_de), ex.type, JSON.stringify(ex.payload)])
    }
    for (const w of words) {
      const payload = JSON.stringify({ word_de: w.word_de, translation_ru: w.translation_ru })
      await db.query('INSERT INTO exercises (lesson_id, word_id, type, payload) VALUES ($1,$2,$3,$4)', [lessonId, w.id, 'dictation', payload])
      await db.query('INSERT INTO exercises (lesson_id, word_id, type, payload) VALUES ($1,$2,$3,$4)', [lessonId, w.id, 'speech', payload])
    }
    await enrichLesson(lessonId)  // переводы упражнений на все языки (у слов картинки/переводы уже есть)
    await db.query("UPDATE lessons SET status='done', progress=$1 WHERE id=$2", [`Готово! Слов: ${words.length}`, lessonId])
    await auditLessonAndLog(lessonId, ownerId)   // отчёт о качестве — в журнал
  } catch (err) {
    console.error('generateCustomSet:', err.message)
    await db.query("UPDATE lessons SET status='error', progress=$1 WHERE id=$2", [String(err.message).slice(0, 100), lessonId])
  }
}

export async function processLesson(lessonId, ownerId) {
  await db.query("UPDATE lessons SET status = 'processing', progress = 'Начинаем...' WHERE id = $1", [lessonId])

  try {
    const { rows: lessonRows } = await db.query(
      'SELECT text_content, text_content_extra, owner_id, target_lang FROM lessons WHERE id = $1', [lessonId]
    )
    const textContent = lessonRows[0]?.text_content || null
    const textContentExtra = lessonRows[0]?.text_content_extra || null
    const targetLang = lessonRows[0]?.target_lang || 'de' // изучаемый язык урока
    // Слова всегда сохраняем под реальным владельцем урока
    ownerId = lessonRows[0]?.owner_id ?? ownerId
    const client = await getOwnerClient(ownerId) // генерация урока — за счёт учителя (свой ключ) или платформенная

    const { rows: mediaFiles } = await db.query(
      'SELECT * FROM lesson_media WHERE lesson_id = $1',
      [lessonId]
    )

    const photos = mediaFiles.filter(m => m.type === 'photo')
    const audios = mediaFiles.filter(m => m.type === 'audio')

    // Извлечение фото через GPT-4o vision (с кэшем raw_extraction)
    async function extractPhotos(list, offset) {
      const out = []
      for (let i = 0; i < list.length; i++) {
        const photo = list[i]
        if (photo.processed && photo.raw_extraction) {
          out.push(typeof photo.raw_extraction === 'string' ? JSON.parse(photo.raw_extraction) : photo.raw_extraction)
          continue
        }
        await setProgress(lessonId, `Фото ${offset + i + 1}...`)
        const filepath = join(config.uploadDir, photo.file_path)
        const extraction = await tracked({ kind: 'extract', lessonId, items: 1, meta: { file: filepath } },
          () => extractFromPhoto(filepath, targetLang, client))
        out.push(extraction)
        await db.query('UPDATE lesson_media SET processed = true, raw_extraction = $1 WHERE id = $2', [JSON.stringify(extraction), photo.id])
      }
      return out
    }

    // Транскрипция аудио (относим к материалу учебника)
    let transcription = null
    if (audios.length > 0) {
      await setProgress(lessonId, 'Расшифровка аудио...')
      for (const audio of audios) {
        const filepath = join(config.uploadDir, audio.file_path)
        transcription = await tracked({ kind: 'transcribe', lessonId, items: 1, meta: { file: filepath } },
          () => transcribeAudio(filepath, client))
        await db.query('UPDATE lesson_media SET processed = true WHERE id = $1', [audio.id])
      }
    }
    const combinedText = [transcription, textContent].filter(Boolean).join('\n\n') || null

    // Обрабатываем фото ДВУМЯ группами по источнику: учебник и тетрадь/доска
    const textbookPhotos = photos.filter(p => p.source !== 'extra')
    const extraPhotos    = photos.filter(p => p.source === 'extra')
    const allWords = []
    const allGrammar = []

    async function ingest(list, offset, text, source) {
      const ex = await extractPhotos(list, offset)
      if (ex.length === 0 && !text) return
      // Пары фото↔извлечение (выровнены по порядку list) — для привязки слова к скану
      const pairs = ex.map((extraction, k) => ({ mediaId: list[k]?.id, extraction }))
      await setProgress(lessonId, 'Составляю конспект урока...')
      // Тетрадь/доска (extra) сверяется с уже извлечёнными словами учебника — не дублируем
      const { rows: existRows } = await db.query('SELECT word_de FROM words WHERE lesson_id=$1', [lessonId])
      const cons = await mergeLesson(ex, text, existRows.map(r => r.word_de), targetLang, client)
      const known = await knownWordsFor(targetLang)
      for (const word of (cons.words || [])) {
        const wordDe = normalizeIncomingWord(word.word_de, known)
        if (!wordDe) continue
        const mediaId = mediaIdForWord(wordDe, pairs) // с какого скана слово
        await db.query(
          `INSERT INTO words (lesson_id, user_id, word_de, translation_ru, example_sentence, source, media_id)
           VALUES ($1, $2, $3, $4, $5, $6, $7)
           ON CONFLICT (lesson_id, word_de)
           DO UPDATE SET example_sentence = COALESCE(EXCLUDED.example_sentence, words.example_sentence),
                         media_id = COALESCE(words.media_id, EXCLUDED.media_id)`,
          [lessonId, ownerId, wordDe, word.translation_ru, word.example_sentence || null, source, mediaId]
        )
      }
      await saveSentences(lessonId, cons.sentences, source) // реальные предложения урока
      allWords.push(...(cons.words || []))
      allGrammar.push(...(cons.grammar_points || []))

      // Заполняем блок текста урока словами (для формы редактирования: 📘 учебник / ✏️ тетрадь),
      // только если блок ещё пуст — не затираем OCR-текст, если он был.
      const wordLines = (cons.words || []).map(w => `${w.word_de} — ${w.translation_ru}`).join('\n')
      if (wordLines) {
        const col = source === 'extra' ? 'text_content_extra' : 'text_content'
        await db.query(`UPDATE lessons SET ${col} = $1 WHERE id = $2 AND (${col} IS NULL OR ${col} = '')`, [wordLines, lessonId])
      }
    }

    await ingest(textbookPhotos, 0, combinedText, 'textbook')
    if (extraPhotos.length > 0 || textContentExtra) await ingest(extraPhotos, textbookPhotos.length, textContentExtra, 'extra')

    for (const gp of allGrammar) {
      await db.query('INSERT INTO grammar_points (lesson_id, description, example) VALUES ($1, $2, $3)', [lessonId, gp.description, gp.example || null])
    }

    const consolidated = { words: allWords, grammar_points: allGrammar }

    // Генерируем упражнения
    const totalWords = consolidated.words.length
    await setProgress(lessonId, `Создаю упражнения для ${totalWords} слов...`)
    let exercises = []
    if (totalWords > 0) {
      exercises = await generateExercises(consolidated.words, consolidated.grammar_points, targetLang, await getLessonSentences(lessonId), client)
    }

    const { rows: wordRows } = await db.query(
      'SELECT id, word_de FROM words WHERE user_id = $1 AND lesson_id = $2',
      [ownerId, lessonId]
    )
    const wordMap = buildWordMap(wordRows)

    for (const ex of exercises) {
      const wordId = wordIdFor(wordMap, ex.word_de)
      await db.query(
        'INSERT INTO exercises (lesson_id, word_id, type, payload) VALUES ($1, $2, $3, $4)',
        [lessonId, wordId, ex.type, JSON.stringify(ex.payload)]
      )
    }

    // Диктант + «Проговори слова» (speech) — по одному на каждое слово, последними
    for (const word of consolidated.words) {
      const wordId = wordIdFor(wordMap, word.word_de)
      const payload = JSON.stringify({ word_de: word.word_de, translation_ru: word.translation_ru })
      await db.query('INSERT INTO exercises (lesson_id, word_id, type, payload) VALUES ($1, $2, $3, $4)', [lessonId, wordId, 'dictation', payload])
      await db.query('INSERT INTO exercises (lesson_id, word_id, type, payload) VALUES ($1, $2, $3, $4)', [lessonId, wordId, 'speech', payload])
    }

    // AI-название и описание, если тема не задана вручную (пусто или авто «Урок N»)
    if (consolidated.words.length > 0) {
      try {
        const { rows: metaRows } = await db.query('SELECT title, description FROM lessons WHERE id = $1', [lessonId])
        const curTitle = (metaRows[0]?.title || '').trim()
        const needTitle = !curTitle || /^Урок\s+\d+$/i.test(curTitle)
        const needDesc  = !metaRows[0]?.description
        if (needTitle || needDesc) {
          const meta = await generateLessonMeta(consolidated.words, consolidated.grammar_points, targetLang, client)
          // Номер урока: если задан вручную — сохраняем; иначе берём СЛЕДУЮЩИЙ свободный
          // (max «Урок N» у учителя + 1), чтобы не было дублей «Урок 3» и урок был новым.
          const numMatch = curTitle.match(/Урок\s+(\d+)/i)
          let num = numMatch ? numMatch[1] : null
          if (!num) {
            const { rows: mx } = await db.query(
              `SELECT COALESCE(MAX(n),0)+1 AS next FROM (
                 SELECT (regexp_match(title, 'Урок\\s+(\\d+)'))[1]::int AS n
                 FROM lessons WHERE owner_id=$1) t WHERE n IS NOT NULL`, [ownerId])
            num = mx[0].next
          }
          // Убираем «Урок N:», если ИИ добавил свой номер — ставим наш последовательный
          const cleanTitle = (meta.title || '').replace(/^\s*Урок\s+\d+\s*[:\-–—]?\s*/i, '').trim()
          const newTitle = needTitle && cleanTitle ? `Урок ${num}: ${cleanTitle}` : (curTitle || null)
          const newDesc  = needDesc && meta.description ? meta.description : (metaRows[0]?.description || null)
          await db.query('UPDATE lessons SET title = $1, description = $2 WHERE id = $3', [newTitle, newDesc, lessonId])
        }
      } catch (e) {
        console.error('generateLessonMeta failed:', e.message)
      }
    }

    // «Обработать всё» автоматически: картинки + переводы слов и упражнений на все языки
    await enrichLesson(lessonId)

    await db.query(
      "UPDATE lessons SET status = 'done', progress = $1 WHERE id = $2",
      [`Готово! Слов: ${consolidated.words.length}, упражнений: ${exercises.length + consolidated.words.length}`, lessonId]
    )

    return {
      lessonId,
      wordsCount: consolidated.words.length,
      exercisesCount: exercises.length,
    }
  } catch (err) {
    await db.query(
      "UPDATE lessons SET status = 'error', progress = $1 WHERE id = $2",
      [`Ошибка: ${err.message}`, lessonId]
    )
    throw err
  }
}

// ── Авто-разбор слов по тематическим наборам (анти-свалка) ──
// Слова (из фото/тетради) классифицируются AI по 22 темам + нормализуются (артикли),
// дедуплицируются внутри набора, докидываются переводы/картинки/упражнения.
// Возвращает сводку: сколько добавлено, сколько дублей, по каким темам.
export async function distributeWordsToSets(rawWords, ownerId, targetLang = 'de', rawSentences = []) {
  const clean = (rawWords || []).filter(w => w && w.de).map(w => ({ de: String(w.de).trim(), tr: String(w.tr || '').trim() }))
  if (!clean.length) return { added: 0, duplicates: 0, themes: [] }

  const client = await getOwnerClient(ownerId) // классификация — за счёт учителя (свой ключ) или платформенная
  const items = await classifyWordsToThemes(clean, targetLang, client)
  if (!items.length) return { added: 0, duplicates: 0, themes: [] }

  // Артикли берём по языку курса: раньше здесь был жёстко немецкий список, и в
  // английском наборе «the table» не совпадало с «table» — дедуп их пропускал.
  const bare = s => bareWord(s, targetLang)

  // Предложения из тетрадки/фото — реальные, идут в упражнения. Каждое несёт свои слова
  // (words: [de]), по их теме и определяем, в какой набор сохранить предложение.
  const sentences = (rawSentences || [])
    .map(s => ({
      text: String(s?.text || '').trim(),
      translation_ru: s?.translation_ru || s?.translation || null,
      words: (s?.words || []).map(w => bare(typeof w === 'string' ? w : (w?.de || ''))).filter(Boolean),
    }))
    .filter(s => s.text.length >= 4)

  // Карта: нормализованное слово → тема (по классификации)
  const themeByWord = {}
  for (const it of items) themeByWord[bare(it.de)] = it.theme

  const byTheme = new Map()
  for (const it of items) {
    if (!byTheme.has(it.theme)) byTheme.set(it.theme, [])
    byTheme.get(it.theme).push(it)
  }

  const affected = []
  const setByTheme = {} // тема → id набора
  let added = 0, dup = 0

  for (const [theme, its] of byTheme) {
    // найти или создать набор этой темы у владельца
    const { rows } = await db.query(
      'SELECT id FROM lessons WHERE is_set AND set_theme = $1 AND owner_id = $2 AND target_lang = $3 ORDER BY id LIMIT 1',
      [theme, ownerId, targetLang])
    let setId = rows[0]?.id
    if (!setId) {
      // тема двумя параметрами: один $2 в колонках разных типов (varchar/text) валит
      // Postgres «inconsistent types deduced for parameter» при создании НОВОЙ темы
      const ins = await db.query(
        `INSERT INTO lessons (owner_id, title, target_lang, status, is_set, set_theme)
         VALUES ($1, $2, $3, 'processing', true, $4) RETURNING id`,
        [ownerId, theme, targetLang, theme])
      setId = ins.rows[0].id
    }
    const knownSet = await knownWordsFor(targetLang)
    for (const it of its) {
      const norm = bare(it.de)
      // Дедуп по ВСЕМ наборам владельца (не только текущему): слово живёт максимум
      // в одном наборе, иначе при повторных фото тетради копится по темам-соседям.
      // Уроки учебника не учитываем — набор должен быть тематически полным,
      // а Словарь дедупит отображение сам (DISTINCT ON word_de).
      const { rows: ex } = await db.query(
        `SELECT 1 FROM words w JOIN lessons l ON l.id = w.lesson_id
         WHERE l.is_set AND l.owner_id = $1 AND l.target_lang = $3
           AND regexp_replace(lower(w.word_de), '^(${articlePattern(targetLang)})\\s+', '') = $2 LIMIT 1`,
        [ownerId, norm, targetLang])
      if (ex.length) { dup++; continue }
      const wordDe = normalizeIncomingWord(it.de, knownSet)
      if (!wordDe) continue
      await db.query(
        `INSERT INTO words (lesson_id, user_id, word_de, translation_ru, source)
         VALUES ($1, $2, $3, $4, 'camera') ON CONFLICT (lesson_id, word_de) DO NOTHING`,
        [setId, ownerId, wordDe, it.tr])
      added++
    }
    affected.push(setId)
    setByTheme[theme] = setId
  }

  // Сохраняем реальные предложения тетрадки в наборы по ТЕМЕ их слов (надёжно для глаголов:
  // не зависим от совпадения текста). Одно предложение может попасть в несколько наборов.
  let savedSents = 0
  for (const s of sentences) {
    const themes = [...new Set(s.words.map(w => themeByWord[w]).filter(Boolean))]
    // если тему слов не распознали — кладём в набор первой затронутой темы, чтобы не потерять
    const targetThemes = themes.length ? themes : (affected.length ? [Object.keys(setByTheme)[0]] : [])
    for (const th of targetThemes) {
      const sid = setByTheme[th]
      if (sid) { await saveSentences(sid, [{ text: s.text, translation_ru: s.translation_ru }], 'notebook'); savedSents++ }
    }
  }

  // Дообогащаем затронутые наборы В ФОНЕ (переводы на локали + картинки банк-дедуп + упражнения
  // ИЗ сохранённых предложений тетрадки), чтобы сразу вернуть сводку пользователю.
  ;(async () => {
    for (const id of affected) {
      try { await enrichLesson(id) } catch (e) { console.error('distribute enrich', id, e.message) }
      try { await regenerateExercisesFromDb(id) } catch (e) { console.error('distribute ex', id, e.message) }
    }
  })()
  return { added, duplicates: dup, themes: [...byTheme.keys()], sets: affected.length, sentences: savedSents }
}

// ── Устойчивая дообработка «зависших» уроков ────────────────────────────────
// Фоновая обработка PDF-курса идёт в памяти процесса и обрывается при рестарте
// бэкенда (деплой/сбой) — pending-уроки остаются необработанными. Дренер берёт
// их по одному и доводит до конца. Идемпотентно, переживает рестарты.
let _draining = false
export async function drainPendingLessons() {
  if (_draining) return
  _draining = true
  try {
    // После рестарта живого цикла нет → «processing» считаем зависшими. ВАЖНО: не все зависшие
    // одинаковы — урок, у которого уже ЕСТЬ слова/упражнения, завис на «✨ Обработать всё» (enrich),
    // а не на первичной обработке. Прогнать его через processLesson заново нельзя — он не дедуплицирует
    // упражнения (обычный INSERT без ON CONFLICT) и задвоит их. Такие уроки дообрабатываем через
    // idempotent enrichLesson (запросы там сами бьют только по недостающим полям) и сразу ставим done.
    const { rows: stuckEnrich } = await db.query(
      `SELECT id FROM lessons WHERE status='processing' AND EXISTS (SELECT 1 FROM words w WHERE w.lesson_id = lessons.id)`)
    for (const { id } of stuckEnrich) {
      try {
        await enrichLesson(id)
        await db.query("UPDATE lessons SET status='done', progress='Готово (дообработано после рестарта).' WHERE id=$1", [id])
      } catch (e) {
        console.error('drainPendingLessons enrich-recovery', id, e.message)
        await db.query("UPDATE lessons SET status='done', progress='Готово (с ошибками при дообработке).' WHERE id=$1", [id])
      }
    }
    // Остальные «processing» без слов — зависли на первичной обработке (никогда не были done),
    // их безопасно вернуть в pending и прогнать через полный processLesson.
    await db.query(`UPDATE lessons SET status='pending'
      WHERE status='processing' AND EXISTS (SELECT 1 FROM lesson_media m WHERE m.lesson_id = lessons.id)`)
    while (true) {
      const { rows } = await db.query(
        `SELECT id, owner_id FROM lessons
         WHERE status='pending' AND EXISTS (SELECT 1 FROM lesson_media m WHERE m.lesson_id = lessons.id)
         ORDER BY id LIMIT 1`)
      if (!rows[0]) break
      // processLesson сам ставит status='processing'/'done'/'error' — errored не попадёт снова в pending
      try { await processLesson(rows[0].id, rows[0].owner_id) }
      catch (e) { console.error('drainPendingLessons', rows[0].id, e.message) }
    }
  } finally { _draining = false }
}

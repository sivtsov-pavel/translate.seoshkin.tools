import { join } from 'path'
import { config } from '../config.js'
import { db } from '../db/index.js'
import { extractFromPhoto, mergeLesson, generateExercises, generateLessonMeta, enrichWords, translateWordsToAllLangs, translateExercisePayloads, translateLessonMeta, groupWordsByTheme } from './claude.js'
import { transcribeAudio } from './whisper.js'
import { fetchImageUrl, downloadAndSave } from './unsplash.js'
import { generateWordImage, isFunctionWord } from './imageGen.js'

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
  const targetLang = (await db.query('SELECT target_lang FROM lessons WHERE id=$1', [lessonId])).rows[0]?.target_lang || 'de'
  const { rows } = await db.query('SELECT id, word_de, translation_ru FROM words WHERE lesson_id=$1 AND image_url IS NULL ORDER BY id', [lessonId])
  const target = rows.filter(w => !isFunctionWord(w.word_de))
  let done = 0
  for (const w of target) {
    await setProgress(lessonId, `Рисую картинки ${done + 1}/${target.length}...`)
    try {
      const url = await generateWordImage(w.word_de, w.translation_ru, w.id, targetLang)
      if (url) { await db.query('UPDATE words SET image_url=$1 WHERE id=$2', [url, w.id]); done++ }
    } catch (e) { console.error('drawLessonImages', w.word_de, e.message) }
  }
  return done
}

async function setProgress(lessonId, text) {
  await db.query('UPDATE lessons SET progress = $1 WHERE id = $2', [text, lessonId])
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
    await setProgress(lessonId, 'Разбиваю урок на темы...')
    const { rows: words } = await db.query(
      'SELECT id, word_de, translation_ru, example_sentence, image_url, translations, source, media_id FROM words WHERE lesson_id=$1 ORDER BY id', [lessonId])
    if (words.length < 4) { await db.query("UPDATE lessons SET progress='Мало слов для разбивки (нужно ≥4)' WHERE id=$1", [lessonId]); return }

    const groups = await groupWordsByTheme(words, L.target_lang)
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
        `INSERT INTO lessons (owner_id, title, course_id, lesson_number, target_lang, status, progress)
         VALUES ($1,$2,$3,$4,$5,'processing','Готовлю набор...') RETURNING id`,
        [L.owner_id, `Урок ${base}.${n} — ${g.title}`, L.course_id, L.lesson_number, L.target_lang])
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
      const exercises = await generateExercises(nw, [], L.target_lang, await getLessonSentences(newId))
      const wordMap = Object.fromEntries(nw.map(w => [w.word_de, w.id]))
      for (const ex of exercises) {
        await db.query('INSERT INTO exercises (lesson_id, word_id, type, payload) VALUES ($1,$2,$3,$4)',
          [newId, wordMap[ex.word_de] || null, ex.type, JSON.stringify(ex.payload)])
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

export async function enrichLesson(lessonId) {
  const targetLang = (await db.query('SELECT target_lang FROM lessons WHERE id=$1', [lessonId])).rows[0]?.target_lang || 'de'
  const activeLocales = await getActiveLocales(targetLang) // напр. ['ru','es'] для испанского
  // 1) Переводы + примеры для неполных слов урока
  try {
    const { rows } = await db.query(
      `SELECT id, word_de, translation_ru FROM words
       WHERE lesson_id = $1 AND (example_sentence IS NULL OR word_de = translation_ru) ORDER BY id`, [lessonId])
    for (let i = 0; i < rows.length; i += 20) {
      const res = await enrichWords(rows.slice(i, i + 20))
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
    const autoImages = ps[0]?.ai !== 'false' // по умолчанию авто
    if (autoImages) {
      await setProgress(lessonId, 'Рисую картинки...')
      const { rows } = await db.query('SELECT id, word_de, translation_ru FROM words WHERE lesson_id = $1 AND image_url IS NULL ORDER BY id', [lessonId])
      for (const w of rows) {
        if (isFunctionWord(w.word_de)) continue
        try {
          const url = await generateWordImage(w.word_de, w.translation_ru, w.id, targetLang)
          if (url) await db.query('UPDATE words SET image_url = $1 WHERE id = $2', [url + '?v=3', w.id])
        } catch (e) { console.error('enrichLesson draw', w.word_de, e.message) }
      }
    }
  } catch (e) { console.error('enrichLesson images:', e.message) }

  // 3) Переводы слов на все языки локалей
  try {
    await setProgress(lessonId, 'Перевожу слова на все языки...')
    const { rows } = await db.query(
      `SELECT id, word_de, translation_ru FROM words
       WHERE lesson_id = $1 AND (translations IS NULL OR translations = '{}' OR NOT (translations ? 'sq')) ORDER BY id`, [lessonId])
    if (rows.length) {
      const results = await translateWordsToAllLangs(rows, activeLocales)
      for (const [id, t] of Object.entries(results)) {
        await db.query('UPDATE words SET translations = COALESCE(translations, \'{}\'::jsonb) || $1::jsonb WHERE id = $2', [JSON.stringify(t), parseInt(id)])
      }
    }
  } catch (e) { console.error('enrichLesson word-langs:', e.message) }

  // 4) Переводы упражнений (варианты/вопросы) на все языки
  try {
    await setProgress(lessonId, 'Перевожу упражнения...')
    const { rows } = await db.query(
      `SELECT id, type, payload FROM exercises
       WHERE lesson_id = $1 AND type IN ('multiple_choice','fill_blank','sentence_write')
         AND (payload_translations IS NULL OR payload_translations = '{}' OR NOT (payload_translations ? 'sq')) ORDER BY id`, [lessonId])
    for (let i = 0; i < rows.length; i += 15) {
      try {
        const results = await translateExercisePayloads(rows.slice(i, i + 15), activeLocales)
        for (const [id, langs] of Object.entries(results)) {
          await db.query('UPDATE exercises SET payload_translations = COALESCE(payload_translations, \'{}\'::jsonb) || $1::jsonb WHERE id = $2', [JSON.stringify(langs), parseInt(id)])
        }
      } catch (e) { console.error('enrichLesson ex-batch:', e.message) }
    }
  } catch (e) { console.error('enrichLesson exercises:', e.message) }

  // 5) Перевод ЗАГОЛОВКА и ОПИСАНИЯ урока на активные локали (для страницы «Сегодня»/списка)
  try {
    const { rows: lr } = await db.query(
      'SELECT title, description, title_translations, description_translations FROM lessons WHERE id=$1', [lessonId])
    const L = lr[0]
    if (L && L.title) {
      // Языки, на которые реально переводим (без ru[база] и de[фолбэк на ru])
      const need = (activeLocales || ALL_LOCALES).filter(l => l !== 'ru' && l !== 'de')
      const titleMissing = need.some(l => !(L.title_translations && L.title_translations[l]))
      const hasDesc = L.description && String(L.description).trim()
      const descMissing = hasDesc && need.some(l => !(L.description_translations && L.description_translations[l]))
      if (titleMissing || descMissing) {
        await setProgress(lessonId, 'Перевожу заголовок и описание урока...')
        const meta = await translateLessonMeta(L.title, L.description, activeLocales)
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
    const targetLang = (await db.query('SELECT target_lang FROM lessons WHERE id=$1', [lessonId])).rows[0]?.target_lang || 'de'

    const words = wordRows.map(w => ({
      word_de: w.word_de,
      translation_ru: w.translation_ru,
      example_sentence: w.example_sentence,
    }))
    const wordMap = Object.fromEntries(wordRows.map(w => [w.word_de, w.id]))

    // Удаляем старые упражнения (если есть)
    await db.query('DELETE FROM exercises WHERE lesson_id = $1', [lessonId])

    await setProgress(lessonId, `Генерирую упражнения для ${words.length} слов...`)

    // Генерируем упражнения батчами по 15 слов
    const exercises = await generateExercises(words, [], targetLang, await getLessonSentences(lessonId))

    for (const ex of exercises) {
      const wordId = wordMap[ex.word_de] || null
      await db.query(
        'INSERT INTO exercises (lesson_id, word_id, type, payload) VALUES ($1, $2, $3, $4)',
        [lessonId, wordId, ex.type, JSON.stringify(ex.payload)]
      )
    }

    // Диктант + «Проговори слова» (speech) — по одному на каждое слово
    for (const word of words) {
      const wordId = wordMap[word.word_de] || null
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

// Обработать ТОЛЬКО новые (необработанные) фото урока: извлечь слова + упражнения
// для новых слов (без пересоздания существующих). Возвращает число обработанных фото.
export async function processNewMedia(lessonId) {
  const { rows: media } = await db.query(
    "SELECT * FROM lesson_media WHERE lesson_id=$1 AND type='photo' AND processed=false", [lessonId])
  if (!media.length) return 0
  const { rows: lrow } = await db.query('SELECT owner_id, target_lang FROM lessons WHERE id=$1', [lessonId])
  const ownerId = lrow[0]?.owner_id
  const targetLang = lrow[0]?.target_lang || 'de'
  await setProgress(lessonId, `Обрабатываю ${media.length} новых фото...`)

  for (const src of ['textbook', 'extra']) {
    const list = media.filter(m => (m.source === 'extra' ? 'extra' : 'textbook') === src)
    if (!list.length) continue
    const pairs = []
    for (const photo of list) {
      try {
        const extraction = await extractFromPhoto(join(config.uploadDir, photo.file_path), targetLang)
        pairs.push({ mediaId: photo.id, extraction })
        await db.query('UPDATE lesson_media SET processed=true, raw_extraction=$1 WHERE id=$2', [JSON.stringify(extraction), photo.id])
      } catch (e) { console.error('processNewMedia extract', e.message) }
    }
    if (!pairs.length) continue
    // Умная обработка: сверяем с уже имеющимися словами урока (тетрадь после учебника)
    const { rows: existRows } = await db.query('SELECT word_de FROM words WHERE lesson_id=$1', [lessonId])
    const cons = await mergeLesson(pairs.map(p => p.extraction), null, existRows.map(r => r.word_de), targetLang)
    for (const w of (cons.words || [])) {
      const mediaId = mediaIdForWord(w.word_de, pairs) // с какого скана слово
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
    const exercises = await generateExercises(wordRows, [], targetLang, await getLessonSentences(lessonId))
    const wordMap = Object.fromEntries(wordRows.map(w => [w.word_de, w.id]))
    for (const ex of exercises) {
      await db.query('INSERT INTO exercises (lesson_id, word_id, type, payload) VALUES ($1,$2,$3,$4)',
        [lessonId, wordMap[ex.word_de] || null, ex.type, JSON.stringify(ex.payload)])
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
    await setProgress(lessonId, 'Добавляю слова с фото...')
    for (const w of words) {
      if (!w || !w.de) continue
      await db.query(
        `INSERT INTO words (lesson_id, user_id, word_de, translation_ru, source)
         VALUES ($1,$2,$3,$4,'camera') ON CONFLICT (lesson_id, word_de) DO NOTHING`,
        [lessonId, ownerId, String(w.de).trim(), (w.tr || '').trim() || null])
    }
    // Упражнения только для слов урока БЕЗ упражнений (новые)
    const { rows: wordRows } = await db.query(
      `SELECT w.id, w.word_de, w.translation_ru, w.example_sentence FROM words w
       WHERE w.lesson_id=$1 AND NOT EXISTS (SELECT 1 FROM exercises e WHERE e.word_id=w.id AND e.lesson_id=$1)`, [lessonId])
    if (wordRows.length) {
      await setProgress(lessonId, `Создаю упражнения для ${wordRows.length} новых слов...`)
      const exercises = await generateExercises(wordRows, [], targetLang, await getLessonSentences(lessonId))
      const wordMap = Object.fromEntries(wordRows.map(w => [w.word_de, w.id]))
      for (const ex of exercises) {
        await db.query('INSERT INTO exercises (lesson_id, word_id, type, payload) VALUES ($1,$2,$3,$4)',
          [lessonId, wordMap[ex.word_de] || null, ex.type, JSON.stringify(ex.payload)])
      }
      for (const w of wordRows) {
        const p = JSON.stringify({ word_de: w.word_de, translation_ru: w.translation_ru })
        await db.query('INSERT INTO exercises (lesson_id, word_id, type, payload) VALUES ($1,$2,$3,$4)', [lessonId, w.id, 'dictation', p])
        await db.query('INSERT INTO exercises (lesson_id, word_id, type, payload) VALUES ($1,$2,$3,$4)', [lessonId, w.id, 'speech', p])
      }
    }
    await enrichLesson(lessonId)
    await db.query("UPDATE lessons SET status='done', progress=$1 WHERE id=$2", [`Готово! Слова с фото добавлены.`, lessonId])
  } catch (err) {
    console.error('saveCameraWords:', err.message)
    await db.query("UPDATE lessons SET status='done', progress=$1 WHERE id=$2", [String(err.message).slice(0, 100), lessonId])
  }
}

export async function generateCustomSet(lessonId, wordIds) {
  try {
    await setProgress(lessonId, 'Собираю упражнения из выбранных слов...')
    const tl = (await db.query('SELECT target_lang FROM lessons WHERE id=$1', [lessonId])).rows[0]?.target_lang || 'de'
    const { rows: words } = await db.query(
      'SELECT id, word_de, translation_ru, example_sentence FROM words WHERE id = ANY($1::int[]) ORDER BY id', [wordIds])
    if (!words.length) {
      await db.query("UPDATE lessons SET status='error', progress='Нет слов' WHERE id=$1", [lessonId])
      return
    }
    const exercises = await generateExercises(words, [], tl, await getLessonSentences(lessonId))
    const wordMap = Object.fromEntries(words.map(w => [w.word_de, w.id]))
    for (const ex of exercises) {
      await db.query('INSERT INTO exercises (lesson_id, word_id, type, payload) VALUES ($1,$2,$3,$4)',
        [lessonId, wordMap[ex.word_de] || null, ex.type, JSON.stringify(ex.payload)])
    }
    for (const w of words) {
      const payload = JSON.stringify({ word_de: w.word_de, translation_ru: w.translation_ru })
      await db.query('INSERT INTO exercises (lesson_id, word_id, type, payload) VALUES ($1,$2,$3,$4)', [lessonId, w.id, 'dictation', payload])
      await db.query('INSERT INTO exercises (lesson_id, word_id, type, payload) VALUES ($1,$2,$3,$4)', [lessonId, w.id, 'speech', payload])
    }
    await enrichLesson(lessonId)  // переводы упражнений на все языки (у слов картинки/переводы уже есть)
    await db.query("UPDATE lessons SET status='done', progress=$1 WHERE id=$2", [`Готово! Слов: ${words.length}`, lessonId])
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
        const extraction = await extractFromPhoto(filepath, targetLang)
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
        transcription = await transcribeAudio(filepath)
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
      const cons = await mergeLesson(ex, text, existRows.map(r => r.word_de), targetLang)
      for (const word of (cons.words || [])) {
        const mediaId = mediaIdForWord(word.word_de, pairs) // с какого скана слово
        await db.query(
          `INSERT INTO words (lesson_id, user_id, word_de, translation_ru, example_sentence, source, media_id)
           VALUES ($1, $2, $3, $4, $5, $6, $7)
           ON CONFLICT (lesson_id, word_de)
           DO UPDATE SET example_sentence = COALESCE(EXCLUDED.example_sentence, words.example_sentence),
                         media_id = COALESCE(words.media_id, EXCLUDED.media_id)`,
          [lessonId, ownerId, word.word_de, word.translation_ru, word.example_sentence || null, source, mediaId]
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
      exercises = await generateExercises(consolidated.words, consolidated.grammar_points, targetLang, await getLessonSentences(lessonId))
    }

    const { rows: wordRows } = await db.query(
      'SELECT id, word_de FROM words WHERE user_id = $1 AND lesson_id = $2',
      [ownerId, lessonId]
    )
    const wordMap = Object.fromEntries(wordRows.map(w => [w.word_de, w.id]))

    for (const ex of exercises) {
      const wordId = wordMap[ex.word_de] || null
      await db.query(
        'INSERT INTO exercises (lesson_id, word_id, type, payload) VALUES ($1, $2, $3, $4)',
        [lessonId, wordId, ex.type, JSON.stringify(ex.payload)]
      )
    }

    // Диктант + «Проговори слова» (speech) — по одному на каждое слово, последними
    for (const word of consolidated.words) {
      const wordId = wordMap[word.word_de] || null
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
          const meta = await generateLessonMeta(consolidated.words, consolidated.grammar_points, targetLang)
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

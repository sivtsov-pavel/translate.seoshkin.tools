import { join } from 'path'
import { config } from '../config.js'
import { db } from '../db/index.js'
import { extractFromPhoto, mergeLesson, generateExercises, generateLessonMeta, enrichWords, translateWordsToAllLangs, translateExercisePayloads } from './claude.js'
import { transcribeAudio } from './whisper.js'
import { fetchImageUrl, downloadAndSave } from './unsplash.js'
import { generateWordImage, isFunctionWord } from './imageGen.js'

// «Нарисовать недостающие»: детсадовские ИИ-картинки для слов урока без фото.
// Служебные слова (предлоги/артикли/местоимения/числа) пропускаем — им картинка не нужна.
export async function drawLessonImages(lessonId) {
  const { rows } = await db.query('SELECT id, word_de, translation_ru FROM words WHERE lesson_id=$1 AND image_url IS NULL ORDER BY id', [lessonId])
  const target = rows.filter(w => !isFunctionWord(w.word_de))
  let done = 0
  for (const w of target) {
    await setProgress(lessonId, `Рисую картинки ${done + 1}/${target.length}...`)
    try {
      const url = await generateWordImage(w.word_de, w.translation_ru, w.id)
      if (url) { await db.query('UPDATE words SET image_url=$1 WHERE id=$2', [url, w.id]); done++ }
    } catch (e) { console.error('drawLessonImages', w.word_de, e.message) }
  }
  return done
}

async function setProgress(lessonId, text) {
  await db.query('UPDATE lessons SET progress = $1 WHERE id = $2', [text, lessonId])
}

// «Обработать всё»: докидываем недостающее для урока — переводы/примеры слов, картинки,
// переводы слов и упражнений на все языки. НЕ трогает упражнения и прогресс ученика.
// Вызывается в конце обработки и по кнопке «Обработать всё» для готового урока.
export async function enrichLesson(lessonId) {
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
          const url = await generateWordImage(w.word_de, w.translation_ru, w.id)
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
      const results = await translateWordsToAllLangs(rows)
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
        const results = await translateExercisePayloads(rows.slice(i, i + 15))
        for (const [id, langs] of Object.entries(results)) {
          await db.query('UPDATE exercises SET payload_translations = COALESCE(payload_translations, \'{}\'::jsonb) || $1::jsonb WHERE id = $2', [JSON.stringify(langs), parseInt(id)])
        }
      } catch (e) { console.error('enrichLesson ex-batch:', e.message) }
    }
  } catch (e) { console.error('enrichLesson exercises:', e.message) }
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
    const exercises = await generateExercises(words, [])

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
  const { rows: lrow } = await db.query('SELECT owner_id FROM lessons WHERE id=$1', [lessonId])
  const ownerId = lrow[0]?.owner_id
  await setProgress(lessonId, `Обрабатываю ${media.length} новых фото...`)

  for (const src of ['textbook', 'extra']) {
    const list = media.filter(m => (m.source === 'extra' ? 'extra' : 'textbook') === src)
    if (!list.length) continue
    const extractions = []
    for (const photo of list) {
      try {
        const extraction = await extractFromPhoto(join(config.uploadDir, photo.file_path))
        extractions.push(extraction)
        await db.query('UPDATE lesson_media SET processed=true, raw_extraction=$1 WHERE id=$2', [JSON.stringify(extraction), photo.id])
      } catch (e) { console.error('processNewMedia extract', e.message) }
    }
    if (!extractions.length) continue
    // Умная обработка: сверяем с уже имеющимися словами урока (тетрадь после учебника)
    const { rows: existRows } = await db.query('SELECT word_de FROM words WHERE lesson_id=$1', [lessonId])
    const cons = await mergeLesson(extractions, null, existRows.map(r => r.word_de))
    for (const w of (cons.words || [])) {
      await db.query(
        `INSERT INTO words (lesson_id, user_id, word_de, translation_ru, example_sentence, source)
         VALUES ($1,$2,$3,$4,$5,$6) ON CONFLICT (lesson_id, word_de)
         DO UPDATE SET example_sentence = COALESCE(EXCLUDED.example_sentence, words.example_sentence)`,
        [lessonId, ownerId, w.word_de, w.translation_ru, w.example_sentence || null, src])
    }
  }

  // Упражнения ТОЛЬКО для слов урока без упражнений (новые) — без дублей
  const { rows: wordRows } = await db.query(
    `SELECT w.id, w.word_de, w.translation_ru, w.example_sentence FROM words w
     WHERE w.lesson_id=$1 AND NOT EXISTS (SELECT 1 FROM exercises e WHERE e.word_id=w.id AND e.lesson_id=$1)`, [lessonId])
  if (wordRows.length) {
    await setProgress(lessonId, `Создаю упражнения для ${wordRows.length} новых слов...`)
    const exercises = await generateExercises(wordRows, [])
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
    const { rows: lrow } = await db.query('SELECT owner_id FROM lessons WHERE id=$1', [lessonId])
    const ownerId = lrow[0]?.owner_id
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
      const exercises = await generateExercises(wordRows, [])
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
    const { rows: words } = await db.query(
      'SELECT id, word_de, translation_ru, example_sentence FROM words WHERE id = ANY($1::int[]) ORDER BY id', [wordIds])
    if (!words.length) {
      await db.query("UPDATE lessons SET status='error', progress='Нет слов' WHERE id=$1", [lessonId])
      return
    }
    const exercises = await generateExercises(words, [])
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
      'SELECT text_content, text_content_extra, owner_id FROM lessons WHERE id = $1', [lessonId]
    )
    const textContent = lessonRows[0]?.text_content || null
    const textContentExtra = lessonRows[0]?.text_content_extra || null
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
        const extraction = await extractFromPhoto(filepath)
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
      await setProgress(lessonId, 'Составляю конспект урока...')
      // Тетрадь/доска (extra) сверяется с уже извлечёнными словами учебника — не дублируем
      const { rows: existRows } = await db.query('SELECT word_de FROM words WHERE lesson_id=$1', [lessonId])
      const cons = await mergeLesson(ex, text, existRows.map(r => r.word_de))
      for (const word of (cons.words || [])) {
        await db.query(
          `INSERT INTO words (lesson_id, user_id, word_de, translation_ru, example_sentence, source)
           VALUES ($1, $2, $3, $4, $5, $6)
           ON CONFLICT (lesson_id, word_de)
           DO UPDATE SET example_sentence = COALESCE(EXCLUDED.example_sentence, words.example_sentence)`,
          [lessonId, ownerId, word.word_de, word.translation_ru, word.example_sentence || null, source]
        )
      }
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
      exercises = await generateExercises(consolidated.words, consolidated.grammar_points)
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
          const meta = await generateLessonMeta(consolidated.words, consolidated.grammar_points)
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

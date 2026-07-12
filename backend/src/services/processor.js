import { join } from 'path'
import { config } from '../config.js'
import { db } from '../db/index.js'
import { extractFromPhoto, mergeLesson, generateExercises } from './claude.js'
import { transcribeAudio } from './whisper.js'

async function setProgress(lessonId, text) {
  await db.query('UPDATE lessons SET progress = $1 WHERE id = $2', [text, lessonId])
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

    // Диктант — по одному на каждое слово
    for (const word of words) {
      const wordId = wordMap[word.word_de] || null
      await db.query(
        'INSERT INTO exercises (lesson_id, word_id, type, payload) VALUES ($1, $2, $3, $4)',
        [lessonId, wordId, 'dictation', JSON.stringify({ word_de: word.word_de, translation_ru: word.translation_ru })]
      )
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

export async function processLesson(lessonId, ownerId) {
  await db.query("UPDATE lessons SET status = 'processing', progress = 'Начинаем...' WHERE id = $1", [lessonId])

  try {
    const { rows: lessonRows } = await db.query(
      'SELECT text_content, owner_id FROM lessons WHERE id = $1', [lessonId]
    )
    const textContent = lessonRows[0]?.text_content || null
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
      const cons = await mergeLesson(ex, text)
      for (const word of (cons.words || [])) {
        await db.query(
          `INSERT INTO words (lesson_id, user_id, word_de, translation_ru, example_sentence, source)
           VALUES ($1, $2, $3, $4, $5, $6)
           ON CONFLICT (user_id, word_de)
           DO UPDATE SET example_sentence = COALESCE(EXCLUDED.example_sentence, words.example_sentence)`,
          [lessonId, ownerId, word.word_de, word.translation_ru, word.example_sentence || null, source]
        )
      }
      allWords.push(...(cons.words || []))
      allGrammar.push(...(cons.grammar_points || []))
    }

    await ingest(textbookPhotos, 0, combinedText, 'textbook')
    if (extraPhotos.length > 0) await ingest(extraPhotos, textbookPhotos.length, null, 'extra')

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

    // Диктант — одно упражнение на каждое слово, всегда последними
    for (const word of consolidated.words) {
      const wordId = wordMap[word.word_de] || null
      await db.query(
        'INSERT INTO exercises (lesson_id, word_id, type, payload) VALUES ($1, $2, $3, $4)',
        [lessonId, wordId, 'dictation', JSON.stringify({ word_de: word.word_de, translation_ru: word.translation_ru })]
      )
    }

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

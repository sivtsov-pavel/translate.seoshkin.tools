import { join } from 'path'
import { config } from '../config.js'
import { db } from '../db/index.js'
import { extractFromPhoto, mergeLesson, generateExercises } from './claude.js'
import { transcribeAudio } from './whisper.js'

async function setProgress(lessonId, text) {
  await db.query('UPDATE lessons SET progress = $1 WHERE id = $2', [text, lessonId])
}

export async function processLesson(lessonId, ownerId) {
  await db.query("UPDATE lessons SET status = 'processing', progress = 'Начинаем...' WHERE id = $1", [lessonId])

  try {
    const { rows: lessonRows } = await db.query(
      'SELECT text_content FROM lessons WHERE id = $1', [lessonId]
    )
    const textContent = lessonRows[0]?.text_content || null

    const { rows: mediaFiles } = await db.query(
      'SELECT * FROM lesson_media WHERE lesson_id = $1',
      [lessonId]
    )

    const photos = mediaFiles.filter(m => m.type === 'photo')
    const audios = mediaFiles.filter(m => m.type === 'audio')

    // 1. Обрабатываем каждое фото через GPT-4o vision (пропускаем уже готовые из кэша)
    const photoExtractions = []
    for (let i = 0; i < photos.length; i++) {
      const photo = photos[i]

      if (photo.processed && photo.raw_extraction) {
        // Берём из БД — токены не тратим
        photoExtractions.push(typeof photo.raw_extraction === 'string'
          ? JSON.parse(photo.raw_extraction)
          : photo.raw_extraction)
        continue
      }

      await setProgress(lessonId, `Фото ${i + 1} из ${photos.length}...`)
      const filepath = join(config.uploadDir, photo.file_path)
      const extraction = await extractFromPhoto(filepath)
      photoExtractions.push(extraction)

      await db.query(
        'UPDATE lesson_media SET processed = true, raw_extraction = $1 WHERE id = $2',
        [JSON.stringify(extraction), photo.id]
      )
    }

    // 2. Транскрипция аудио
    let transcription = null
    if (audios.length > 0) {
      await setProgress(lessonId, 'Расшифровка аудио...')
      for (const audio of audios) {
        const filepath = join(config.uploadDir, audio.file_path)
        transcription = await transcribeAudio(filepath)
        await db.query('UPDATE lesson_media SET processed = true WHERE id = $1', [audio.id])
      }
    }

    // 3. Объединяем в единый конспект
    await setProgress(lessonId, 'Составляю конспект урока...')
    const combinedText = [transcription, textContent].filter(Boolean).join('\n\n') || null
    const hasContent = photoExtractions.length > 0 || combinedText
    const consolidated = hasContent
      ? await mergeLesson(photoExtractions, combinedText)
      : { words: [], grammar_points: [] }

    // 4. Сохраняем слова
    for (const word of consolidated.words) {
      await db.query(
        `INSERT INTO words (lesson_id, user_id, word_de, translation_ru, example_sentence)
         VALUES ($1, $2, $3, $4, $5)
         ON CONFLICT (user_id, word_de)
         DO UPDATE SET example_sentence = COALESCE(EXCLUDED.example_sentence, words.example_sentence)`,
        [lessonId, ownerId, word.word_de, word.translation_ru, word.example_sentence || null]
      )
    }

    for (const gp of consolidated.grammar_points) {
      await db.query(
        'INSERT INTO grammar_points (lesson_id, description, example) VALUES ($1, $2, $3)',
        [lessonId, gp.description, gp.example || null]
      )
    }

    // 5. Генерируем упражнения батчами по 15 слов
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

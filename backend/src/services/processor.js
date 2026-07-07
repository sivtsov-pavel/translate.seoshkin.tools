import { join } from 'path'
import { config } from '../config.js'
import { db } from '../db/index.js'
import { extractFromPhoto, mergeLesson, generateExercises } from './claude.js'
import { transcribeAudio } from './whisper.js'

// Главная функция оркестрации обработки урока
export async function processLesson(lessonId, ownerId) {
  await db.query("UPDATE lessons SET status = 'processing' WHERE id = $1", [lessonId])

  try {
    const { rows: mediaFiles } = await db.query(
      'SELECT * FROM lesson_media WHERE lesson_id = $1',
      [lessonId]
    )

    const photos = mediaFiles.filter(m => m.type === 'photo')
    const audios = mediaFiles.filter(m => m.type === 'audio')

    // 1. Обрабатываем каждое фото через Claude vision
    const photoExtractions = []
    for (const photo of photos) {
      const filepath = join(config.uploadDir, photo.file_path)
      const extraction = await extractFromPhoto(filepath)
      photoExtractions.push(extraction)

      await db.query(
        'UPDATE lesson_media SET processed = true, raw_extraction = $1 WHERE id = $2',
        [JSON.stringify(extraction), photo.id]
      )
    }

    // 2. Транскрипция аудио (берём первый файл для MVP)
    let transcription = null
    for (const audio of audios) {
      const filepath = join(config.uploadDir, audio.file_path)
      transcription = await transcribeAudio(filepath)
      await db.query('UPDATE lesson_media SET processed = true WHERE id = $1', [audio.id])
    }

    // 3. Объединяем в единый конспект через Claude
    const consolidated = photoExtractions.length > 0
      ? await mergeLesson(photoExtractions, transcription)
      : { words: [], grammar_points: [] }

    // 4. Сохраняем слова в БД
    for (const word of consolidated.words) {
      await db.query(
        `INSERT INTO words (lesson_id, user_id, word_de, translation_ru, example_sentence)
         VALUES ($1, $2, $3, $4, $5)
         ON CONFLICT (user_id, word_de)
         DO UPDATE SET example_sentence = COALESCE(EXCLUDED.example_sentence, words.example_sentence)`,
        [lessonId, ownerId, word.word_de, word.translation_ru, word.example_sentence || null]
      )
    }

    // Сохраняем грамматику
    for (const gp of consolidated.grammar_points) {
      await db.query(
        'INSERT INTO grammar_points (lesson_id, description, example) VALUES ($1, $2, $3)',
        [lessonId, gp.description, gp.example || null]
      )
    }

    // 5. Генерируем упражнения
    let exercises = []
    if (consolidated.words.length > 0) {
      exercises = await generateExercises(consolidated.words, consolidated.grammar_points)
    }

    // Получаем id слов для привязки упражнений
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

    await db.query("UPDATE lessons SET status = 'done' WHERE id = $1", [lessonId])

    return {
      lessonId,
      wordsCount: consolidated.words.length,
      exercisesCount: exercises.length,
    }
  } catch (err) {
    await db.query("UPDATE lessons SET status = 'error' WHERE id = $1", [lessonId])
    throw err
  }
}

import { db } from '../db/index.js'
import { generateClassSentences, translateSentencesAllLangs } from './claude.js'
import { sendToUser } from './push.js'

// Собрать игру: сгенерировать фразы из слов урока, перевести на 10 локалей,
// раздать ученикам по кругу, отправить push. Работает в фоне.
export async function buildClassGame(gameId, lessonId, count = 30) {
  const setP = (p) => db.query('UPDATE class_games SET progress=$1 WHERE id=$2', [p, gameId])
  try {
    // слова урока (через упражнения — там реальные слова урока)
    const { rows: words } = await db.query(
      `SELECT DISTINCT w.word_de FROM exercises e JOIN words w ON w.id=e.word_id
       WHERE e.lesson_id=$1 AND e.word_id IS NOT NULL`, [lessonId])
    if (!words.length) throw new Error('В уроке нет слов')

    await setP('Придумываю фразы…')
    const lines = await generateClassSentences(words, count)
    if (!lines.length) throw new Error('Не удалось сгенерировать фразы')

    await setP('Перевожу на 10 языков…')
    const translations = await translateSentencesAllLangs(lines.map(l => l.de))

    // ученики класса (общий пул) — кому раздаём
    const { rows: students } = await db.query(
      "SELECT id FROM users WHERE role='student' ORDER BY id")
    const studentIds = students.map(s => s.id)

    await setP('Раздаю ученикам…')
    for (let i = 0; i < lines.length; i++) {
      const assigned = studentIds.length ? studentIds[i % studentIds.length] : null
      await db.query(
        `INSERT INTO class_game_lines (game_id, ord, sentence_de, translations, role, assigned_user_id)
         VALUES ($1,$2,$3,$4,$5,$6)`,
        [gameId, i, lines[i].de, JSON.stringify(translations[i] || {}), lines[i].role || 'statement', assigned])
    }

    await db.query("UPDATE class_games SET status='ready', progress=$1 WHERE id=$2",
      [`Готово! Фраз: ${lines.length}`, gameId])

    // push каждому ученику, у кого есть фразы
    const { rows: lessonRow } = await db.query('SELECT title FROM lessons WHERE id=$1', [lessonId])
    const lessonTitle = lessonRow[0]?.title || 'урок'
    for (const uid of new Set(studentIds)) {
      const cnt = await db.query('SELECT count(*)::int c FROM class_game_lines WHERE game_id=$1 AND assigned_user_id=$2', [gameId, uid])
      if (!cnt.rows[0].c) continue
      try {
        await sendToUser(uid, {
          title: '🎮 Игра класса готова!',
          body: `«${lessonTitle}» — твои ${cnt.rows[0].c} фраз ждут. Читаем, когда скажет учитель.`,
          icon: '/icons/icon-192.png',
          url: `/class-game/${gameId}`,
        })
      } catch {}
    }
  } catch (err) {
    console.error('buildClassGame:', err.message)
    await db.query("UPDATE class_games SET status='error', progress=$1 WHERE id=$2",
      [String(err.message).slice(0, 120), gameId])
  }
}

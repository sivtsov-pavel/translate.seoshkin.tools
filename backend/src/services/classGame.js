import { db } from '../db/index.js'
import { generateClassPairs, translateSentencesAllLangs } from './claude.js'
import { sendToUser } from './push.js'

// Собрать игру: сгенерировать пары «вопрос-ответ» из слов урока, перевести на 10 локалей,
// раздать по одной паре (2 строки) каждому ученику, отправить push. Работает в фоне.
export async function buildClassGame(gameId, lessonId, count = 30) {
  const setP = (p) => db.query('UPDATE class_games SET progress=$1 WHERE id=$2', [p, gameId])
  try {
    // слова урока (через упражнения — там реальные слова урока)
    const { rows: words } = await db.query(
      `SELECT DISTINCT w.word_de FROM exercises e JOIN words w ON w.id=e.word_id
       WHERE e.lesson_id=$1 AND e.word_id IS NOT NULL`, [lessonId])
    if (!words.length) throw new Error('В уроке нет слов')

    // ученики класса (общий пул) — кому раздаём
    const { rows: students } = await db.query(
      "SELECT id FROM users WHERE role='student' ORDER BY id")
    const studentIds = students.map(s => s.id)

    // По ОДНОЙ паре вопрос-ответ на каждого ученика (2 строки на человека)
    const nPairs = studentIds.length || Math.max(3, Math.ceil((count || 12) / 2))

    await setP('Придумываю вопросы и ответы…')
    const pairs = await generateClassPairs(words, nPairs)
    if (!pairs.length) throw new Error('Не удалось сгенерировать пары')

    await setP('Перевожу на 10 языков…')
    const flat = pairs.flatMap(p => [p.question, p.answer])
    const tr = await translateSentencesAllLangs(flat)

    await setP('Раздаю ученикам…')
    let ord = 0
    for (let i = 0; i < pairs.length; i++) {
      const assigned = studentIds.length ? studentIds[i % studentIds.length] : null
      // вопрос и ответ пары — одному ученику, подряд
      await db.query(
        `INSERT INTO class_game_lines (game_id, ord, sentence_de, translations, role, assigned_user_id)
         VALUES ($1,$2,$3,$4,'question',$5)`,
        [gameId, ord, pairs[i].question, JSON.stringify(tr[i * 2] || {}), assigned])
      ord++
      await db.query(
        `INSERT INTO class_game_lines (game_id, ord, sentence_de, translations, role, assigned_user_id)
         VALUES ($1,$2,$3,$4,'answer',$5)`,
        [gameId, ord, pairs[i].answer, JSON.stringify(tr[i * 2 + 1] || {}), assigned])
      ord++
    }

    await db.query("UPDATE class_games SET status='ready', progress=$1 WHERE id=$2",
      [`Готово! Пар: ${pairs.length}`, gameId])

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

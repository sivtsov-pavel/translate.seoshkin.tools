#!/usr/bin/env node
// Записи-предложения из словаря → в наборы фраз урока. Решение Павла от 23.08.2026.
//
// В словарь при загрузке тетради попадали не слова, а целые фразы: «ich bin dreißig.»,
// «Ich wohne in München», «Guten Abend, Deutschland». Карточка «слово ↔ перевод» им
// не подходит: учить «ich bin dreißig» как словарную единицу бессмысленно, а из-за
// таких записей у урока 19 не сходились счётчики и (до правки drip.js) не закрывался урок.
// При этом сами фразы полезны — для них в приложении есть отдельный тренажёр фраз
// (phrase_topics / phrases), где отрабатывают «послушай» и «собери».
//
// Что делает: создаёт набор фраз урока (если его ещё нет), переносит туда фразу с её
// переводами на все локали и удаляет запись из словаря вместе с упражнениями к ней.
//
// Идемпотентный: фраза, уже лежащая в наборе, второй раз не добавляется.
// 💸 OpenAI не трогает: $0 (переводы берём из самой записи).
//
//   node scripts/move-sentences-to-phrases-2026-08-23.mjs           # план
//   node scripts/move-sentences-to-phrases-2026-08-23.mjs --apply
//
// Бэкап в /tmp контейнера — забрать на хост:
//   docker cp translate-backend-1:/tmp/sentences-to-phrases-rollback-2026-08-23.json /home/seosite/translate-backups/
import { db } from '../src/db/index.js'
import { logOperation } from '../src/services/opLog.js'
import fs from 'node:fs'

const APPLY = process.argv.includes('--apply')
const BACKUP = '/tmp/sentences-to-phrases-rollback-2026-08-23.json'
// Только немецкий курс: в английском разговорные обороты («Good question.», «Hurry up!»)
// заведены в словарь намеренно — это фразовый материал того учебника, его не трогаем.
const LANG = process.argv.find(a => a.startsWith('--lang='))?.split('=')[1] || 'de'

// Фраза, а не слово: есть знак конца предложения или четыре и больше слов.
// Порог в четыре слова намеренный: «sich erinnern an», «der beste Freund», «Guten Abend» —
// нормальные словарные записи из двух-трёх слов, их трогать нельзя.
// Скобки с сокращением снимаем до проверки, иначе «zum Beispiel (z.B.)» уезжает в фразы
// из-за точек внутри сокращения, хотя это обычная словарная запись.
const NOBRACKETS = `trim(regexp_replace(w.word_de, '\\([^)]*\\)', '', 'g'))`
const SENTENCE = `(${NOBRACKETS} ~ '[.!?]'
   OR array_length(string_to_array(${NOBRACKETS}, ' '), 1) >= 4)`

async function main() {
  const { rows: sentences } = await db.query(`
    SELECT w.id, w.lesson_id, w.word_de, w.translation_ru, w.translations,
           l.lesson_number, l.title AS lesson_title, l.target_lang, l.school_id
    FROM words w JOIN lessons l ON l.id = w.lesson_id
    WHERE l.target_lang = $1 AND ${SENTENCE}
    ORDER BY w.lesson_id, w.id`, [LANG])

  if (!sentences.length) { console.log('Записей-предложений нет.'); return }

  const byLesson = new Map()
  for (const s of sentences) {
    if (!byLesson.has(s.lesson_id)) byLesson.set(s.lesson_id, [])
    byLesson.get(s.lesson_id).push(s)
  }

  console.log(`Записей-предложений: ${sentences.length} в ${byLesson.size} уроках`)
  for (const [lessonId, list] of [...byLesson].slice(0, 12)) {
    console.log(`  урок ${list[0].lesson_number ?? '—'} (id ${lessonId}): ${list.length}`)
    for (const s of list.slice(0, 3)) console.log(`      «${s.word_de}» = «${s.translation_ru}»`)
  }
  if (byLesson.size > 12) console.log(`  … и ещё ${byLesson.size - 12} уроков`)

  if (!APPLY) { console.log('\nЭто ПЛАН. Запусти с --apply, чтобы применить.'); return }

  const { rows: wordsBak } = await db.query('SELECT * FROM words WHERE id = ANY($1)',
    [sentences.map(s => s.id)])
  const { rows: exBak } = await db.query('SELECT * FROM exercises WHERE word_id = ANY($1)',
    [sentences.map(s => s.id)])
  fs.writeFileSync(BACKUP, JSON.stringify({ words: wordsBak, exercises: exBak }, null, 1))
  console.log(`\nБэкап: ${BACKUP} (слов ${wordsBak.length}, упражнений ${exBak.length})`)

  let moved = 0, skipped = 0, topicsCreated = 0
  for (const [lessonId, list] of byLesson) {
    const first = list[0]
    // Набор фраз урока: у одного урока он ровно один (частичный уникальный индекс)
    let { rows: topic } = await db.query('SELECT id FROM phrase_topics WHERE lesson_id = $1', [lessonId])
    if (!topic.length) {
      const slug = `lesson-${lessonId}-sentences`
      const title = first.lesson_number ? `Фразы урока ${first.lesson_number}` : 'Фразы урока'
      const { rows: created } = await db.query(
        `INSERT INTO phrase_topics (slug, lang, level, title, emoji, source, lesson_id, school_id, published)
         VALUES ($1, $2, 'A1', $3, '💬', 'lesson', $4, $5, FALSE)
         ON CONFLICT (lesson_id) WHERE lesson_id IS NOT NULL DO UPDATE SET title = phrase_topics.title
         RETURNING id`,
        [slug, first.target_lang || 'de', title, lessonId, first.school_id])
      topic = created
      topicsCreated++
    }
    const topicId = topic[0].id

    const { rows: existing } = await db.query('SELECT text, position FROM phrases WHERE topic_id = $1', [topicId])
    const have = new Set(existing.map(p => p.text.trim().toLowerCase()))
    let position = existing.reduce((m, p) => Math.max(m, p.position), 0)

    for (const s of list) {
      const text = s.word_de.trim()
      if (have.has(text.toLowerCase())) { skipped++ } else {
        // Переводы фразы: русский лежит отдельным полем, остальные локали — в translations
        const tr = { ru: s.translation_ru, ...(s.translations || {}) }
        await db.query(
          `INSERT INTO phrases (topic_id, position, text, translations, word_ids)
           VALUES ($1, $2, $3, $4, '{}')`,
          [topicId, ++position, text, JSON.stringify(tr)])
        moved++
      }
      await db.query('DELETE FROM words WHERE id = $1', [s.id])
    }
  }

  console.log(`Перенесено фраз: ${moved}, уже были в наборе: ${skipped}, создано наборов: ${topicsCreated}`)
  console.log(`Из словаря удалено записей: ${sentences.length}`)
  console.log(`Откат: слова и упражнения целиком лежат в ${BACKUP}`)

  await logOperation({
    kind: 'cleanup', status: 'ok', costUsd: 0, items: moved,
    message: `Записи-предложения перенесены из словаря в наборы фраз: ${moved} фраз, ${topicsCreated} новых наборов`,
    meta: { script: 'move-sentences-to-phrases-2026-08-23', backup: BACKUP },
  })
}

main().then(() => process.exit(0)).catch(e => { console.error(e); process.exit(1) })

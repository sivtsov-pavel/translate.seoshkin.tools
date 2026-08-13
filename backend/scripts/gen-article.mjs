#!/usr/bin/env node
// Упражнение «Артикль»: der/die/das к существительному — rule-based, БЕЗ OpenAI.
//
// Артикль невозможно выучить карточкой «die — определённый артикль женского рода»:
// он учится вместе со словом. Поэтому служебные карточки заменяем упражнением,
// где артикль выбирают к настоящему существительному, с картинкой и переводом.
//
// Аддитивно, дубли не создаёт, цена — $0.
//   node scripts/gen-article.mjs           # план
//   node scripts/gen-article.mjs --apply   # создать
import { db } from '../src/db/index.js'

const APPLY = process.argv.includes('--apply')

const { rows } = await db.query(
  `SELECT w.id, w.lesson_id, w.word_de, w.translation_ru
   FROM words w JOIN lessons l ON l.id = w.lesson_id
   WHERE l.target_lang = 'de' AND w.word_de ~ '^(der|die|das) [A-ZÄÖÜ]'
     AND NOT EXISTS (SELECT 1 FROM exercises e WHERE e.word_id = w.id AND e.type = 'article')
   ORDER BY w.id`)

console.log(`\nСуществительных без упражнения «Артикль»: ${rows.length}`)
let created = 0
for (const w of rows) {
  const [article, ...rest] = w.word_de.trim().split(/\s+/)
  const noun = rest.join(' ')
  if (!noun) continue
  if (created < 12) console.log(`  ${w.word_de} → ${article}`)
  if (APPLY) {
    const payload = JSON.stringify({
      noun, article: article.toLowerCase(), word_de: w.word_de, translation_ru: w.translation_ru,
    })
    await db.query(
      `INSERT INTO exercises (lesson_id, word_id, type, payload) VALUES ($1, $2, 'article', $3)`,
      [w.lesson_id, w.id, payload])
  }
  created++
}
console.log(APPLY
  ? `\nСоздано упражнений: ${created}. OpenAI НЕ вызывался (0$).`
  : `\nЭто только план. Запуск: node scripts/gen-article.mjs --apply`)
process.exit(0)

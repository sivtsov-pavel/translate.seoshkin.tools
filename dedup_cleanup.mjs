// Разовая чистка банка: 84 дубля внутри наборов → каждое слово в ОДНУ верную тему (AI),
// лишние копии удаляем, артикли нормализуем. Омографы (разный смысл) НЕ трогаем.
import { db } from '/app/src/db/index.js'
import { classifyWordsToThemes } from '/app/src/services/claude.js'
import { regenerateExercisesFromDb } from '/app/src/services/processor.js'

const bare = s => String(s || '').toLowerCase().replace(/^(der|die|das|ein|eine)\s+/, '')

// 1) Дубли внутри наборов
const { rows: dups } = await db.query(`
  SELECT regexp_replace(lower(word_de),'^(der|die|das|ein|eine)\\s+','') norm,
         count(*)::int n, count(DISTINCT lower(translation_ru))::int meanings,
         json_agg(json_build_object('id',w.id,'lesson_id',w.lesson_id,'word_de',word_de,'tr',translation_ru,'img',(image_url IS NOT NULL))
                  ORDER BY (image_url IS NOT NULL) DESC, char_length(word_de) DESC) copies
  FROM words w JOIN lessons l ON l.id=w.lesson_id
  WHERE l.is_set
  GROUP BY norm HAVING count(*)>1`)

const real = dups.filter(d => d.meanings === 1)
const homographs = dups.filter(d => d.meanings > 1)
console.log(`Дублей-норм: ${dups.length}; настоящих (1 смысл): ${real.length}; омографов (пропуск): ${homographs.length}`)
if (homographs.length) console.log('  омографы:', homographs.map(h => h.norm).join(', '))

// 2) Классифицируем настоящие дубли (тема + форма с артиклем)
const toClassify = real.map(d => ({ de: d.copies[0].word_de, tr: d.copies[0].tr }))
const items = await classifyWordsToThemes(toClassify, 'de')
const byNorm = {}
for (const it of items) byNorm[bare(it.de)] = it

const affected = new Set()
let kept = 0, deleted = 0
for (const d of real) {
  const info = byNorm[d.norm]
  if (!info) { console.log('  ! нет классификации для', d.norm); continue }
  const theme = info.theme
  const form = info.de   // форма с артиклем
  const { rows: sr } = await db.query('SELECT id FROM lessons WHERE is_set AND set_theme=$1 ORDER BY id LIMIT 1', [theme])
  const targetSet = sr[0]?.id
  if (!targetSet) { console.log('  ! нет набора темы', theme); continue }

  const copies = d.copies
  // оставляем копию из целевого набора (если есть), иначе с картинкой, иначе первую
  const keep = copies.find(c => c.lesson_id === targetSet) || copies.find(c => c.img) || copies[0]
  const delIds = copies.filter(c => c.id !== keep.id).map(c => c.id)
  if (delIds.length) { await db.query('DELETE FROM words WHERE id = ANY($1::int[])', [delIds]); deleted += delIds.length }
  // переносим keep в целевой набор + нормальная форма (с артиклем)
  await db.query('UPDATE words SET lesson_id=$1, word_de=$2 WHERE id=$3', [targetSet, form, keep.id])
  kept++
  for (const c of copies) affected.add(c.lesson_id)
  affected.add(targetSet)
  console.log(`  «${d.norm}» → ${theme} (форма: ${form}); удалено копий: ${delIds.length}`)
}

// 3) Артикли: существительные без артикля в наборах → нормализуем форму
const { rows: noart } = await db.query(`
  SELECT w.id, w.word_de, w.translation_ru tr FROM words w JOIN lessons l ON l.id=w.lesson_id
  WHERE l.is_set AND word_de ~ '^[A-ZÄÖÜ]' AND word_de !~ '\\s' AND word_de !~* '^(der|die|das|ein|eine)'`)
if (noart.length) {
  const na = await classifyWordsToThemes(noart.map(w => ({ de: w.word_de, tr: w.tr })), 'de')
  const formByBare = {}
  for (const it of na) formByBare[bare(it.de)] = it.de
  let art = 0
  for (const w of noart) {
    const form = formByBare[bare(w.word_de)]
    // обновляем только если AI реально добавил артикль (иначе не трогаем — это не существительное)
    if (form && /^(der|die|das)\s/i.test(form) && form.toLowerCase() !== w.word_de.toLowerCase()) {
      try {
        await db.query('UPDATE words SET word_de=$1 WHERE id=$2', [form, w.id])
        const { rows } = await db.query('SELECT lesson_id FROM words WHERE id=$1', [w.id])
        if (rows[0]) affected.add(rows[0].lesson_id)
        art++
      } catch (e) { /* конфликт уникальности — слово уже есть с артиклем, пропускаем */ }
    }
  }
  console.log(`Артиклей добавлено: ${art} (из ${noart.length} кандидатов)`)
}

// 4) Перегенерируем упражнения затронутых наборов
for (const id of affected) {
  try { await regenerateExercisesFromDb(id) } catch (e) { console.error('ex', id, e.message) }
}
console.log(`ИТОГ: оставлено ${kept}, удалено дублей ${deleted}, затронуто наборов ${affected.size}`)
console.log('ЧИСТКА ЗАВЕРШЕНА')
process.exit(0)

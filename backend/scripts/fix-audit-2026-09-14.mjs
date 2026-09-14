#!/usr/bin/env node
// Разбор находок сплошного аудита 14.09.2026 (scripts/audit-exercises.mjs).
//
// Всё, что здесь есть, чинится ДЕТЕРМИНИРОВАННО: тексты написаны руками и прочитаны
// глазами, модель не вызывается ни разу. 💸 Денег не тратит.
//
// Что разбираем:
//
//   A. Пять словарных примеров, написанных по-русски («Vor — перед, Nach — после.»).
//      Их показывает флеш-карта строкой «в предложении» — ученик видит русский текст
//      там, где должен быть немецкий.
//   B. Точечные правки payload: ответа нет среди вариантов, повтор вариантов,
//      вопрос с русским словом вместо изучаемого, немецкий шаблон вопроса в курсе
//      английского, задание-перевод, не совпадающее со своим эталоном.
//   C. Одиннадцать упражнений без word_id: без слова у них нет ни картинки, ни
//      перевода. Привязываем к словам урока; точный дубль удаляем.
//   D. Слова «hässlich» в уроке 38 не было вовсе — три упражнения висели ни на чём.
//      Заводим слово (переводы на все локали написаны руками) и привязываем.
//   E. «gefällst» — спрягаемая форма с битым примером («Er gefällst dir»), и рядом
//      в том же уроке лежит правильное «gefallen» со всеми упражнениями. Это дубль
//      с опечаткой: переименовать нельзя (упрёмся в уникальный индекс), убираем.
//   F. Девятнадцать служебных слов без флага is_function_word.
//   G. Пять «Добавь букву», которые нельзя решить в принципе: «das Ei», «die EU»,
//      «the UK», «das Öl» — прятать в них нечего (два знака после артикля).
//
// Идемпотентно: каждая часть сперва смотрит, что в базе, и молчит, если правка уже
// применена. Повторный прогон обязан напечатать нули.
//
// Запуск на бою:
//   docker compose -f docker-compose.prod.yml exec -T backend node scripts/fix-audit-2026-09-14.mjs
//   docker compose -f docker-compose.prod.yml exec -T backend node scripts/fix-audit-2026-09-14.mjs --apply
import { db } from '../src/db/index.js'
import { buildMask } from '../src/services/letterFill.js'

const apply = process.argv.includes('--apply')
const log = []
const say = (s) => { log.push(s); console.log(s) }

// ── A. Словарные примеры на русском ───────────────────────────────────────────
// Примеры взяты из уже существующих упражнений тех же слов, чтобы материал
// не расходился сам с собой.
const WORD_EXAMPLES = [
  { id: 376,  de: 'Mein Vorname ist Anna.',            ru: 'Меня зовут Анна.' },
  { id: 436,  de: 'Die Katze sitzt vor der Tür.',      ru: 'Кошка сидит перед дверью.' },
  { id: 437,  de: 'Nach dem Essen trinke ich Kaffee.', ru: 'После еды я пью кофе.' },
  { id: 3028, de: 'Nach dem Essen gehen wir spazieren.', ru: 'После еды мы идём гулять.' },
  { id: 3029, de: 'Vor dem Haus stehen Bäume.',        ru: 'Перед домом стоят деревья.' },
]

// ── B. Точечные правки payload упражнений ─────────────────────────────────────
// Ключ — id упражнения, значение — поля, которые надо положить в payload.
const PAYLOAD_FIXES = {
  // Ответ «Sie» (с заглавной) не совпадал ни с одним вариантом: в вариантах лежало «sie».
  186784: { options: ['Sie', 'Er'] },
  // Вариант «gefällt» стоял дважды — выбор из двух одинаковых ответов не выбор.
  186102: { options: ['gefällt', 'gefalle', 'gefallen'] },
  // В вопросе стояло русское «много» вместо изучаемого «viele».
  185494: { question: 'Wie heißt das auf Russisch: viele?' },
  // Курс английского, а вопрос по-немецки. Шаблон курса — «How do you say it in Russian».
  185057: { question: 'How do you say it in Russian: drinks cola?' },
  185059: { question: 'How do you say it in Russian: people?' },
  185061: { question: 'How do you say it in Russian: Alicia Keys?' },
  // Задание и эталон были из разных предложений: собирать «Wie gefällt Ihnen der Herd
  // hier?» по заданию «Ты нравишься мне» невозможно.
  186104: { example_ru: 'Как вам нравится эта плита?' },
  // Урок 37: у восьми упражнений один эталон на всех, а задания свои. Каждой паре
  // возвращаем её собственное предложение.
  185082: { example: 'Entschuldigung, ist das Ihre Jacke?', example_ru: 'Извините, это ваша куртка?' },
  185087: { example: 'Entschuldigung, wo ist der Bahnhof?', example_ru: 'Извините, где вокзал?' },
  185097: { example: 'Das ist mein Buch.',                  example_ru: 'Это моя книга.' },
  185102: { example: 'Ich bin ein Schüler.',                example_ru: 'Я ученик.' },
  185107: { example: 'Können Sie das für mich übersetzen?', example_ru: 'Вы можете перевести это для меня?' },
  185112: { example: 'Ich kaufe das für dich.',             example_ru: 'Я покупаю это для тебя.' },
  185117: { example: 'Kannst du mich hören?',               example_ru: 'Ты меня слышишь?' },
  // Родное упражнение слова «mich»: эталон про «переведите для меня», а задание —
  // «Я люблю себя». Собрать одно по другому нельзя.
  185320: { example: 'Kannst du mich hören?',               example_ru: 'Ты меня слышишь?' },
}

// ── C. Упражнения без слова → к какому слову привязать ────────────────────────
const LINKS = {
  185082: 8730,  // Ihre
  185087: 8729,  // die Entschuldigung
  185097: 8731,  // das
  185102: 8732,  // sein
  185107: 8733,  // übersetzen
  185112: 8734,  // für
  185117: 8735,  // mich
}
// Точный дубль: то же слово, тот же тип, тот же урок. Уникальный индекс его не поймал,
// потому что word_id был пуст.
const DUP_EXERCISES = [185092]

// ── D. Слово, которого не было ────────────────────────────────────────────────
const NEW_WORD = {
  lessonId: 640,
  word_de: 'hässlich',
  translation_ru: 'уродливый',
  example: 'Der Tisch ist hässlich.',
  example_ru: 'Стол уродливый.',
  translations: {
    en: 'ugly', es: 'feo', fr: 'laid', uk: 'потворний',
    bg: 'грозен', tr: 'çirkin', ar: 'قبيح', sq: 'i shëmtuar',
  },
  // Упражнения, которые ждут это слово
  exercises: [186319, 186320, 186321],
}

// ── E. Слово-дубль с опечаткой ────────────────────────────────────────────────
const DUP_WORD = { id: 8894, word: 'gefällst', keep: 8812, keepWord: 'gefallen' }

// ── F. Служебные слова ────────────────────────────────────────────────────────
const FUNCTION_WORD_IDS = [6745, 8737, 8731, 8780, 8779, 8740, 8751, 8772, 8793,
  8848, 8897, 8882, 8827, 8891, 8791, 8787, 8845, 8809, 8890]

// ── G. Нерешаемые «Добавь букву» ──────────────────────────────────────────────
const HOPELESS_LETTER_FILL = [69626, 40199, 99761, 168651, 144229]

// ─────────────────────────────────────────────────────────────────────────────
let changes = 0
const rollback = { exercises: [], words: [] }

// A
{
  const { rows } = await db.query(
    `SELECT id, word_de, example_sentence, example_sentence_ru FROM words WHERE id = ANY($1)`,
    [WORD_EXAMPLES.map(w => w.id)])
  let n = 0
  for (const fix of WORD_EXAMPLES) {
    const cur = rows.find(r => r.id === fix.id)
    if (!cur) { say(`A: слова #${fix.id} нет — пропуск`); continue }
    if (cur.example_sentence === fix.de && cur.example_sentence_ru === fix.ru) continue
    say(`A: #${fix.id} «${cur.word_de}»: «${cur.example_sentence}» → «${fix.de}»`)
    if (apply) await db.query(
      `UPDATE words SET example_sentence = $2, example_sentence_ru = $3 WHERE id = $1`,
      [fix.id, fix.de, fix.ru])
    n++
  }
  say(`A. Примеры на русском: ${n}`)
  changes += n
}

// B
{
  let n = 0
  for (const [id, patch] of Object.entries(PAYLOAD_FIXES)) {
    const { rows } = await db.query('SELECT id, payload FROM exercises WHERE id = $1', [id])
    if (!rows[0]) { say(`B: упражнения #${id} нет — пропуск`); continue }
    const cur = rows[0].payload || {}
    const same = Object.entries(patch).every(([k, v]) =>
      JSON.stringify(cur[k]) === JSON.stringify(v))
    if (same) continue
    say(`B: #${id} ${Object.keys(patch).join(', ')}`)
    rollback.exercises.push({ id: Number(id), payload: cur })
    if (apply) await db.query(
      `UPDATE exercises SET payload = payload || $2::jsonb WHERE id = $1`, [id, JSON.stringify(patch)])
    n++
  }
  say(`B. Правок payload: ${n}`)
  changes += n
}

// C
{
  let n = 0
  for (const [id, wordId] of Object.entries(LINKS)) {
    const { rows } = await db.query('SELECT * FROM exercises WHERE id = $1', [id])
    if (!rows[0] || rows[0].word_id === Number(wordId)) continue
    // У слова уже есть упражнение этого типа? Тогда сирота — лишняя копия второго
    // прохода генерации, а не потерянное упражнение: привязка упрётся в уникальный
    // индекс (lesson_id, word_id, type). Такую копию убираем.
    const { rows: twin } = await db.query(
      `SELECT id FROM exercises WHERE word_id = $1 AND type = $2 AND lesson_id = $3`,
      [wordId, rows[0].type, rows[0].lesson_id])
    if (twin.length) {
      say(`C: #${id} — у слова ${wordId} уже есть ${rows[0].type} (#${twin[0].id}), копию удаляем`)
      rollback.exercises.push(rows[0])
      if (apply) await db.query('DELETE FROM exercises WHERE id = $1', [id])
    } else {
      say(`C: #${id} → слово ${wordId}`)
      if (apply) await db.query('UPDATE exercises SET word_id = $2 WHERE id = $1', [id, wordId])
    }
    n++
  }
  for (const id of DUP_EXERCISES) {
    const { rows } = await db.query('SELECT * FROM exercises WHERE id = $1', [id])
    if (!rows[0]) continue
    say(`C: дубль #${id} удаляем`)
    rollback.exercises.push(rows[0])
    if (apply) await db.query('DELETE FROM exercises WHERE id = $1', [id])
    n++
  }
  say(`C. Сироты: ${n}`)
  changes += n
}

// D
{
  const { rows: exist } = await db.query(
    `SELECT id FROM words WHERE lesson_id = $1 AND lower(word_de) = lower($2)`,
    [NEW_WORD.lessonId, NEW_WORD.word_de])
  let wordId = exist[0]?.id
  if (!wordId) {
    say(`D: заводим слово «${NEW_WORD.word_de}» в уроке ${NEW_WORD.lessonId}`)
    if (apply) {
      // Владельца берём у соседнего слова урока: words.user_id обязателен, а «ничей»
      // словарь ломает и выдачу упражнений, и отчёты учителя.
      const { rows: owner } = await db.query(
        `SELECT user_id FROM words WHERE lesson_id = $1 AND user_id IS NOT NULL LIMIT 1`,
        [NEW_WORD.lessonId])
      if (!owner[0]) { say('D: у урока нет ни одного слова с владельцем — слово не заводим'); }
      else {
        const { rows } = await db.query(
          `INSERT INTO words (lesson_id, user_id, word_de, translation_ru, example_sentence,
                              example_sentence_ru, translations, source)
           VALUES ($1, $2, $3, $4, $5, $6, $7, 'textbook') RETURNING id`,
          [NEW_WORD.lessonId, owner[0].user_id, NEW_WORD.word_de, NEW_WORD.translation_ru,
           NEW_WORD.example, NEW_WORD.example_ru, JSON.stringify(NEW_WORD.translations)])
        wordId = rows[0].id
        changes++
      }
    }
  }
  let n = 0
  for (const exId of NEW_WORD.exercises) {
    const { rows } = await db.query('SELECT word_id FROM exercises WHERE id = $1', [exId])
    if (!rows[0] || rows[0].word_id) continue
    say(`D: #${exId} → слово ${wordId ?? '(новое)'}`)
    if (apply && wordId) await db.query('UPDATE exercises SET word_id = $2 WHERE id = $1', [exId, wordId])
    n++
  }
  say(`D. Новое слово и привязки: ${n}`)
  changes += n
}

// E
{
  const { rows } = await db.query('SELECT id, word_de FROM words WHERE id = $1', [DUP_WORD.id])
  const { rows: keep } = await db.query('SELECT id FROM words WHERE id = $1', [DUP_WORD.keep])
  if (rows[0] && keep[0]) {
    const { rows: exs } = await db.query('SELECT * FROM exercises WHERE word_id = $1', [DUP_WORD.id])
    say(`E: «${DUP_WORD.word}» (#${DUP_WORD.id}) — дубль-опечатка к «${DUP_WORD.keepWord}», упражнений ${exs.length}`)
    rollback.words.push(rows[0])
    rollback.exercises.push(...exs)
    if (apply) {
      await db.query('DELETE FROM exercises WHERE word_id = $1', [DUP_WORD.id])
      await db.query('DELETE FROM words WHERE id = $1', [DUP_WORD.id])
    }
    changes += 1 + exs.length
  } else {
    say('E. Дубля «gefällst» уже нет')
  }
}

// F
{
  const { rows } = await db.query(
    `SELECT id, word_de FROM words WHERE id = ANY($1) AND NOT is_function_word`, [FUNCTION_WORD_IDS])
  say(`F. Служебные слова без флага: ${rows.length}${rows.length ? ' — ' + rows.map(r => r.word_de).join(', ') : ''}`)
  if (apply && rows.length) await db.query(
    `UPDATE words SET is_function_word = true WHERE id = ANY($1)`, [FUNCTION_WORD_IDS])
  changes += rows.length
}

// G
{
  const { rows } = await db.query('SELECT * FROM exercises WHERE id = ANY($1)', [HOPELESS_LETTER_FILL])
  for (const r of rows) {
    const answer = r.payload?.answer || r.payload?.word_de
    // Страховка: если маску всё-таки можно построить — не удаляем, а чиним.
    const mask = buildMask(answer)
    if (mask) {
      say(`G: #${r.id} «${answer}» — маска строится, чиним вместо удаления`)
      if (apply) await db.query(
        `UPDATE exercises SET payload = jsonb_set(payload, '{masked}', to_jsonb($2::text)) WHERE id = $1`,
        [r.id, mask])
    } else {
      say(`G: #${r.id} «${answer}» — прятать нечего, удаляем`)
      rollback.exercises.push(r)
      if (apply) await db.query('DELETE FROM exercises WHERE id = $1', [r.id])
    }
    changes++
  }
  say(`G. Нерешаемые «Добавь букву»: ${rows.length}`)
}

say(`\nВсего правок: ${changes}`)
if (!apply) {
  say('Это пробный прогон. Записать: --apply')
} else if (rollback.exercises.length || rollback.words.length) {
  // Откат печатаем в вывод: файл внутри контейнера не переживёт пересборку образа,
  // а вывод уходит в журнал сессии на ноуте.
  console.log('\n--- ОТКАТ (сохранить рядом с журналом операции) ---')
  console.log(JSON.stringify(rollback))
}

await db.end?.()
process.exit(0)

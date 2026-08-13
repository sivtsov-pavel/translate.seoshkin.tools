// Проверка системы: прогон всех правил качества по ВСЕЙ базе разом.
//
// Зачем отдельно от auditLesson: часть ошибок не видна внутри одного урока.
// «der Radiergummi» в уроке 294 и «das Radiergummi» в уроке 33 — каждый по
// отдельности выглядит нормально, противоречие видно только вместе. Такие
// проверки живут здесь, а всё, что решается в пределах урока, — в lessonAudit.
//
// Правило: каждая найденная в бою ошибка становится проверкой здесь, иначе мы
// чиним один и тот же класс руками снова и снова. Список ниже — история наших
// граблей, а не абстрактный чек-лист.
//
// ИИ не участвует: все проверки детерминированные, отчёт стоит $0 и его можно
// гонять хоть после каждой загрузки урока.
import { db } from '../db/index.js'
import { checkExercise, checkWord } from './lessonAudit.js'

// Одна проверка = { id, title, hint, sql }. sql возвращает строки с полями
// lesson_id, ref (что именно не так) — их и показываем.
const CHECKS = [
  {
    id: 'article_conflict',
    title: 'Одно слово с разными артиклями',
    hint: 'Ученик учит род слова. Если в одном уроке «der Ring», а в другом «das Ring» — он выучит оба и не будет знать, какой верен.',
    sql: `
      WITH n AS (
        SELECT regexp_replace(w.word_de, '^(der|die|das) ', '') AS base,
               lower(substring(w.word_de from '^(der|die|das) ')) AS art,
               min(w.lesson_id) AS lesson_id
        FROM words w JOIN lessons l ON l.id = w.lesson_id
        WHERE l.target_lang = 'de' AND w.word_de ~ '^(der|die|das) '
        GROUP BY 1, 2)
      SELECT min(lesson_id) AS lesson_id,
             base || ' — ' || string_agg(trim(art), ' / ' ORDER BY art) AS ref
      FROM n GROUP BY base HAVING count(*) > 1`,
  },
  {
    id: 'verb_form',
    title: 'Глагол в спрягаемой форме вместо инфинитива',
    hint: 'Из «hoffst» модель строит «Ich hoffst…». Ошибка уходит в каждое упражнение слова.',
    sql: `SELECT w.lesson_id, w.word_de AS ref FROM words w JOIN lessons l ON l.id = w.lesson_id
          WHERE l.target_lang = 'de' AND w.word_de ~ '^[a-zäöü]+st$'
            AND w.word_de NOT IN ('ist','bist','erst','fast','selbst','sonst','meist','obst','durst')`,
  },
  {
    id: 'function_word',
    title: 'Служебное слово учится карточкой',
    hint: 'Артикль и местоимение живут только внутри фразы. «die = эта» с картинкой ничему не учит.',
    sql: `SELECT w.lesson_id, w.word_de AS ref FROM words w JOIN lessons l ON l.id = w.lesson_id
          WHERE l.target_lang = 'de' AND NOT w.is_function_word
            AND lower(w.word_de) IN ('die','der','das','den','dem','ein','eine','und','ist','sind',
                                     'nicht','auch','sie','wir','ihr','mein','dein')`,
  },
  {
    id: 'no_translation',
    title: 'Слово без перевода',
    hint: 'Карточку невозможно проверить: ученик не видит, что означает слово.',
    sql: `SELECT w.lesson_id, w.word_de AS ref FROM words w JOIN lessons l ON l.id = w.lesson_id
          WHERE (w.translation_ru IS NULL OR trim(w.translation_ru) = '') AND NOT w.is_function_word`,
  },
  {
    id: 'example_without_word',
    title: 'Пример не содержит изучаемого слова',
    hint: 'Пример нужен, чтобы показать слово в живой фразе. Если слова в нём нет, он бесполезен.',
    sql: `SELECT w.lesson_id, w.word_de || ' → «' || left(w.example_sentence, 40) || '»' AS ref
          FROM words w JOIN lessons l ON l.id = w.lesson_id
          WHERE l.target_lang = 'de' AND w.example_sentence <> '' AND NOT w.is_function_word
            AND position(lower(regexp_replace(w.word_de, '^(der|die|das) ', '')) in lower(w.example_sentence)) = 0
            AND length(regexp_replace(w.word_de, '^(der|die|das) ', '')) > 3`,
  },
  {
    id: 'example_no_ru',
    title: 'У примера нет перевода',
    hint: 'Во флеш-карте строка под немецкой фразой остаётся пустой.',
    sql: `SELECT w.lesson_id, w.word_de AS ref FROM words w JOIN lessons l ON l.id = w.lesson_id
          WHERE w.example_sentence <> '' AND w.example_sentence_ru IS NULL AND NOT w.is_function_word`,
  },
  {
    id: 'duplicate_word',
    title: 'Слово дважды в одном уроке',
    hint: 'Ученик учит одно и то же дважды, а прогресс делится между двумя записями.',
    sql: `SELECT lesson_id, lower(word_de) || ' ×' || count(*) AS ref
          FROM words GROUP BY lesson_id, lower(word_de) HAVING count(*) > 1`,
  },
  {
    id: 'orphan_exercise',
    title: 'Упражнение без привязки к слову',
    hint: 'Такое упражнение не попадает в прогресс слова и не перегенерируется вместе с ним.',
    sql: `SELECT e.lesson_id, e.type || ' #' || e.id AS ref FROM exercises e
          WHERE e.word_id IS NULL AND e.type IN ('flashcard','multiple_choice','fill_blank','sentence_write')`,
  },
  {
    id: 'lesson_without_exercises',
    title: 'В уроке есть слова, но нет упражнений',
    hint: 'Урок открывается пустым — ученик не понимает, что делать.',
    sql: `SELECT l.id AS lesson_id, l.title AS ref FROM lessons l
          WHERE EXISTS (SELECT 1 FROM words w WHERE w.lesson_id = l.id)
            AND NOT EXISTS (SELECT 1 FROM exercises e WHERE e.lesson_id = l.id)`,
  },
]

const MAX_SAMPLES = 12

/**
 * Полная проверка. Возвращает отчёт для экрана «Проверка системы».
 * ИИ не вызывается, стоимость $0.
 */
export async function runSystemCheck() {
  const startedAt = new Date().toISOString()
  const groups = []

  // 1. Межурочные проверки (SQL)
  for (const check of CHECKS) {
    try {
      const { rows } = await db.query(check.sql)
      groups.push({
        id: check.id, title: check.title, hint: check.hint,
        count: rows.length,
        samples: rows.slice(0, MAX_SAMPLES).map(r => ({ lesson_id: r.lesson_id, ref: r.ref })),
      })
    } catch (e) {
      groups.push({ id: check.id, title: check.title, hint: check.hint, count: 0, error: e.message, samples: [] })
    }
  }

  // 2. Проверки по каждому упражнению и слову — тем же кодом, что стоит на генерации,
  // поэтому отчёт не может разойтись с тем, что приложение считает браком.
  // word_id обязателен: checkExercise по нему судит, привязано ли упражнение к слову.
  // Без этого поля все упражнения разом объявлялись «без привязки» — 4162 ложных
  // замечания вместо 125 настоящих.
  const { rows: exercises } = await db.query(
    `SELECT e.id, e.word_id, e.type, e.payload, e.lesson_id, w.translation_ru, l.target_lang
     FROM exercises e LEFT JOIN words w ON w.id = e.word_id JOIN lessons l ON l.id = e.lesson_id`)
  const { rows: words } = await db.query(
    `SELECT w.id, w.word_de, w.lesson_id, w.is_function_word, l.target_lang
     FROM words w JOIN lessons l ON l.id = w.lesson_id`)

  // Номер урока в самих проверках не возвращается — они чистые и про урок не знают,
  // поэтому проставляем его здесь: без него замечание невозможно найти глазами.
  const withLesson = (list, row) => list.map(i => ({ ...i, lesson_id: row.lesson_id }))
  const perItem = [
    ...exercises.flatMap(e => withLesson(checkExercise(e), e)),
    ...words.flatMap(w => withLesson(checkWord(w), w)),
  ]
  const byKind = new Map()
  for (const i of perItem) {
    if (!byKind.has(i.kind)) byKind.set(i.kind, [])
    byKind.get(i.kind).push(i)
  }
  for (const [kind, list] of byKind) {
    const blockers = list.filter(i => i.level === 'blocker').length
    groups.push({
      id: `item_${kind}`,
      title: `${kind}${blockers ? ` (непроходимых: ${blockers})` : ''}`,
      hint: blockers ? 'Такое упражнение пройти невозможно — ученик застревает.' : 'Пройти можно, но материал учит неверно.',
      count: list.length,
      samples: list.slice(0, MAX_SAMPLES).map(i => ({ lesson_id: i.lesson_id ?? null, ref: i.text })),
    })
  }

  const problems = groups.filter(g => g.count > 0).sort((a, b) => b.count - a.count)
  const total = problems.reduce((s, g) => s + g.count, 0)

  return {
    startedAt,
    checkedExercises: exercises.length,
    checkedWords: words.length,
    total,
    ok: total === 0,
    groups: problems,
    clean: groups.filter(g => g.count === 0).map(g => g.title),
  }
}

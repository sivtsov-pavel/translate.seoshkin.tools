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
import { conjugatePresent } from './germanConjugator.js'

// Слова на «-st», которые НЕ спрягаемая форма глагола: существительные, наречия,
// прилагательные. Пополнено 13.08 (fest, ernst, zuerst…) — иначе правило verb_form
// ругалось бы на нормальные слова, как только они появятся в словаре.
const ST_OK = ['ist', 'bist', 'erst', 'fast', 'selbst', 'sonst', 'meist', 'obst', 'durst',
  'fest', 'ernst', 'zuerst', 'längst', 'höchst', 'äußerst', 'zunächst', 'jetzt']
const ST_OK_SQL = ST_OK.map(w => `'${w}'`).join(',')

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
            AND w.word_de NOT IN (${ST_OK_SQL})`,
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
    id: 'example_broken',
    title: 'В примере мусор вместо фразы',
    hint: 'Строка «null», «Plural: die Gäste» и подобное — это не пример употребления, ученику показывать нечего.',
    sql: `SELECT w.lesson_id, w.word_de || ' → «' || left(w.example_sentence, 40) || '»' AS ref
          FROM words w JOIN lessons l ON l.id = w.lesson_id
          WHERE w.example_sentence <> ''
            AND (lower(trim(w.example_sentence)) IN ('null','undefined','-','—')
                 OR w.example_sentence ~* '^(plural|singular|pl\\.|sg\\.)\\s*:'
                 OR w.example_sentence !~ '[a-zäöüßA-ZÄÖÜ]{2}')`,
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

// Отделяемые приставки: в предложении глагол разрывается («einkaufen» → «Ich kaufe
// gerne ein»), поэтому искать надо остаток без приставки.
const SEPARABLE = /^(ab|an|auf|aus|bei|ein|los|mit|nach|vor|zu|zurück|weg|her|hin|fest|frei|statt|teil)/

// Умлаут во множественном числе и в личных формах — обычное дело в немецком
// («der Gast» → «die Gäste», «fahren» → «du fährst»). Без свёртки правило считает
// такие пары разными словами и обвиняет верные примеры.
const fold = (s) => String(s || '').toLowerCase()
  .replace(/ä/g, 'a').replace(/ö/g, 'o').replace(/ü/g, 'u').replace(/ß/g, 'ss')

/**
 * Есть ли изучаемое слово в примере. Немецкий здесь важнее регулярки: слово в живой
 * фразе почти никогда не выглядит как словарная запись.
 *
 * Первая версия правила искала запись целиком и обвинила сотни ВЕРНЫХ примеров:
 * «denken an → Ich denke an meine Familie», «sich ärgern → Ich ärgere mich»,
 * «einkaufen → Ich kaufe gerne ein», «wollen → Ich will Deutsch lernen».
 * Ложное правило хуже отсутствующего — его перестают читать, и вместе с шумом
 * теряются настоящие находки.
 */
export function exampleHasWord(wordDe, sentence, conjugate) {
  const text = fold(sentence)
  if (!text) return true

  // Запись с вариантами через слэш («sie/Sie», «er/sie/es») — слово есть, если есть
  // ЛЮБОЙ вариант. Без этого правило обвиняло верный пример «Sie sind meine Freunde»
  // у записи «sie/Sie» (ложное срабатывание, поймано перепроверкой 13.08).
  if (String(wordDe || '').includes('/')) {
    return String(wordDe).split('/').some(part => exampleHasWord(part.trim(), sentence, conjugate))
  }

  // Словарная запись → чистая основа: без артикля, без скобок с множественным числом,
  // без «sich» и без управления предлогом («sich ärgern über» → «ärgern»).
  let base = fold(String(wordDe || '')
    .replace(/^(der|die|das)\s+/i, '')
    .replace(/\s*\(.*?\)/g, '')
    .replace(/^sich\s+/i, '')
    .trim()
    .split(/\s+/)[0])
  if (base.length < 4) return true    // короткие слова не проверяем: слишком много совпадений

  const candidates = new Set([base])

  // Глагол: добавляем все личные формы — «wollen» в тексте выглядит как «will».
  if (/(en|ln|rn)$/.test(base)) {
    const forms = conjugate?.(base)
    if (forms) for (const f of Object.values(forms)) if (f) candidates.add(fold(f))
    // Отделяемая приставка: ищем и остаток («einkaufen» → «kauf…»)
    const m = base.match(SEPARABLE)
    if (m) {
      const rest = base.slice(m[0].length)
      if (rest.length >= 3) {
        candidates.add(rest)
        const restForms = conjugate?.(rest)
        if (restForms) for (const f of Object.values(restForms)) if (f) candidates.add(fold(f))
      }
    }
  }

  for (const c of candidates) {
    // По корню, а не по всей форме: существительные склоняются («Gast» → «Gäste»),
    // прилагательные получают окончания («klein» → «kleine»).
    const stem = c.slice(0, Math.max(4, c.length - 3))
    if (text.includes(stem)) return true
  }
  return false
}

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

  // Пример без изучаемого слова — проверка живёт в JS, а не в SQL: ей нужен
  // спрягатель, иначе «wollen → Ich will…» и «einkaufen → Ich kaufe … ein»
  // объявляются браком.
  const { rows: exWords } = await db.query(
    `SELECT w.id, w.lesson_id, w.word_de, w.example_sentence FROM words w JOIN lessons l ON l.id = w.lesson_id
     WHERE l.target_lang = 'de' AND w.example_sentence <> '' AND NOT w.is_function_word`)
  for (const w of exWords) {
    if (exampleHasWord(w.word_de, w.example_sentence, conjugatePresent)) continue
    perItem.push({ level: 'warn', kind: 'пример без слова', id: w.id, lesson_id: w.lesson_id,
      text: `${w.word_de} → «${String(w.example_sentence).slice(0, 45)}»` })
  }
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

/**
 * Словарная проверка ОДНОГО урока — запускается автоматически после каждой загрузки
 * (решение Павла, 13.08.2026). Те же правила, что в полной проверке, но в границах
 * урока: мусор из кривой загрузки виден сразу, пока урок свежий, а не когда на него
 * наткнётся ученик.
 *
 * Чего здесь НЕТ нарочно:
 *  • «пример без перевода» — переводы приезжают асинхронно после генерации,
 *    правило ругалось бы на каждый свежий урок (ложное правило хуже отсутствующего);
 *  • проверок самих упражнений — их делает auditLesson, дублировать нельзя.
 *
 * ИИ не участвует, стоимость $0.
 */
export async function runLessonCheck(lessonId) {
  const { rows: lrows } = await db.query('SELECT target_lang FROM lessons WHERE id = $1', [lessonId])
  if (!lrows.length) return null
  const de = (lrows[0].target_lang || 'de') === 'de'
  const groups = []
  const add = async (title, sql) => {
    const { rows } = await db.query(sql, [lessonId])
    if (rows.length) groups.push({ title, count: rows.length, samples: rows.slice(0, 6).map(r => r.ref) })
  }

  // Правила про немецкий (артикли, спряжение, служебные) — только для немецкого курса:
  // в английском «artist» и «breakfast» — нормальные слова, а не формы на «-st».
  if (de) {
    // Артикль расходится с другим уроком: конфликт виден только по всей базе,
    // но ругаемся лишь если задето слово ЭТОГО урока.
    await add('артикль расходится с другим уроком', `
      WITH n AS (
        SELECT regexp_replace(w.word_de, '^(der|die|das) ', '') AS base,
               lower(substring(w.word_de from '^(der|die|das) ')) AS art
        FROM words w JOIN lessons l ON l.id = w.lesson_id
        WHERE l.target_lang = 'de' AND w.word_de ~ '^(der|die|das) '
        GROUP BY 1, 2)
      SELECT n.base || ': ' || string_agg(trim(n.art), ' / ' ORDER BY n.art) AS ref
      FROM n
      WHERE n.base IN (SELECT regexp_replace(word_de, '^(der|die|das) ', '')
                       FROM words WHERE lesson_id = $1 AND word_de ~ '^(der|die|das) ')
      GROUP BY n.base HAVING count(*) > 1`)
    await add('глагол в спрягаемой форме', `
      SELECT word_de AS ref FROM words WHERE lesson_id = $1
        AND word_de ~ '^[a-zäöü]+st$' AND word_de NOT IN (${ST_OK_SQL})`)
    await add('служебное слово карточкой', `
      SELECT word_de AS ref FROM words WHERE lesson_id = $1 AND NOT is_function_word
        AND lower(word_de) IN ('die','der','das','den','dem','ein','eine','und','ist','sind',
                               'nicht','auch','sie','wir','ihr','mein','dein')`)
  }
  await add('слово без перевода', `
    SELECT word_de AS ref FROM words WHERE lesson_id = $1 AND NOT is_function_word
      AND (translation_ru IS NULL OR trim(translation_ru) = '')`)
  await add('мусор в примере', `
    SELECT word_de || ' → «' || left(example_sentence, 30) || '»' AS ref FROM words
    WHERE lesson_id = $1 AND example_sentence <> ''
      AND (lower(trim(example_sentence)) IN ('null','undefined','-','—')
           OR example_sentence ~* '^(plural|singular|pl\\.|sg\\.)\\s*:'
           OR example_sentence !~ '[a-zäöüßA-ZÄÖÜ]{2}')`)
  await add('слово дважды в уроке', `
    SELECT lower(word_de) || ' ×' || count(*) AS ref FROM words
    WHERE lesson_id = $1 GROUP BY lower(word_de) HAVING count(*) > 1`)
  await add('упражнение без привязки к слову', `
    SELECT type || ' #' || id AS ref FROM exercises
    WHERE lesson_id = $1 AND word_id IS NULL
      AND type IN ('flashcard','multiple_choice','fill_blank','sentence_write')`)

  if (de) {
    const { rows: exw } = await db.query(
      `SELECT word_de, example_sentence FROM words
       WHERE lesson_id = $1 AND example_sentence <> '' AND NOT is_function_word`, [lessonId])
    const bad = exw.filter(w => !exampleHasWord(w.word_de, w.example_sentence, conjugatePresent))
    if (bad.length) groups.push({ title: 'пример без изучаемого слова', count: bad.length,
      samples: bad.slice(0, 6).map(w => w.word_de) })
  }

  const total = groups.reduce((s, g) => s + g.count, 0)
  // Короткий итог для строки статуса урока: первое замечание каждой группы + счётчик.
  const summary = total
    ? `словарь: ${total} — ` + groups.map(g => `${g.title} (${g.samples[0]}${g.count > 1 ? ` +${g.count - 1}` : ''})`).join('; ')
    : 'словарь чист'
  return { total, groups, summary }
}

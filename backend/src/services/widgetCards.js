// Карточки для виджета: учим слова прямо на домашнем экране.
//
// Отдаём ПАЧКОЙ, а не по одному вопросу. Причины две, и обе про живой телефон:
//  • без сети (метро, лифт, роуминг) виджет с одним вопросом мёртв, а с запасом — работает;
//  • ответ по одному вопросу означал бы сетевой круг после каждого тапа: полсекунды-секунда
//    ожидания там, где человек ждёт мгновенной реакции.
//
// Вместе с вариантами отдаём и правильный индекс: виджет подсвечивает верный ответ сразу,
// не дожидаясь сервера. Это обучение, а не экзамен — прятать ответ здесь не от кого.
//
// ГЛАВНОЕ АРХИТЕКТУРНОЕ РЕШЕНИЕ: нативная часть умеет рисовать три ВИДА карточек и больше
// ничего не знает. Чем их наполнять, в каком порядке и подмешивать ли фразы — решает сервер.
// Поэтому состав виджета можно менять обычным деплоем, не заставляя людей качать новый APK.
import { db } from '../db/index.js'
import { REQUIRED_TYPES } from './drip.js'

// Сколько карточек держим на телефоне про запас: примерно два подхода «включил экран,
// ответил пару раз».
export const CARDS_AHEAD = 8

// Каждая N-я карточка — фраза урока «на послушать» (идея Павла 25.08.2026: слова учатся
// по одному, а речь держится на готовых оборотах).
//
// ВАЖНО: фразы НЕ входят в обязательный минимум и полосу «34/40» не двигают — поэтому
// подмешиваем редко, как передышку между упражнениями, а не как основную работу.
//
// Значение живёт на сервере намеренно: нативная часть рисует фразу наравне с упражнениями,
// поэтому выключить их — правка этой строки и обычный деплой. Новый APK людям не нужен.
export const PHRASE_EVERY = 5

export const CARD_KINDS = {
  CHOICE: 'mc',      // немецкое слово + четыре перевода на выбор
  FLIP:   'flip',    // карточка: слово → перевод → «знал / не знал»
  PHRASE: 'phrase',  // фраза урока: послушать и понять
}

/**
 * Карточки текущего урока: обязательный минимум (выбор ответа + карточки) плюс, если
 * включено, фразы урока между ними.
 */
export async function widgetCards(userId, lessonId, lang = 'ru', limit = CARDS_AHEAD) {
  if (!lessonId) return []

  const exercises = await exerciseCards(userId, lessonId, lang, limit)
  if (!PHRASE_EVERY) return exercises

  const phrases = await phraseCards(userId, lessonId, lang, Math.ceil(limit / PHRASE_EVERY))
  return mix(exercises, phrases, PHRASE_EVERY)
}

// ── Упражнения обязательного минимума ────────────────────────────────────────
async function exerciseCards(userId, lessonId, lang, limit) {
  const { rows } = await db.query(
    `SELECT e.id, e.type, e.payload, COALESCE(e.payload_translations, '{}') AS payload_translations,
            w.word_de, w.translations AS word_translations, w.translation_ru
     FROM exercises e
     LEFT JOIN words w ON w.id = e.word_id
     LEFT JOIN user_exercise_progress uep ON uep.exercise_id = e.id AND uep.user_id = $1
     WHERE e.lesson_id = $2 AND e.type = ANY($3)
     -- Порядок важен и задан Павлом 25.08.2026: сперва «выбери ответ», и только когда
     -- он кончится — карточки с самооценкой. Выбор из вариантов реально проверяет, что
     -- человек отличает слово от похожих; «знал / не знал» он ставит себе сам, и три
     -- такие подряд в начале превращают виджет в пролистывание.
     -- Внутри каждой группы — сначала несделанное: именно оно двигает урок к открытию
     -- следующего.
     ORDER BY (uep.exercise_id IS NOT NULL) ASC,
              (e.type <> 'multiple_choice') ASC,
              COALESCE(uep.next_review_date, CURRENT_DATE) ASC,
              e.id ASC
     LIMIT $4`,
    [userId, lessonId, REQUIRED_TYPES, limit])

  return rows.map(r => (r.type === 'multiple_choice' ? choiceCard(r, lang) : flipCard(r, lang)))
              .filter(Boolean)
}

/** «Выбери ответ»: слово и четыре варианта перевода. */
export function choiceCard(row, lang) {
  const payload = row.payload ?? {}
  const original = Array.isArray(payload.options) ? payload.options : []
  if (original.length < 2) return null

  // Варианты на языке ученика, если переводы есть; иначе — как в упражнении.
  const translated = row.payload_translations?.[lang]
  const options = Array.isArray(translated) && translated.length === original.length
    ? translated
    : original

  const correct = Number(payload.correct ?? 0)
  if (correct < 0 || correct >= options.length) return null

  const picked = pickFour(options, correct)
  const word = germanOf(row, payload)

  return {
    kind: CARD_KINDS.CHOICE,
    id: row.id,
    question: word,
    speak: word,                       // что произносит виджет по кнопке 🔊
    options: picked.options,
    correct: picked.correct,
  }
}

/** Карточка: слово, по тапу — перевод, дальше честная самооценка «знал / не знал». */
export function flipCard(row, lang) {
  const payload = row.payload ?? {}
  const word = germanOf(row, payload)
  if (!word) return null

  const answer = row.word_translations?.[lang]
    || (lang === 'ru' ? row.translation_ru : null)
    || payload.answer
    || row.translation_ru
  if (!answer) return null

  return {
    kind: CARD_KINDS.FLIP,
    id: row.id,
    question: word,
    speak: word,
    answer: String(answer),
  }
}

// ── Фразы урока ──────────────────────────────────────────────────────────────
// Показываем фразу с переводом и даём послушать. На виджете это закрывает шаг «слушаю»;
// шаг «собираю предложение» требует ввода и остаётся в приложении.
async function phraseCards(userId, lessonId, lang, limit) {
  if (limit <= 0) return []
  const { rows } = await db.query(
    `SELECT p.id, p.text, p.emoji, COALESCE(p.translations, '{}') AS translations
     FROM phrase_topics t
     JOIN phrases p ON p.topic_id = t.id
     LEFT JOIN user_phrase_progress up ON up.phrase_id = p.id AND up.user_id = $1
     WHERE t.lesson_id = $2
     -- Сначала непрослушанные: повторять уже знакомое на виджете смысла мало.
     ORDER BY COALESCE(up.step_listen, FALSE) ASC, p.position ASC
     LIMIT $3`,
    [userId, lessonId, limit])

  return rows.map(r => ({
    kind: CARD_KINDS.PHRASE,
    id: r.id,
    question: r.text,
    speak: r.text,
    answer: r.translations?.[lang] || r.translations?.ru || '',
    emoji: r.emoji || null,
  })).filter(c => c.answer)
}

// ── Сборка ленты ─────────────────────────────────────────────────────────────
// Фраза встаёт каждой N-й карточкой. Если фраз нет — лента просто из упражнений,
// никакой пустоты на их месте.
function mix(exercises, phrases, every) {
  if (!phrases.length) return exercises
  const out = []
  let p = 0
  exercises.forEach((card, i) => {
    out.push(card)
    if ((i + 1) % every === 0 && p < phrases.length) out.push(phrases[p++])
  })
  return out
}

// Немецкое слово: из словаря, иначе из вопроса упражнения. Служебный префикс вроде
// «Переведите: …» на маленьком виджете только съедает место.
function germanOf(row, payload) {
  return row.word_de || String(payload.question ?? '').replace(/^.*:\s*/, '').replace(/\?$/, '').trim()
}

// Четыре варианта с сохранением правильного. Порядок перемешиваем: иначе запомнится
// позиция кнопки, а не слово.
function pickFour(options, correctIdx) {
  const correctValue = options[correctIdx]
  const others = options.filter((_, i) => i !== correctIdx)
  shuffle(others)
  const chosen = [correctValue, ...others.slice(0, 3)]
  shuffle(chosen)
  return { options: chosen, correct: chosen.indexOf(correctValue) }
}

function shuffle(arr) {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1))
    ;[arr[i], arr[j]] = [arr[j], arr[i]]
  }
  return arr
}

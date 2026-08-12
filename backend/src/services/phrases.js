// Наборы фраз к уроку: промпт с эталонами уровня, разбор ответа, валидация, сохранение.
//
// Генерация — gpt-4o: набор увидит вся школа и пишется он один раз, экономия здесь выйдет
// боком (проверено на ИИ-аудите 07.08). Переводы фраз на локали — отдельно, на gpt-4o-mini.
// Набор сохраняется ЧЕРНОВИКОМ (published=false): вердикты модели не применяем
// автоматически — человек листает и публикует.
import { db } from '../db/index.js'
import { platformClient } from './openaiClient.js'
import { trackUsage } from './claude.js'
import { checkPhraseLevel } from './phraseLevel.js'

const MODEL = 'gpt-4o'

// Эталоны важнее инструкций: словом «A1» модель пренебрегает, примером — нет.
const EXAMPLES = [
  'Ich gehe in die Küche.',
  'Ich wasche meine Hände.',
  'Ich koche Suppe im Topf.',
]

export function buildPhrasePrompt({ words, level = 'A1', langName = 'Deutsch' }) {
  const count = words.length <= 4 ? 6 : words.length <= 8 ? 9 : 12
  const list = words.map(w => `- ${w.word_de} (${w.translation_ru})`).join('\n')
  return `Ты составляешь набор бытовых фраз для урока языка ${langName}, уровень ${level}.

Слова урока:
${list}

Сделай ${count} фраз. Каждая фраза:
- использует 1–3 слова из списка выше;
- настоящее время, одна грамматическая конструкция, БЕЗ придаточных и запятых;
- 4–7 слов, заканчивается точкой;
- бытовая, такая, какую человек реально скажет вслух;
- к каждой подбери один эмодзи, передающий смысл.

Вот образец нужного уровня и стиля — держись его:
${EXAMPLES.map(e => `- ${e}`).join('\n')}

Придумай короткое название темы на ${langName} (одно-два слова, как «Kochen») и эмодзи темы.

Верни СТРОГО JSON:
{"title":"…","emoji":"…","phrases":[{"text":"…","emoji":"…","words":["слово из списка"]}]}`
}

export function parsePhrasesResponse(text) {
  const clean = String(text || '').replace(/^```(json)?|```$/gm, '').trim()
  try {
    const obj = JSON.parse(clean)
    return {
      title: obj.title || '',
      emoji: obj.emoji || '',
      phrases: Array.isArray(obj.phrases) ? obj.phrases.filter(p => p && p.text) : [],
    }
  } catch {
    return { title: '', emoji: '', phrases: [] }
  }
}

// Ключ слова: без артикля и регистра — модель возвращает то «die Küche», то «Küche»
const wordKey = (s) => String(s || '').toLowerCase()
  .replace(/^(der|die|das|ein|eine|the|el|la|los|las)\s+/, '').trim()

const escapeRe = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')

export function validatePhrases(parsed, { level = 'A1', wordIndex = new Map() } = {}) {
  const good = [], rejected = [], seen = new Set()

  for (const p of parsed?.phrases || []) {
    const text = String(p.text || '').trim()
    const key = text.toLowerCase()
    if (seen.has(key)) continue
    seen.add(key)

    const problems = checkPhraseLevel(text, level)
    if (problems.length) { rejected.push({ text, problems }); continue }

    // Связь со словами урока: и по тому, что назвала модель, и по вхождению в текст —
    // модель регулярно забывает заполнить words, а связь нужна для карточки урока.
    const ids = new Set()
    for (const w of p.words || []) {
      const id = wordIndex.get(wordKey(w))
      if (id) ids.add(id)
    }
    for (const [k, id] of wordIndex) {
      if (new RegExp(`\\b${escapeRe(k)}\\b`, 'i').test(text)) ids.add(id)
    }

    good.push({ text, emoji: p.emoji || '', word_ids: [...ids] })
  }

  return { good, rejected }
}

// Полный проход по уроку: слова → фразы → валидация → сохранение черновиком.
export async function generateLessonPhrases(lessonId, { level = 'A1', client = platformClient } = {}) {
  const { rows: lessonRows } = await db.query(
    'SELECT id, target_lang, school_id FROM lessons WHERE id = $1', [lessonId])
  const lesson = lessonRows[0]
  if (!lesson) throw new Error(`урок ${lessonId} не найден`)

  const { rows: words } = await db.query(
    'SELECT id, word_de, translation_ru FROM words WHERE lesson_id = $1 ORDER BY id', [lessonId])
  if (words.length < 2) return { topicId: null, saved: 0, rejected: [], reason: 'слишком мало слов' }

  const langName = { de: 'Deutsch', en: 'English', es: 'español' }[lesson.target_lang] || 'Deutsch'
  const prompt = buildPhrasePrompt({ words, level, langName })

  const res = await client.chat.completions.create({
    model: MODEL, max_tokens: 2000,
    response_format: { type: 'json_object' },
    messages: [{ role: 'user', content: prompt }],
  })
  trackUsage(MODEL, res.usage || {})

  const parsed = parsePhrasesResponse(res.choices[0].message.content || '')
  const wordIndex = new Map(words.map(w => [wordKey(w.word_de), w.id]))
  const { good, rejected } = validatePhrases(parsed, { level, wordIndex })
  if (!good.length) return { topicId: null, saved: 0, rejected, reason: 'все фразы забракованы' }

  const slug = (parsed.title || `lesson-${lessonId}`).toLowerCase()
    .replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || `lesson-${lessonId}`

  const { rows: topicRows } = await db.query(
    `INSERT INTO phrase_topics (slug, lang, level, title, emoji, source, lesson_id, school_id, published)
     VALUES ($1, $2, $3, $4, $5, 'lesson', $6, $7, FALSE)
     ON CONFLICT (lesson_id) WHERE lesson_id IS NOT NULL DO UPDATE
       SET title = EXCLUDED.title, emoji = EXCLUDED.emoji, level = EXCLUDED.level
     RETURNING id`,
    [slug, lesson.target_lang || 'de', level,
     parsed.title || `Lektion ${lessonId}`, parsed.emoji || '💬', lessonId, lesson.school_id])
  const topicId = topicRows[0].id

  // Перегенерация заменяет фразы целиком — прогресс по старым уходит вместе с ними.
  await db.query('DELETE FROM phrases WHERE topic_id = $1', [topicId])
  let position = 1
  for (const p of good) {
    await db.query(
      'INSERT INTO phrases (topic_id, position, text, emoji, word_ids) VALUES ($1,$2,$3,$4,$5)',
      [topicId, position++, p.text, p.emoji, p.word_ids])
  }

  return { topicId, saved: good.length, rejected }
}

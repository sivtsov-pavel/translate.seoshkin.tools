import OpenAI from 'openai'
import { writeFileSync } from 'fs'
import { config } from './src/config.js'
const openai = new OpenAI({ apiKey: config.openaiApiKey })

const strings = {
  navGrammar: 'Грамматика',
  navLove: 'Любовь к детям',
  navTutors: 'Школы и репетиторы',
  grammarTitle: 'Грамматика',
  grammarSub: 'Справочник-шпаргалка: падежи, предлоги, глаголы. Смотри и повторяй.',
  loveTitle: 'Любовь к детям',
  loveSub: 'Тёплые немецкие фразы, чтобы говорить детям с любовью. Нажми 🔊 — послушай.',
  crosswordTitle: 'Кроссворд',
  crosswordSub: 'Впиши немецкие слова по подсказкам-переводам. Пересечения помогут!',
  tutorsTitle: 'Школы и репетиторы',
  tutorsSub: 'Найди учителя немецкого рядом с домом или онлайн.',
}
const langs = { uk: 'украинский', en: 'английский', de: 'немецкий', bg: 'болгарский', tr: 'турецкий', ar: 'арабский', es: 'испанский', fr: 'французский', sq: 'албанский' }

const out = { ru: strings }
for (const [code, name] of Object.entries(langs)) {
  const prompt = `Переведи значения этого JSON на ${name} язык (естественно, коротко, сохрани эмодзи). Верни ТОЛЬКО JSON с теми же ключами.\n\n${JSON.stringify(strings, null, 2)}`
  const r = await openai.chat.completions.create({ model: 'gpt-4o-mini', temperature: 0.3, response_format: { type: 'json_object' }, messages: [{ role: 'user', content: prompt }] })
  out[code] = JSON.parse(r.choices[0].message.content)
  console.log('✓', code)
}
writeFileSync('../frontend/src/i18n/extra.json', JSON.stringify(out, null, 2))
console.log('Готово')
process.exit(0)

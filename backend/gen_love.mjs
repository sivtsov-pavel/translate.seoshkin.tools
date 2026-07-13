import OpenAI from 'openai'
import { writeFileSync } from 'fs'
import { config } from './src/config.js'

const openai = new OpenAI({ apiKey: config.openaiApiKey })

const CATS = [
  { key: 'daughter', emoji: '💝', title: 'Комплименты дочке', ask: 'нежные комплименты папы дочке: какая она красивая, красивые глазки, улыбка, самая любимая, принцесса' },
  { key: 'son', emoji: '🦸', title: 'Слова сыну', ask: 'тёплые слова папы сыну: сильный, смелый, умный, папа гордится, настоящий помощник, герой' },
  { key: 'care', emoji: '🤗', title: 'Ласка и забота', ask: 'ласковые заботливые фразы родителя ребёнку: обнимемся, я рядом, всё будет хорошо, не бойся, я тебя люблю' },
  { key: 'night', emoji: '🌙', title: 'Спокойной ночи', ask: 'фразы на ночь ребёнку: сладких снов, спокойной ночи, я люблю тебя, приятных снов, до утра' },
  { key: 'praise', emoji: '⭐', title: 'Похвала', ask: 'похвала ребёнку: молодец, ты справился, я горжусь тобой, отличная работа, у тебя получилось' },
  { key: 'morning', emoji: '☀️', title: 'Каждый день', ask: 'тёплые бытовые фразы родителя: доброе утро солнышко, как спалось, приятного аппетита, хорошего дня, я скучал' },
]

const out = []
for (const c of CATS) {
  process.stdout.write(`${c.key}... `)
  const prompt = `Ты — носитель немецкого языка и любящий родитель. Дай 12 коротких естественных немецких фраз по теме: ${c.ask}.
Фразы простые (A1-A2), тёплые, как говорят детям дома. Для каждой — точный русский перевод.
Верни СТРОГО JSON без markdown: {"phrases":[{"de":"...","ru":"..."}]}`
  try {
    const res = await openai.chat.completions.create({
      model: 'gpt-4o', max_tokens: 1500, temperature: 0.7,
      response_format: { type: 'json_object' },
      messages: [{ role: 'user', content: prompt }],
    })
    const data = JSON.parse(res.choices[0].message.content)
    out.push({ key: c.key, emoji: c.emoji, title: c.title, phrases: data.phrases || [] })
    console.log('✓', (data.phrases || []).length)
  } catch (e) { console.log('✗', e.message); out.push({ key: c.key, emoji: c.emoji, title: c.title, phrases: [] }) }
}
writeFileSync('../frontend/src/data/loveKids.json', JSON.stringify(out, null, 2))
console.log('\nСохранено', out.reduce((s, c) => s + c.phrases.length, 0), 'фраз → frontend/src/data/loveKids.json')
process.exit(0)

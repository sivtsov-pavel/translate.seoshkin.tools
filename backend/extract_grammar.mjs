import OpenAI from 'openai'
import { readFileSync, writeFileSync } from 'fs'
import { config } from './src/config.js'

const openai = new OpenAI({ apiKey: config.openaiApiKey })

const PROMPT = `Ты — учитель немецкого в школе. На фото — грамматический плакат из класса (B1).
Извлеки содержимое в аккуратный справочник и ОБЪЯСНИ каждый раздел так, как объясняют детям в школе.

Верни СТРОГО JSON без markdown:
{
  "title": "короткое название по-русски (3-5 слов)",
  "emoji": "один подходящий эмодзи",
  "topic_de": "тема по-немецки как на плакате",
  "summary_ru": "2-3 предложения по-русски: что это за тема и зачем, простыми словами",
  "sections": [
    {
      "heading": "подзаголовок как на плакате (напр. «Nominativ», «Akkusativ», «a → ä», «Dativ»)",
      "question_de": "контрольный вопрос падежа если применимо (wer/was?, wen/was?, wem?, wessen?) или null",
      "explain_ru": "ШКОЛЬНОЕ объяснение по-русски: что это, КОГДА используется, на какой вопрос отвечает, с коротким примером. 1-3 предложения простым языком. Обязательно для падежей.",
      "gender": "если раздел про род — 'm' (der), 'f' (die), 'n' (das), 'pl' (мн.ч.), иначе null",
      "rows": ["строки таблицы/формы как на плакате, точно сохраняй немецкие формы"]
    }
  ]
}
Сохраняй немецкие формы точно. Для ПАДЕЖЕЙ (Nominativ/Akkusativ/Dativ/Genitiv) обязательно заполни question_de и explain_ru — это самое важное для ученика. Не выдумывай того, чего нет на фото.`

function imgPart(path) {
  const b64 = readFileSync(path).toString('base64')
  return { type: 'image_url', image_url: { url: `data:image/jpeg;base64,${b64}` } }
}

const cards = []
for (let i = 1; i <= 6; i++) {
  const path = `../frontend/public/grammar/g${i}.jpg`
  process.stdout.write(`g${i}... `)
  try {
    const res = await openai.chat.completions.create({
      model: 'gpt-4o',
      max_tokens: 2000,
      response_format: { type: 'json_object' },
      messages: [{ role: 'user', content: [{ type: 'text', text: PROMPT }, imgPart(path)] }],
    })
    const data = JSON.parse(res.choices[0].message.content)
    data.image = `/grammar/g${i}.jpg`
    cards.push(data)
    console.log('✓', data.title)
  } catch (e) {
    console.log('✗', e.message)
    cards.push({ title: `Плакат ${i}`, emoji: '📄', image: `/grammar/g${i}.jpg`, summary_ru: '', sections: [] })
  }
}

writeFileSync('../frontend/src/data/grammarData.json', JSON.stringify(cards, null, 2))
console.log('\nСохранено', cards.length, 'карточек → frontend/src/data/grammarData.json')
process.exit(0)

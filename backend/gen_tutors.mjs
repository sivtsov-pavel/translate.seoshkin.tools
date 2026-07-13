import OpenAI from 'openai'
import { writeFileSync } from 'fs'
import { config } from './src/config.js'
const openai = new OpenAI({ apiKey: config.openaiApiKey })
const OUT = process.env.OUT || '/app/tutors_out'
import { mkdirSync } from 'fs'
mkdirSync(OUT, { recursive: true })

const people = [
  ['t1', 'friendly female language teacher, blonde, glasses, smiling, professional'],
  ['t2', 'friendly male teacher, brown hair, beard, warm smile'],
  ['t3', 'cheerful young female tutor, dark hair in ponytail, casual'],
  ['t4', 'older experienced male professor, grey hair, kind face'],
  ['t5', 'friendly female tutor, red hair, freckles, cheerful'],
  ['t6', 'young male teacher, glasses, curly hair, enthusiastic'],
  ['t7', 'elegant female teacher, short brown hair, confident smile'],
  ['t8', 'friendly bald male tutor with rectangular glasses, warm smile'],
]
for (const [id, desc] of people) {
  const prompt = `Cute flat vector cartoon avatar portrait of a ${desc}. Head and shoulders, centered, plain soft pastel background, thick clean outlines, kindergarten friendly illustration style, warm colors. No text.`
  try {
    const r = await openai.images.generate({ model: 'gpt-image-1', prompt, size: '1024x1024', quality: 'medium', n: 1 })
    writeFileSync(`${OUT}/${id}.png`, Buffer.from(r.data[0].b64_json, 'base64'))
    console.log('✓', id)
  } catch (e) { console.log('✗', id, e.message?.slice(0, 50)) }
}
console.log('Готово')
process.exit(0)

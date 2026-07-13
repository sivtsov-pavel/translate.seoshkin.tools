import OpenAI from 'openai'
import { writeFileSync } from 'fs'
const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY })
const OUT = '/private/tmp/claude-501/-Users-pabloseoshkin-Klients-Projects-translate-seoshkin-tools/73fa4808-30c0-4cf6-8ccb-86d985bdbbf7/scratchpad'
const prompt = `Simple cheerful flat vector illustration for a children's language flashcard. Show clearly: ice cream cone. Cute minimalist cartoon, bright colors, plain light background, one centered object, thick clean outlines, kindergarten style. No text.`

async function save(name, res) {
  const d = res.data[0]
  if (d.b64_json) writeFileSync(`${OUT}/test_${name}.png`, Buffer.from(d.b64_json, 'base64'))
  else if (d.url) { const r = await fetch(d.url); writeFileSync(`${OUT}/test_${name}.png`, Buffer.from(await r.arrayBuffer())) }
  console.log('✓', name)
}

for (const [name, opts] of [
  ['dalle3', { model: 'dall-e-3', prompt, size: '1024x1024' }],
  ['dalle2', { model: 'dall-e-2', prompt, size: '512x512' }],
  ['gptimg_med', { model: 'gpt-image-1', prompt, size: '1024x1024', quality: 'medium' }],
  ['gptimg_high', { model: 'gpt-image-1', prompt, size: '1024x1024', quality: 'high' }],
]) {
  try { await save(name, await openai.images.generate(opts)) }
  catch (e) { console.log('✗', name, e.status, e.message?.slice(0, 60)) }
}
process.exit(0)

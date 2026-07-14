import { useEffect, useState } from 'react'
import { useParams, Link } from 'react-router-dom'
import { api } from '../api/client.js'
import { useI18nStore } from '../store/i18n.js'
import { getTranslation } from '../utils/translation.js'
import { speak } from '../hooks/useSpeech.jsx'
import WordImage from '../components/WordImage.jsx'
import { cardUrl, shareLink } from '../utils/share.js'

// Озвучка на изучаемом языке карточки (не на текущем языке зрителя).
const TTS = { de: 'de-DE', es: 'es-ES', fr: 'fr-FR', it: 'it-IT', en: 'en-US', pt: 'pt-PT' }

// Карточка слова, открытая по ссылке «Поделиться» (/w/:id). Другой ученик видит слово,
// перевод на СВОЙ язык, картинку, пример и может добавить в свой разговорник.
export default function ShareCard() {
  const { id } = useParams()
  const { lang } = useI18nStore()
  const [word, setWord] = useState(null)
  const [err, setErr] = useState('')
  const [added, setAdded] = useState(false)
  const [shared, setShared] = useState('')

  useEffect(() => {
    api.get(`/share/word/${id}`).then(setWord).catch(e => setErr(e.message))
  }, [id])

  if (err) return <div style={{ maxWidth: 480, margin: '60px auto', textAlign: 'center', color: 'var(--ink-soft)' }}>
    Карточка не найдена. <Link to="/" style={{ color: 'var(--accent)' }}>На главную</Link>
  </div>
  if (!word) return <div style={{ color: 'var(--ink-soft)', textAlign: 'center', marginTop: 60 }}>Загрузка…</div>

  const ttsLang = TTS[word.target_lang] || 'de-DE'
  const translation = getTranslation(word.translations, lang, word.translation_ru)

  const addToPhrasebook = async () => {
    try {
      await api.post('/phrasebook', { de: word.word_de, ru: translation || word.translation_ru, source: 'share' })
      setAdded(true)
    } catch (e) { alert(e?.message || 'Ошибка') }
  }
  const doShare = async () => {
    const res = await shareLink({ title: word.word_de, text: `${word.word_de} — ${translation}`, url: cardUrl(word.id) })
    if (res === 'copied') { setShared('Ссылка скопирована'); setTimeout(() => setShared(''), 2000) }
  }

  return (
    <div style={{ maxWidth: 460, margin: '0 auto', padding: '18px 16px 60px' }}>
      <div style={{ background: 'var(--surface)', border: '1px solid var(--line)', borderRadius: 18, overflow: 'hidden' }}>
        <WordImage imageUrl={word.image_url} wordDe={word.word_de} bleed />
        <div style={{ padding: 20, textAlign: 'center' }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 10 }}>
            <span style={{ fontSize: 28, fontWeight: 800, color: 'var(--ink)' }}>{word.word_de}</span>
            <button onClick={() => speak(word.word_de, ttsLang)} title="Прослушать"
              style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: 24 }}>🔊</button>
          </div>
          {translation && <div style={{ fontSize: 19, color: 'var(--ink-soft)', marginTop: 6 }}>{translation}</div>}
          {word.example_sentence && (
            <div style={{ marginTop: 14, fontStyle: 'italic', color: 'var(--ink-soft)', fontSize: 15 }}>
              {word.example_sentence}
              <button onClick={() => speak(word.example_sentence, ttsLang)} title="Прослушать пример"
                style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: 15, marginLeft: 6 }}>🔊</button>
              {word.example_sentence_ru && <div style={{ fontSize: 13, marginTop: 4, fontStyle: 'normal' }}>{word.example_sentence_ru}</div>}
            </div>
          )}

          <div style={{ display: 'flex', gap: 10, marginTop: 20, justifyContent: 'center', flexWrap: 'wrap' }}>
            <button onClick={addToPhrasebook} disabled={added} style={{
              padding: '10px 18px', borderRadius: 10, border: 'none', fontSize: 14, fontWeight: 700,
              background: added ? 'var(--surface-2)' : 'var(--accent)', color: added ? 'var(--ink-soft)' : 'var(--accent-ink)',
              cursor: added ? 'default' : 'pointer',
            }}>{added ? '✓ В разговорнике' : '➕ В разговорник'}</button>
            <button onClick={doShare} style={{
              padding: '10px 18px', borderRadius: 10, fontSize: 14, fontWeight: 600,
              background: 'transparent', color: 'var(--ink)', border: '1px solid var(--line)', cursor: 'pointer',
            }}><i className="bi bi-share-fill" /> {shared || 'Поделиться'}</button>
          </div>
        </div>
      </div>
      <div style={{ textAlign: 'center', marginTop: 16 }}>
        <Link to="/" style={{ color: 'var(--accent)', fontSize: 14, textDecoration: 'none' }}>← В приложение</Link>
      </div>
    </div>
  )
}

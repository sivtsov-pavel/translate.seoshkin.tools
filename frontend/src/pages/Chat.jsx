import { useState, useEffect, useRef, useCallback } from 'react'
import { api } from '../api/client.js'
import { useAuthStore } from '../store/auth.js'
import { useI18nStore } from '../store/i18n.js'

const POLL_INTERVAL = 15_000 // 15 секунд

const TYPE_LABELS = {
  ru: { support: '🛠️ Техподдержка', teacher: '👨‍🏫 Учителю' },
  en: { support: '🛠️ Support', teacher: '👨‍🏫 Teacher' },
  de: { support: '🛠️ Support', teacher: '👨‍🏫 Lehrer' },
  uk: { support: '🛠️ Підтримка', teacher: '👨‍🏫 Вчителю' },
}

function typeLabel(lang, type) {
  return (TYPE_LABELS[lang] || TYPE_LABELS.en)[type] || type
}

export default function Chat() {
  const { user } = useAuthStore()
  const { lang } = useI18nStore()
  const isOwner = user?.role === 'owner'

  const [conversations, setConversations] = useState([])
  const [activeId, setActiveId] = useState(null)
  const [messages, setMessages]   = useState([])
  const [body, setBody]           = useState('')
  const [sending, setSending]     = useState(false)
  const [loading, setLoading]     = useState(true)
  const messagesEndRef = useRef(null)
  const pollRef        = useRef(null)

  const loadConversations = useCallback(async () => {
    try {
      const data = await api.get('/chat/conversations')
      setConversations(data)
    } catch (e) {
      console.error('chat conversations:', e)
    }
  }, [])

  const loadMessages = useCallback(async (id) => {
    if (!id) return
    try {
      const data = await api.get(`/chat/conversations/${id}/messages`)
      setMessages(data)
    } catch (e) {
      console.error('chat messages:', e)
    }
  }, [])

  // Первичная загрузка
  useEffect(() => {
    loadConversations().finally(() => setLoading(false))
  }, [loadConversations])

  // Если ученик — авто-открываем первую беседу или создаём поддержку
  useEffect(() => {
    if (isOwner || loading) return
    if (conversations.length > 0 && !activeId) {
      setActiveId(conversations[0].id)
    }
  }, [conversations, isOwner, loading, activeId])

  // Загрузка сообщений при смене беседы
  useEffect(() => {
    if (!activeId) return
    loadMessages(activeId)

    // Поллинг
    clearInterval(pollRef.current)
    pollRef.current = setInterval(() => {
      loadMessages(activeId)
      loadConversations()
    }, POLL_INTERVAL)

    return () => clearInterval(pollRef.current)
  }, [activeId, loadMessages, loadConversations])

  // Скролл вниз при новых сообщениях
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages])

  const openOrCreateConversation = async (type) => {
    try {
      const conv = await api.post('/chat/conversations', { type })
      await loadConversations()
      setActiveId(conv.id)
    } catch (e) {
      alert(e.message)
    }
  }

  const send = async (e) => {
    e.preventDefault()
    if (!body.trim() || !activeId || sending) return
    setSending(true)
    try {
      const msg = await api.post(`/chat/conversations/${activeId}/messages`, { body: body.trim() })
      setMessages(prev => [...prev, { ...msg, sender_name: user.name || user.email, sender_role: user.role }])
      setBody('')
    } catch (err) {
      alert(err.message)
    }
    setSending(false)
  }

  const activeConv = conversations.find(c => c.id === activeId)

  if (loading) return <div style={{ padding: 32, textAlign: 'center', color: 'var(--ink-soft)' }}>Загрузка...</div>

  return (
    <div style={{ display: 'flex', height: 'calc(100vh - 56px)', overflow: 'hidden' }}>
      {/* Боковая панель */}
      <aside style={{
        width: 260, flexShrink: 0, borderRight: '1px solid var(--line)',
        background: 'var(--surface)', display: 'flex', flexDirection: 'column',
      }}>
        <div style={{ padding: '16px 16px 8px', borderBottom: '1px solid var(--line)' }}>
          <div style={{ fontWeight: 700, fontSize: 15, marginBottom: 10, color: 'var(--ink)' }}>
            💬 Чат
          </div>
          {/* Кнопки создания бесед (для студента) */}
          {!isOwner && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
              <button onClick={() => openOrCreateConversation('support')} style={newChatBtn}>
                🛠️ Техподдержка
              </button>
              <button onClick={() => openOrCreateConversation('teacher')} style={newChatBtn}>
                👨‍🏫 Написать учителю
              </button>
            </div>
          )}
        </div>

        {/* Список бесед */}
        <div style={{ flex: 1, overflowY: 'auto' }}>
          {conversations.length === 0 && (
            <div style={{ padding: 16, color: 'var(--ink-soft)', fontSize: 13 }}>
              Нет бесед. Начни первую!
            </div>
          )}
          {conversations.map(c => (
            <div key={c.id} onClick={() => setActiveId(c.id)} style={{
              padding: '12px 16px', cursor: 'pointer',
              borderBottom: '1px solid var(--line)',
              background: c.id === activeId ? 'var(--accent-soft)' : 'transparent',
              borderLeft: c.id === activeId ? '3px solid var(--accent)' : '3px solid transparent',
              transition: 'background .15s',
            }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <span style={{ fontWeight: 600, fontSize: 13, color: 'var(--ink)' }}>
                  {typeLabel(lang, c.type)}
                </span>
                {parseInt(c.unread) > 0 && (
                  <span style={{
                    background: 'var(--accent)', color: 'var(--accent-ink)',
                    borderRadius: '50%', width: 20, height: 20,
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    fontSize: 11, fontWeight: 700,
                  }}>
                    {c.unread}
                  </span>
                )}
              </div>
              {isOwner && c.student_name && (
                <div style={{ fontSize: 11, color: 'var(--ink-soft)', marginTop: 2 }}>
                  {c.student_name}
                </div>
              )}
              <div style={{ fontSize: 11, color: 'var(--ink-soft)', marginTop: 2 }}>
                {new Date(c.updated_at).toLocaleDateString('ru', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })}
              </div>
            </div>
          ))}
        </div>
      </aside>

      {/* Область переписки */}
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
        {!activeId ? (
          <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--ink-soft)', flexDirection: 'column', gap: 16 }}>
            <div style={{ fontSize: 40 }}>💬</div>
            <div style={{ fontSize: 15 }}>Выбери беседу слева</div>
          </div>
        ) : (
          <>
            {/* Шапка чата */}
            <div style={{
              padding: '12px 20px', borderBottom: '1px solid var(--line)',
              background: 'var(--surface)', fontWeight: 700, fontSize: 15,
              color: 'var(--ink)',
            }}>
              {activeConv && typeLabel(lang, activeConv.type)}
              {isOwner && activeConv?.student_name && (
                <span style={{ fontWeight: 400, fontSize: 13, color: 'var(--ink-soft)', marginLeft: 8 }}>
                  · {activeConv.student_name}
                </span>
              )}
            </div>

            {/* Сообщения */}
            <div style={{ flex: 1, overflowY: 'auto', padding: '16px 20px', display: 'flex', flexDirection: 'column', gap: 10 }}>
              {messages.length === 0 && (
                <div style={{ textAlign: 'center', color: 'var(--ink-soft)', fontSize: 13, marginTop: 32 }}>
                  Нет сообщений. Напиши первым!
                </div>
              )}
              {messages.map(m => {
                const isMine = m.sender_id === user?.id
                return (
                  <div key={m.id} style={{ display: 'flex', justifyContent: isMine ? 'flex-end' : 'flex-start' }}>
                    <div style={{
                      maxWidth: '75%', padding: '10px 14px', borderRadius: isMine ? '16px 16px 4px 16px' : '16px 16px 16px 4px',
                      background: isMine ? 'var(--accent)' : 'var(--surface-2)',
                      color: isMine ? 'var(--accent-ink)' : 'var(--ink)',
                      fontSize: 14, lineHeight: 1.55,
                    }}>
                      {!isMine && (
                        <div style={{ fontSize: 11, fontWeight: 700, marginBottom: 4, opacity: 0.7 }}>
                          {m.sender_name}
                        </div>
                      )}
                      <div style={{ whiteSpace: 'pre-wrap', wordBreak: 'break-word' }}>{m.body}</div>
                      <div style={{ fontSize: 10, opacity: 0.6, marginTop: 4, textAlign: 'right' }}>
                        {new Date(m.created_at).toLocaleTimeString('ru', { hour: '2-digit', minute: '2-digit' })}
                        {isMine && m.read_at && ' ✓✓'}
                        {isMine && !m.read_at && ' ✓'}
                      </div>
                    </div>
                  </div>
                )
              })}
              <div ref={messagesEndRef} />
            </div>

            {/* Поле ввода */}
            <form onSubmit={send} style={{
              padding: '12px 16px', borderTop: '1px solid var(--line)',
              background: 'var(--surface)', display: 'flex', gap: 10,
            }}>
              <textarea
                value={body}
                onChange={e => setBody(e.target.value)}
                onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); send(e) } }}
                placeholder="Напиши сообщение… (Enter — отправить)"
                rows={2}
                style={{
                  flex: 1, resize: 'none', borderRadius: 12, padding: '10px 14px',
                  fontSize: 14, border: '1px solid var(--line)',
                  background: 'var(--surface-2)', color: 'var(--ink)',
                }}
              />
              <button type="submit" disabled={!body.trim() || sending} style={{
                padding: '0 20px', borderRadius: 12,
                background: body.trim() ? 'var(--accent)' : 'var(--surface-2)',
                color: body.trim() ? 'var(--accent-ink)' : 'var(--ink-soft)',
                border: 'none', fontWeight: 700, fontSize: 15, cursor: body.trim() ? 'pointer' : 'default',
                transition: 'background .15s',
              }}>
                {sending ? '⏳' : '→'}
              </button>
            </form>
          </>
        )}
      </div>
    </div>
  )
}

const newChatBtn = {
  width: '100%', padding: '8px 12px', borderRadius: 8, fontSize: 13,
  background: 'var(--surface-2)', color: 'var(--ink)', border: '1px solid var(--line)',
  cursor: 'pointer', fontWeight: 600, textAlign: 'left',
}

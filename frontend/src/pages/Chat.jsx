import { useState, useEffect, useRef, useCallback } from 'react'
import { api } from '../api/client.js'
import { useAuthStore } from '../store/auth.js'
import { useI18nStore } from '../store/i18n.js'

const POLL_INTERVAL = 15_000

const TYPE_META = {
  support: { icon: '🛠️', label: 'Техподдержка', labelEn: 'Support' },
  teacher: { icon: '👨‍🏫', label: 'Учителю', labelEn: 'Teacher' },
}

export default function Chat() {
  const { user } = useAuthStore()
  const { lang } = useI18nStore()
  const isOwner = user?.role === 'owner'

  const [conversations, setConversations] = useState([])
  const [activeId, setActiveId]     = useState(null)
  const [messages, setMessages]     = useState([])
  const [body, setBody]             = useState('')
  const [sending, setSending]       = useState(false)
  const [loading, setLoading]       = useState(true)
  const [mobileView, setMobileView] = useState('list') // 'list' | 'chat'
  const messagesEndRef = useRef(null)
  const textareaRef    = useRef(null)
  const pollRef        = useRef(null)

  const loadConversations = useCallback(async () => {
    try {
      const data = await api.get('/chat/conversations')
      setConversations(data)
    } catch (e) { console.error('chat/conversations:', e) }
  }, [])

  const loadMessages = useCallback(async (id) => {
    if (!id) return
    try {
      const data = await api.get(`/chat/conversations/${id}/messages`)
      setMessages(data)
    } catch (e) { console.error('chat/messages:', e) }
  }, [])

  useEffect(() => {
    loadConversations().finally(() => setLoading(false))
  }, [loadConversations])

  useEffect(() => {
    if (!activeId) return
    loadMessages(activeId)
    clearInterval(pollRef.current)
    pollRef.current = setInterval(() => {
      loadMessages(activeId)
      loadConversations()
    }, POLL_INTERVAL)
    return () => clearInterval(pollRef.current)
  }, [activeId, loadMessages, loadConversations])

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages])

  const openOrCreate = async (type) => {
    try {
      const conv = await api.post('/chat/conversations', { type })
      await loadConversations()
      selectConv(conv.id)
    } catch (e) { alert(e.message) }
  }

  const selectConv = (id) => {
    setActiveId(id)
    setMobileView('chat')
    setTimeout(() => textareaRef.current?.focus(), 100)
  }

  const send = async (e) => {
    e.preventDefault()
    if (!body.trim() || !activeId || sending) return
    setSending(true)
    try {
      const msg = await api.post(`/chat/conversations/${activeId}/messages`, { body: body.trim() })
      setMessages(prev => [...prev, { ...msg, sender_name: user?.name || user?.email, sender_role: user?.role }])
      setBody('')
      setTimeout(() => textareaRef.current?.focus(), 50)
    } catch (err) { alert(err.message) }
    setSending(false)
  }

  const activeConv = conversations.find(c => c.id === activeId)

  if (loading) return (
    <div className="full-page-layout" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--ink-soft)', fontSize: 15 }}>
      Загрузка...
    </div>
  )

  return (
    <div className="full-page-layout" style={{ display: 'flex', background: 'var(--bg)' }}>

      {/* ── Боковая панель (список бесед) ── */}
      <aside style={{
        width: 260, flexShrink: 0,
        borderRight: '1px solid var(--line)',
        background: 'var(--surface)',
        display: 'flex', flexDirection: 'column',
        // на мобиле: показываем только при mobileView === 'list'
        ...(mobileView === 'chat' ? { display: 'none' } : {}),
      }}
        className="chat-sidebar"
      >
        {/* Шапка списка */}
        <div style={{ padding: '14px 14px 10px', borderBottom: '1px solid var(--line)', flexShrink: 0 }}>
          <div style={{ fontWeight: 700, fontSize: 16, marginBottom: 10, color: 'var(--ink)', display: 'flex', alignItems: 'center', gap: 8 }}>
            💬 Чат
          </div>
          {!isOwner && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
              <button onClick={() => openOrCreate('support')} style={newBtn}>
                🛠️ Написать в поддержку
              </button>
              <button onClick={() => openOrCreate('teacher')} style={newBtn}>
                👨‍🏫 Написать учителю
              </button>
            </div>
          )}
          {isOwner && (
            <div style={{ fontSize: 12, color: 'var(--ink-soft)' }}>
              Все входящие обращения
            </div>
          )}
        </div>

        {/* Список */}
        <div style={{ flex: 1, overflowY: 'auto', WebkitOverflowScrolling: 'touch' }}>
          {conversations.length === 0 && !isOwner && (
            <div style={{ padding: '20px 16px', color: 'var(--ink-soft)', fontSize: 13, lineHeight: 1.6 }}>
              Нажми кнопку выше, чтобы написать в поддержку или учителю.
            </div>
          )}
          {conversations.length === 0 && isOwner && (
            <div style={{ padding: '20px 16px', color: 'var(--ink-soft)', fontSize: 13 }}>
              Пока нет обращений
            </div>
          )}
          {conversations.map(c => {
            const meta = TYPE_META[c.type] || {}
            const unread = parseInt(c.unread) || 0
            return (
              <div key={c.id} onClick={() => selectConv(c.id)} style={{
                padding: '11px 14px', cursor: 'pointer',
                borderBottom: '1px solid var(--line)',
                background: c.id === activeId ? 'var(--accent-soft)' : 'transparent',
                borderLeft: `3px solid ${c.id === activeId ? 'var(--accent)' : 'transparent'}`,
              }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 6 }}>
                  <span style={{ fontWeight: 600, fontSize: 13, color: 'var(--ink)' }}>
                    {meta.icon} {meta.label}
                  </span>
                  {unread > 0 && (
                    <span style={{
                      background: 'var(--red)', color: '#fff', borderRadius: 20,
                      padding: '1px 7px', fontSize: 11, fontWeight: 700, flexShrink: 0,
                    }}>{unread}</span>
                  )}
                </div>
                {isOwner && c.student_name && (
                  <div style={{ fontSize: 12, color: 'var(--ink-soft)', marginTop: 2 }}>
                    {c.student_name}
                  </div>
                )}
                <div style={{ fontSize: 11, color: 'var(--ink-soft)', marginTop: 3 }}>
                  {new Date(c.updated_at).toLocaleString('ru', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })}
                </div>
              </div>
            )
          })}
        </div>
      </aside>

      {/* ── Область переписки ── */}
      <div style={{
        flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden', minWidth: 0,
        // на мобиле: показываем только при mobileView === 'chat'
        ...(mobileView === 'list' ? { display: 'none' } : {}),
      }}
        className="chat-messages-pane"
      >
        {!activeId ? (
          <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', flexDirection: 'column', gap: 16, color: 'var(--ink-soft)' }}>
            <span style={{ fontSize: 48 }}>💬</span>
            <div style={{ fontSize: 15 }}>Выбери беседу слева</div>
          </div>
        ) : (
          <>
            {/* Шапка чата */}
            <div style={{
              padding: '12px 16px', borderBottom: '1px solid var(--line)',
              background: 'var(--surface)', display: 'flex', alignItems: 'center', gap: 10, flexShrink: 0,
            }}>
              {/* Кнопка "назад" — только мобиль */}
              <button onClick={() => setMobileView('list')} className="chat-back-btn"
                style={{
                  background: 'none', border: 'none', cursor: 'pointer', padding: '4px 8px',
                  color: 'var(--accent)', fontSize: 16, fontWeight: 700, flexShrink: 0,
                }}>
                ← Назад
              </button>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontWeight: 700, fontSize: 15, color: 'var(--ink)' }}>
                  {activeConv && `${TYPE_META[activeConv.type]?.icon} ${TYPE_META[activeConv.type]?.label}`}
                </div>
                {isOwner && activeConv?.student_name && (
                  <div style={{ fontSize: 12, color: 'var(--ink-soft)' }}>
                    {activeConv.student_name}
                  </div>
                )}
              </div>
            </div>

            {/* Сообщения */}
            <div style={{
              flex: 1, overflowY: 'auto', WebkitOverflowScrolling: 'touch',
              padding: '16px 16px 8px', display: 'flex', flexDirection: 'column', gap: 8,
            }}>
              {messages.length === 0 && (
                <div style={{ textAlign: 'center', color: 'var(--ink-soft)', fontSize: 13, marginTop: 40 }}>
                  Начни разговор — напиши первое сообщение ниже
                </div>
              )}
              {messages.map(m => {
                const isMine = m.sender_id === user?.id
                return (
                  <div key={m.id} style={{ display: 'flex', justifyContent: isMine ? 'flex-end' : 'flex-start' }}>
                    <div style={{
                      maxWidth: '78%', padding: '9px 13px',
                      borderRadius: isMine ? '16px 16px 4px 16px' : '16px 16px 16px 4px',
                      background: isMine ? 'var(--accent)' : 'var(--surface-2)',
                      color: isMine ? 'var(--accent-ink)' : 'var(--ink)',
                      fontSize: 14, lineHeight: 1.55,
                    }}>
                      {!isMine && (
                        <div style={{ fontSize: 11, fontWeight: 700, marginBottom: 3, opacity: 0.7 }}>
                          {m.sender_name}
                        </div>
                      )}
                      <div style={{ whiteSpace: 'pre-wrap', wordBreak: 'break-word' }}>{m.body}</div>
                      <div style={{ fontSize: 10, opacity: 0.55, marginTop: 3, textAlign: 'right' }}>
                        {new Date(m.created_at).toLocaleTimeString('ru', { hour: '2-digit', minute: '2-digit' })}
                        {isMine && (m.read_at ? ' ✓✓' : ' ✓')}
                      </div>
                    </div>
                  </div>
                )
              })}
              <div ref={messagesEndRef} />
            </div>

            {/* Ввод сообщения */}
            <form onSubmit={send} style={{
              padding: '10px 12px', borderTop: '1px solid var(--line)',
              background: 'var(--surface)', display: 'flex', gap: 8, flexShrink: 0,
            }}>
              <textarea
                ref={textareaRef}
                value={body}
                onChange={e => setBody(e.target.value)}
                onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); send(e) } }}
                placeholder="Сообщение… (Enter — отправить, Shift+Enter — перенос)"
                rows={2}
                style={{
                  flex: 1, resize: 'none', borderRadius: 12, padding: '9px 13px',
                  fontSize: 14, border: '1px solid var(--line)', fontFamily: 'inherit',
                  background: 'var(--surface-2)', color: 'var(--ink)', outline: 'none',
                  WebkitAppearance: 'none',
                }}
              />
              <button type="submit" disabled={!body.trim() || sending} style={{
                padding: '0 18px', borderRadius: 12, border: 'none', fontSize: 18,
                background: body.trim() ? 'var(--accent)' : 'var(--surface-2)',
                color: body.trim() ? 'var(--accent-ink)' : 'var(--ink-soft)',
                cursor: body.trim() ? 'pointer' : 'default',
                transition: 'background .15s', flexShrink: 0, alignSelf: 'stretch',
              }}>
                {sending ? '⏳' : '→'}
              </button>
            </form>
          </>
        )}
      </div>

      {/* Стили для адаптивности */}
      <style>{`
        /* На мобиле: полноэкранные панели по очереди */
        @media (max-width: 767px) {
          .chat-sidebar { width: 100% !important; }
          .chat-messages-pane { }
          .chat-back-btn { display: inline-block !important; }
        }
        /* На десктопе: обе панели рядом, кнопка назад скрыта */
        @media (min-width: 768px) {
          .chat-sidebar { display: flex !important; }
          .chat-messages-pane { display: flex !important; }
          .chat-back-btn { display: none !important; }
        }
      `}</style>
    </div>
  )
}

const newBtn = {
  width: '100%', padding: '9px 12px', borderRadius: 9, fontSize: 13,
  background: 'var(--surface-2)', color: 'var(--ink)', border: '1px solid var(--line)',
  cursor: 'pointer', fontWeight: 600, textAlign: 'left', lineHeight: 1.4,
}

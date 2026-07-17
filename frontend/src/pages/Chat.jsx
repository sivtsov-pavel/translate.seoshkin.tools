import { useState, useEffect, useRef, useCallback } from 'react'
import { api } from '../api/client.js'
import { useAuthStore } from '../store/auth.js'
import { useOnline, OfflineNotice } from '../components/OfflineGuard.jsx'
import { useI18nStore } from '../store/i18n.js'

const POLL_INTERVAL = 15_000

const TYPE_META = {
  support: { icon: '🛠️', label: 'Техподдержка', labelEn: 'Support' },
  teacher: { icon: '👨‍🏫', label: 'Учителю', labelEn: 'Teacher' },
}

// Раздел требует сервер/ИИ: guard-обёртка отдельным компонентом, чтобы ранний
// return не менял список хуков основного компонента (Rules of Hooks)
export default function Chat() {
  const online = useOnline()
  if (!online) return <OfflineNotice />
  return <ChatInner />
}

function ChatInner() {
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

  // При первой загрузке — авто-открываем первую беседу (на десктопе сразу, на мобиле только выбираем)
  useEffect(() => {
    const init = async () => {
      try {
        const data = await api.get('/chat/conversations')
        setConversations(data)
        if (data.length > 0) {
          setActiveId(data[0].id)
          if (window.innerWidth >= 768) setMobileView('chat')
        }
      } finally {
        setLoading(false)
      }
    }
    init()
  }, [])

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
        width: 280, flexShrink: 0,
        borderRight: '1px solid var(--line)',
        background: 'var(--surface)',
        display: 'flex', flexDirection: 'column',
        ...(mobileView === 'chat' ? { display: 'none' } : {}),
      }}
        className="chat-sidebar"
      >
        {/* Узкая полоса иконок — только планшет 768-1023px (показывается через CSS) */}
        <div className="chat-sidebar-narrow" style={{
          display: 'none', flexDirection: 'column', alignItems: 'center',
          gap: 10, padding: '12px 0', overflowY: 'auto', flex: 1,
          WebkitOverflowScrolling: 'touch',
        }}>
          {!isOwner && (
            <>
              <button onClick={() => openOrCreate('support')} title="Техподдержка"
                style={{ ...iconPillBtn, background: 'var(--accent)', color: 'var(--accent-ink)' }}>
                🛠️
              </button>
              <button onClick={() => openOrCreate('teacher')} title="Учителю"
                style={{ ...iconPillBtn, background: 'var(--surface-2)', color: 'var(--ink)', border: '1px solid var(--line)' }}>
                👨‍🏫
              </button>
              {conversations.length > 0 && (
                <div style={{ width: 32, height: 1, background: 'var(--line)', margin: '2px 0' }} />
              )}
            </>
          )}
          {conversations.map(c => {
            const meta = TYPE_META[c.type] || {}
            const unread = parseInt(c.unread) || 0
            return (
              <div key={c.id} onClick={() => selectConv(c.id)}
                title={`${meta.label}${isOwner && c.student_name ? ` — ${c.student_name}` : ''}`}
                style={{ position: 'relative', cursor: 'pointer' }}>
                <div style={{
                  width: 40, height: 40, borderRadius: 12, display: 'flex',
                  alignItems: 'center', justifyContent: 'center', fontSize: 20,
                  background: c.id === activeId ? 'var(--accent-soft)' : 'var(--surface-2)',
                  border: `2px solid ${c.id === activeId ? 'var(--accent)' : 'transparent'}`,
                  transition: 'all .15s',
                }}>
                  {meta.icon}
                </div>
                {unread > 0 && (
                  <span style={{
                    position: 'absolute', top: -4, right: -4,
                    background: 'var(--red)', color: '#fff', borderRadius: 10,
                    padding: '1px 5px', fontSize: 9, fontWeight: 700,
                    lineHeight: 1.4, minWidth: 14, textAlign: 'center',
                  }}>{unread > 9 ? '9+' : unread}</span>
                )}
              </div>
            )
          })}
        </div>

        {/* Полное меню — мобиль и десктоп */}
        <div className="chat-sidebar-full" style={{ display: 'flex', flexDirection: 'column', flex: 1, overflow: 'hidden' }}>
          {/* Шапка */}
          <div style={{ padding: '16px 14px 12px', borderBottom: '1px solid var(--line)', flexShrink: 0 }}>
            <div style={{ fontWeight: 700, fontSize: 16, color: 'var(--ink)', marginBottom: isOwner ? 4 : 12 }}>
              💬 Чат
            </div>
            {isOwner && <div style={{ fontSize: 12, color: 'var(--ink-soft)', marginBottom: 0 }}>Входящие обращения</div>}

            {!isOwner && (
              <>
                <button onClick={() => openOrCreate('support')}
                  style={{ ...newBtn, marginBottom: 8, background: 'var(--accent)', color: 'var(--accent-ink)', border: 'none' }}>
                  <span style={{ fontSize: 18 }}>🛠️</span>
                  <div>
                    <div style={{ fontWeight: 700, fontSize: 14 }}>Техподдержка</div>
                    <div style={{ fontSize: 11, opacity: 0.8, fontWeight: 400 }}>Проблема с сайтом или вопрос</div>
                  </div>
                  <span style={{ marginLeft: 'auto', fontSize: 20 }}>+</span>
                </button>
                <button onClick={() => openOrCreate('teacher')}
                  style={{ ...newBtn, background: 'var(--surface-2)', color: 'var(--ink)', border: '1px solid var(--line)' }}>
                  <span style={{ fontSize: 18 }}>👨‍🏫</span>
                  <div>
                    <div style={{ fontWeight: 700, fontSize: 14 }}>Учителю</div>
                    <div style={{ fontSize: 11, color: 'var(--ink-soft)', fontWeight: 400 }}>Вопрос по уроку или заданию</div>
                  </div>
                  <span style={{ marginLeft: 'auto', fontSize: 20, color: 'var(--ink-soft)' }}>+</span>
                </button>
              </>
            )}
          </div>

          {/* Список бесед */}
          <div style={{ flex: 1, overflowY: 'auto', WebkitOverflowScrolling: 'touch' }}>
            {conversations.length === 0 && (
              <div style={{ padding: '24px 16px', color: 'var(--ink-soft)', fontSize: 13, lineHeight: 1.7, textAlign: 'center' }}>
                {isOwner ? 'Нет обращений' : 'Твои разговоры появятся здесь после того как ты напишешь'}
              </div>
            )}
            {conversations.map(c => {
              const meta = TYPE_META[c.type] || {}
              const unread = parseInt(c.unread) || 0
              return (
                <div key={c.id} onClick={() => selectConv(c.id)} style={{
                  padding: '12px 14px', cursor: 'pointer',
                  borderBottom: '1px solid var(--line)',
                  background: c.id === activeId ? 'var(--accent-soft)' : 'transparent',
                  borderLeft: `3px solid ${c.id === activeId ? 'var(--accent)' : 'transparent'}`,
                }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 6 }}>
                    <span style={{ fontWeight: 600, fontSize: 14, color: 'var(--ink)' }}>
                      {meta.icon} {meta.label}
                    </span>
                    {unread > 0 && (
                      <span style={{
                        background: 'var(--red)', color: '#fff', borderRadius: 20,
                        padding: '2px 8px', fontSize: 11, fontWeight: 700, flexShrink: 0,
                      }}>{unread} новых</span>
                    )}
                  </div>
                  {isOwner && c.student_name && (
                    <div style={{ fontSize: 12, color: 'var(--ink-soft)', marginTop: 2 }}>👤 {c.student_name}</div>
                  )}
                  <div style={{ fontSize: 11, color: 'var(--ink-soft)', marginTop: 3 }}>
                    {new Date(c.updated_at).toLocaleString('ru', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })}
                  </div>
                </div>
              )
            })}
          </div>
        </div>
      </aside>

      {/* ── Главная область ── */}
      <div style={{
        flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden', minWidth: 0,
        ...(mobileView === 'list' ? { display: 'none' } : {}),
      }}
        className="chat-messages-pane"
      >
        {!activeId ? (
          <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', flexDirection: 'column', gap: 20, padding: 32, textAlign: 'center' }}>
            <div style={{ fontSize: 56 }}>💬</div>
            <div style={{ fontSize: 18, fontWeight: 700, color: 'var(--ink)' }}>Выбери разговор слева</div>
            <div style={{ fontSize: 14, color: 'var(--ink-soft)', maxWidth: 300 }}>
              {isOwner ? 'Нажми на обращение в списке чтобы ответить' : 'Или начни новый разговор кнопками в левом меню'}
            </div>
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
        /* Мобиль ≤767px: полноэкранные панели по очереди */
        @media (max-width: 767px) {
          .chat-sidebar { width: 100% !important; }
          .chat-back-btn { display: inline-block !important; }
          .chat-sidebar-narrow { display: none !important; }
          .chat-sidebar-full { display: flex !important; flex: 1; overflow: hidden; }
        }
        /* Планшет 768-1023px: узкая панель иконок + полная область сообщений */
        @media (min-width: 768px) and (max-width: 1023px) {
          .chat-sidebar { display: flex !important; width: 60px !important; min-width: 60px !important; }
          .chat-messages-pane { display: flex !important; }
          .chat-back-btn { display: none !important; }
          .chat-sidebar-narrow { display: flex !important; }
          .chat-sidebar-full { display: none !important; }
        }
        /* Десктоп ≥1024px: полный сайдбар */
        @media (min-width: 1024px) {
          .chat-sidebar { display: flex !important; }
          .chat-messages-pane { display: flex !important; }
          .chat-back-btn { display: none !important; }
          .chat-sidebar-narrow { display: none !important; }
          .chat-sidebar-full { display: flex !important; flex: 1; overflow: hidden; }
        }
      `}</style>
    </div>
  )
}

const newBtn = {
  width: '100%', padding: '11px 14px', borderRadius: 10, fontSize: 13,
  background: 'var(--surface-2)', color: 'var(--ink)', border: '1px solid var(--line)',
  cursor: 'pointer', fontWeight: 600, textAlign: 'left', lineHeight: 1.4,
  display: 'flex', alignItems: 'center', gap: 10,
}

const iconPillBtn = {
  width: 40, height: 40, borderRadius: 12, fontSize: 20,
  display: 'flex', alignItems: 'center', justifyContent: 'center',
  cursor: 'pointer', border: 'none', padding: 0, flexShrink: 0,
}

import { Link } from 'react-router-dom'

const UPDATED = '10 июля 2026 г.'

export default function Cookies() {
  return (
    <div style={{ maxWidth: 720, margin: '0 auto', padding: '40px 20px 80px', lineHeight: 1.75, color: 'var(--ink)', fontFamily: 'Georgia,serif' }}>
      <Link to="/" style={{ fontSize: 13, color: 'var(--ink-soft)', textDecoration: 'none', display: 'inline-block', marginBottom: 28 }}>
        ← На главную
      </Link>

      <h1 style={{ fontFamily: 'Georgia,serif', fontSize: 28, fontWeight: 700, marginBottom: 6 }}>Политика использования файлов cookie</h1>
      <p style={{ fontSize: 13, color: 'var(--ink-soft)', marginBottom: 32 }}>Последнее обновление: {UPDATED}</p>

      <Section title="Что такое cookie">
        Файлы cookie — небольшие текстовые файлы, которые сохраняются в браузере при посещении сайтов.
        <strong>translate.seoshkin.tools</strong> использует только <em>функциональные</em> хранилища данных, необходимые для работы приложения.
        Мы <strong>не используем рекламные, аналитические или трекинговые cookie</strong> третьих сторон.
      </Section>

      <Section title="Что именно мы храним">
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 14 }}>
          <thead>
            <tr style={{ background: 'var(--surface-2)' }}>
              <Th>Ключ</Th>
              <Th>Хранилище</Th>
              <Th>Назначение</Th>
              <Th>Срок</Th>
            </tr>
          </thead>
          <tbody>
            <Tr name="auth_token"              storage="localStorage" desc="JWT токен авторизации — необходим для входа в систему"                   ttl="30 дней" />
            <Tr name="lang"                    storage="localStorage" desc="Выбранный язык интерфейса (ru, en, de, uk…)"                            ttl="Постоянно" />
            <Tr name="app_visual_settings"     storage="localStorage" desc="Тема, шрифт, масштаб, скорость голоса, тип навигации"                   ttl="Постоянно" />
            <Tr name="auto_speak"              storage="localStorage" desc="Включено/выключено автопроизношение слов"                               ttl="Постоянно" />
            <Tr name="speak_translation"       storage="localStorage" desc="Произносить ли перевод после немецкого слова"                           ttl="Постоянно" />
            <Tr name="de_voice_name"           storage="localStorage" desc="Выбранный голос Text-to-Speech для немецкого"                          ttl="Постоянно" />
            <Tr name="voice_rate"              storage="localStorage" desc="Скорость произношения (0.5–1.5)"                                        ttl="Постоянно" />
          </tbody>
        </table>
      </Section>

      <Section title="Технические cookie браузера">
        При использовании Service Worker (PWA-режим) браузер может создавать служебные кеши для офлайн-работы приложения.
        Эти кеши не содержат персональных данных и управляются браузером.
      </Section>

      <Section title="Сторонние сервисы">
        <ul style={{ paddingLeft: 20 }}>
          <li><strong>OpenAI API</strong> — мы передаём данные уроков (текст, изображения) для генерации упражнений. OpenAI не устанавливает cookie в вашем браузере напрямую.</li>
          <li><strong>Google Fonts / Bootstrap Icons</strong> — если используются, могут загружаться с CDN. В продакшен-версии шрифты встроены в сборку.</li>
        </ul>
      </Section>

      <Section title="Управление хранилищем">
        Все данные хранятся в <code style={{ background: 'var(--surface-2)', padding: '1px 6px', borderRadius: 4, fontSize: 13 }}>localStorage</code> вашего браузера.
        Вы можете очистить их в любой момент:
        <ul style={{ paddingLeft: 20, marginTop: 8 }}>
          <li>Chrome/Edge: Настройки → Конфиденциальность → Файлы cookie и данные сайтов → Удалить данные</li>
          <li>Firefox: Настройки → Приватность и защита → Файлы cookie и данные сайтов → Удалить данные</li>
          <li>Safari: Настройки → Конфиденциальность → Управление данными сайта</li>
        </ul>
        <strong>Внимание:</strong> очистка localStorage приведёт к выходу из системы и сбросу настроек интерфейса.
      </Section>

      <Section title="Контакты">
        Вопросы по cookie: <a href="mailto:sivtsov.pavel@gmail.com" style={{ color: 'var(--accent)' }}>sivtsov.pavel@gmail.com</a>
      </Section>

      <div style={{ marginTop: 40, paddingTop: 20, borderTop: '1px solid var(--line)', fontSize: 13, color: 'var(--ink-soft)', display: 'flex', gap: 24, flexWrap: 'wrap' }}>
        <Link to="/privacy" style={{ color: 'var(--ink-soft)' }}>Политика конфиденциальности</Link>
        <Link to="/terms"   style={{ color: 'var(--ink-soft)' }}>Условия использования</Link>
        <Link to="/docs"    style={{ color: 'var(--ink-soft)' }}>Документация</Link>
      </div>
    </div>
  )
}

function Section({ title, children }) {
  return (
    <div style={{ marginBottom: 28 }}>
      <h2 style={{ fontSize: 17, fontWeight: 700, marginBottom: 10, fontFamily: 'Georgia,serif', color: 'var(--ink)' }}>{title}</h2>
      <div style={{ fontSize: 15, color: 'var(--ink)' }}>{children}</div>
    </div>
  )
}

function Th({ children }) {
  return (
    <th style={{ padding: '8px 12px', textAlign: 'left', borderBottom: '2px solid var(--line)', fontWeight: 700, fontSize: 13, color: 'var(--ink-soft)' }}>
      {children}
    </th>
  )
}

function Tr({ name, storage, desc, ttl }) {
  return (
    <tr style={{ borderBottom: '1px solid var(--line)' }}>
      <td style={{ padding: '8px 12px', fontFamily: 'monospace', fontSize: 12, color: 'var(--accent)', whiteSpace: 'nowrap' }}>{name}</td>
      <td style={{ padding: '8px 12px', fontSize: 13, color: 'var(--ink-soft)', whiteSpace: 'nowrap' }}>{storage}</td>
      <td style={{ padding: '8px 12px', fontSize: 13 }}>{desc}</td>
      <td style={{ padding: '8px 12px', fontSize: 13, color: 'var(--ink-soft)', whiteSpace: 'nowrap' }}>{ttl}</td>
    </tr>
  )
}

import { Link } from 'react-router-dom'
import PublicHeader from '../components/PublicHeader.jsx'

const UPDATED = '10 июля 2026 г.'
const APP     = 'deutschlernen.ai'
const EMAIL   = 'sivtsov.pavel@gmail.com'

export default function Privacy() {
  return (
    <div style={{ minHeight: '100vh', background: 'var(--bg)', color: 'var(--ink)' }}>
      <PublicHeader />
      <div style={{ maxWidth: 720, margin: '0 auto', padding: '40px 20px 80px', lineHeight: 1.75, fontFamily: 'Georgia,serif' }}>

      <h1 style={{ fontFamily: 'Georgia,serif', fontSize: 28, fontWeight: 700, marginBottom: 6 }}>Политика конфиденциальности</h1>
      <p style={{ fontSize: 13, color: 'var(--ink-soft)', marginBottom: 32 }}>Последнее обновление: {UPDATED}</p>

      <Section title="1. Общие положения">
        Настоящая политика конфиденциальности описывает, какие данные собирает сервис <strong>{APP}</strong> («Сервис»), как мы их используем и как защищаем.
        Используя Сервис, вы соглашаетесь с условиями данной политики.
      </Section>

      <Section title="2. Какие данные мы собираем">
        <ul style={{ paddingLeft: 20 }}>
          <li><strong>Аккаунт:</strong> адрес электронной почты и пароль (хранится в виде bcrypt-хеша) — для регистрации и входа.</li>
          <li><strong>Учебные данные:</strong> слова, упражнения, результаты попыток, разговорник — для работы системы интервального повторения (SM-2).</li>
          <li><strong>Загружаемые файлы:</strong> фотографии учебника и аудиозаписи уроков — передаются ИИ для распознавания содержимого.</li>
          <li><strong>Настройки:</strong> тема, язык, шрифт, скорость голоса — хранятся локально в браузере (localStorage).</li>
          <li><strong>Аналитика:</strong> статистика обучения (даты занятий, количество попыток) — только внутри Сервиса, не передаётся третьим лицам.</li>
        </ul>
      </Section>

      <Section title="3. Как мы используем данные">
        <ul style={{ paddingLeft: 20 }}>
          <li>Обеспечение работы Сервиса: создание уроков, расчёт расписания повторений, генерация упражнений.</li>
          <li>ИИ-обработка: фотографии и аудио передаются в OpenAI API для извлечения слов и создания упражнений. OpenAI не хранит данные для обучения моделей (Enterprise API Policy).</li>
          <li>Уведомления: email-уведомления учителю при новом сообщении от ученика (только при наличии SMTP-настроек).</li>
        </ul>
        Мы не продаём, не передаём и не раскрываем ваши персональные данные третьим лицам, за исключением случаев, описанных выше.
      </Section>

      <Section title="4. Хранение данных">
        Данные хранятся в базе данных PostgreSQL на сервере в EU (Google Cloud). Доступ к серверу защищён SSH-ключами.
        Файлы уроков (фото, аудио) хранятся на том же сервере и доступны только авторизованным пользователям.
      </Section>

      <Section title="5. Файлы cookie">
        Сервис использует:
        <ul style={{ paddingLeft: 20 }}>
          <li><strong>JWT-токен аутентификации</strong> — хранится в localStorage браузера, необходим для работы приложения.</li>
          <li><strong>Настройки интерфейса</strong> — язык, тема, визуальные настройки — localStorage.</li>
        </ul>
        Мы не используем рекламные cookie или трекеры третьих сторон. Подробнее: <Link to="/cookies">Политика cookies</Link>.
      </Section>

      <Section title="6. Ваши права">
        Вы имеете право:
        <ul style={{ paddingLeft: 20 }}>
          <li>Запросить копию своих данных — напишите на {EMAIL}.</li>
          <li>Удалить аккаунт и все связанные данные — обратитесь к администратору.</li>
          <li>Исправить неточные данные через настройки профиля или обратившись к нам.</li>
        </ul>
      </Section>

      <Section title="7. Дети">
        Сервис может использоваться детьми только под руководством родителей или учителей. Аккаунт ученика создаётся учителем или родителем.
        Мы не собираем данные детей без ведома и согласия взрослого, который управляет аккаунтом.
      </Section>

      <Section title="8. Изменения политики">
        Мы можем обновлять данную политику. Об изменениях будет сообщено через интерфейс Сервиса или по email.
        Продолжение использования Сервиса после обновления означает согласие с новыми условиями.
      </Section>

      <Section title="9. Контакты">
        По вопросам конфиденциальности обращайтесь: <a href={`mailto:${EMAIL}`} style={{ color: 'var(--accent)' }}>{EMAIL}</a>
      </Section>

      <div style={{ marginTop: 40, paddingTop: 20, borderTop: '1px solid var(--line)', fontSize: 13, color: 'var(--ink-soft)', display: 'flex', gap: 24, flexWrap: 'wrap' }}>
        <Link to="/terms"   style={{ color: 'var(--ink-soft)' }}>Условия использования</Link>
        <Link to="/cookies" style={{ color: 'var(--ink-soft)' }}>Политика cookies</Link>
        <Link to="/docs"    style={{ color: 'var(--ink-soft)' }}>Документация</Link>
      </div>
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

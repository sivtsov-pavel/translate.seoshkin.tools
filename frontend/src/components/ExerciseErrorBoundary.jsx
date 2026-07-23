import { Component } from 'react'

// Предохранитель для одного упражнения: если компонент упражнения падает при рендере
// (битый payload, неожиданный формат и т.п.) — не роняем всё приложение (белый экран),
// а показываем понятную заглушку с кнопкой «Пропустить →» и текстом ошибки для диагностики.
export default class ExerciseErrorBoundary extends Component {
  constructor(props) {
    super(props)
    this.state = { error: null }
  }

  static getDerivedStateFromError(error) {
    return { error }
  }

  componentDidCatch(error, info) {
    // Пишем в консоль — чтобы увидеть стек в браузере пользователя
    console.error('[ExerciseErrorBoundary] упражнение упало:', error, info?.componentStack)
  }

  // Сбрасываем ошибку при переходе к следующему упражнению (resetKey = ex.id)
  componentDidUpdate(prevProps) {
    if (prevProps.resetKey !== this.props.resetKey && this.state.error) {
      this.setState({ error: null })
    }
  }

  render() {
    if (this.state.error) {
      return (
        <div className="exercise-card" style={{ border: '2px solid var(--line)', borderRadius: 16, padding: 24, marginBottom: 16, background: 'var(--surface)', textAlign: 'center' }}>
          <p style={{ fontSize: 44, margin: '0 0 10px' }}>🛠️</p>
          <p style={{ color: 'var(--ink)', fontSize: 16, fontWeight: 600, margin: '0 0 6px' }}>
            Это упражнение не открылось
          </p>
          <p style={{ color: 'var(--ink-soft)', fontSize: 13, margin: '0 0 16px' }}>
            Мы уже знаем о проблеме. Можно пропустить и продолжить.
          </p>
          <button onClick={() => this.props.onSkip?.()}
            style={{ padding: '12px 28px', background: 'var(--ink)', color: 'var(--bg)', border: 'none', borderRadius: 10, cursor: 'pointer', fontSize: 15, fontWeight: 700 }}>
            Пропустить →
          </button>
          <details style={{ marginTop: 16, textAlign: 'left' }}>
            <summary style={{ fontSize: 12, color: 'var(--ink-soft)', cursor: 'pointer' }}>Показать техническую ошибку</summary>
            <pre style={{ fontSize: 11, color: 'var(--red)', whiteSpace: 'pre-wrap', wordBreak: 'break-word', marginTop: 8 }}>
              {String(this.state.error?.message || this.state.error)}
            </pre>
          </details>
        </div>
      )
    }
    return this.props.children
  }
}

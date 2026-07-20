import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import '@fontsource/roboto/400.css'
import '@fontsource/roboto/500.css'
import '@fontsource/roboto/700.css'
import './index.css'
import 'bootstrap-icons/font/bootstrap-icons.css'
import './store/theme.js'  // инициализирует тему из localStorage при загрузке
window.__APP_BUILD = '20260720'
import App from './App.jsx'

// Авто-обновление PWA: SW собран с skipWaiting+clientsClaim (новый SW активируется сразу
// и берёт контроль), но открытая страница остаётся на СТАРЫХ ассетах до перезагрузки —
// из-за этого новые версии «не долетали» без ручного сброса кеша. Здесь перезагружаем
// страницу один раз, когда новый SW перехватил управление. Флаг refreshing защищает от петли.
if ('serviceWorker' in navigator) {
  const hadController = !!navigator.serviceWorker.controller // была ли уже установлена версия
  let refreshing = false
  navigator.serviceWorker.addEventListener('controllerchange', () => {
    // Пропускаем самую первую установку (hadController=false) — там перезагрузка не нужна
    if (refreshing || !hadController) return
    refreshing = true
    window.location.reload()
  })
}

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <App />
  </StrictMode>
)

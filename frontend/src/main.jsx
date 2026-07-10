import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import '@fontsource/roboto/400.css'
import '@fontsource/roboto/500.css'
import '@fontsource/roboto/700.css'
import './index.css'
import 'bootstrap-icons/font/bootstrap-icons.css'
import './store/theme.js'  // инициализирует тему из localStorage при загрузке
window.__APP_BUILD = '20260711-pwa'
import App from './App.jsx'

// Регистрация Service Worker для push-уведомлений и PWA
if ('serviceWorker' in navigator) {
  navigator.serviceWorker.register('/sw.js').catch(() => {})
}

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <App />
  </StrictMode>
)

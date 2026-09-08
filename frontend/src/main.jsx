import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import '@fontsource/roboto/400.css'
import '@fontsource/roboto/500.css'
import '@fontsource/roboto/700.css'
import './index.css'
import './styles/novice.css'
import 'bootstrap-icons/font/bootstrap-icons.css'
import './store/theme.js'  // инициализирует тему из localStorage при загрузке
window.__APP_BUILD = '20260720'
import App from './App.jsx'
import { watchForUpdates } from './pwaUpdate.js'

// Обновление PWA: раньше страница перезагружалась здесь сама, молча, как только новый
// service worker брал управление. Получалось хуже некуда с обеих сторон: пока приложение
// открыто, браузер за обновлением не ходит вовсе — и новая версия «не приезжала»; а когда
// приезжала, экран мог перезагрузиться посреди упражнения. И человек не понимал, что
// вообще произошло.
//
// Теперь проверяем обновление сами (pwaUpdate.js) и предлагаем перезагрузку плашкой —
// решение за человеком.
watchForUpdates()

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <App />
  </StrictMode>
)

// Автофокус в поле ответа уместен не везде.
//
// На компьютере он удобен: карточка открылась — курсор уже в поле, можно печатать, ничего
// на экране не двигается. На телефоне тот же фокус распахивает клавиатуру ещё до того, как
// человек успел прочитать задание: экран прыгает вверх, половина карточки уходит под
// клавиатуру, и кажется, будто приложение само что-то нажало.
//
// Поэтому на сенсорных устройствах клавиатуру вызывает сам ученик — тапом по полю.

/** Сенсорное устройство: нет наведения мышью и «грубый» указатель (палец). */
export function isTouchDevice() {
  if (typeof window === 'undefined' || !window.matchMedia) return false
  return window.matchMedia('(hover: none) and (pointer: coarse)').matches
}

/** Ставить ли фокус в поле ответа при открытии карточки. */
export function shouldAutoFocus() {
  return !isTouchDevice()
}

// ── Как приложение открыто ───────────────────────────────────────────────────
// Нужно и блоку установки, и блоку виджета: виджет существует только внутри нашей
// Android-обёртки, и предлагать его в браузере или на iPhone — обманывать человека.

/** Приложение открыто как установленное (PWA/TWA), а не вкладкой браузера. */
export function isStandalone() {
  if (typeof window === 'undefined') return false
  return window.matchMedia?.('(display-mode: standalone)').matches || window.navigator.standalone === true
}

/** Открыто внутри нашего Android-приложения (TWA): у него реферер android-app://. */
export function isAndroidApp() {
  if (typeof document === 'undefined') return false
  if (document.referrer.startsWith('android-app://')) return true
  return /wv|Android.*Version\/[\d.]+ Chrome/.test(navigator.userAgent || '') && isStandalone()
}

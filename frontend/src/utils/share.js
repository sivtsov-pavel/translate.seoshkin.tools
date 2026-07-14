// Ссылка на карточку слова для отправки другому ученику.
export function cardUrl(id) {
  return `${window.location.origin}/w/${id}`
}

// Поделиться: сперва нативный Web Share API (телефон → шторка Telegram/WhatsApp),
// фолбэк — копирование ссылки в буфер. Возвращает 'shared' | 'copied' | 'cancel' | 'fail'.
export async function shareLink({ title, text, url }) {
  if (navigator.share) {
    try { await navigator.share({ title, text, url }); return 'shared' }
    catch { return 'cancel' } // пользователь закрыл шторку
  }
  try { await navigator.clipboard.writeText(url); return 'copied' }
  catch { return 'fail' }
}

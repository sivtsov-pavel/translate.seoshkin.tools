// Заглушка обложки курса — градиент + иконка книги + первая буква названия.
// Используется и в CourseView (крупно), и в CourseList (на карточке).
export default function CoursePlaceholder({ title, style }) {
  const letter = (title || '?').trim().charAt(0).toUpperCase()
  return (
    <div style={{
      display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
      background: 'linear-gradient(160deg, var(--accent-soft), var(--surface-2))',
      color: 'var(--accent)', width: '100%', height: '100%',
      ...style,
    }}>
      <div style={{ fontSize: 32, marginBottom: 4 }}>📕</div>
      <div style={{ fontSize: 28, fontWeight: 700, opacity: 0.7 }}>{letter}</div>
    </div>
  )
}

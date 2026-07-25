// Общая шапка карточки упражнения: тип упражнения + название урока.
// Рендерится под картинкой/аватаром, над остальным контентом карточки.
export default function ExerciseCardHeader({ typeLabel, lessonTitle }) {
  if (!typeLabel && !lessonTitle) return null
  return (
    <div style={{ width: '100%', marginBottom: 10 }}>
      {typeLabel && (
        <div style={{ fontSize: 11, color: 'var(--ink-soft)', textTransform: 'uppercase', letterSpacing: '0.06em', fontWeight: 700, marginBottom: 3 }}>
          {typeLabel}
        </div>
      )}
      {lessonTitle && (
        <div style={{ fontSize: 12, color: 'var(--accent)', fontWeight: 500 }}>
          📚 {lessonTitle}
        </div>
      )}
    </div>
  )
}

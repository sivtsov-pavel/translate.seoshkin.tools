import { useRef, useState } from 'react'

export default function UploadZone({ onFilesSelected, accept = 'image/*', multiple = true, label }) {
  const inputRef = useRef()
  const [dragging, setDragging] = useState(false)

  const handleDrop = (e) => {
    e.preventDefault()
    setDragging(false)
    onFilesSelected(Array.from(e.dataTransfer.files))
  }

  return (
    <div
      onDrop={handleDrop}
      onDragOver={e => { e.preventDefault(); setDragging(true) }}
      onDragLeave={() => setDragging(false)}
      onClick={() => inputRef.current.click()}
      style={{
        border: `2px dashed ${dragging ? 'var(--accent)' : 'var(--line)'}`,
        borderRadius: 14, padding: 36, textAlign: 'center', cursor: 'pointer',
        background: dragging ? 'var(--accent-soft)' : 'var(--surface-2)', marginBottom: 12,
        transition: 'all 0.2s ease',
      }}>
      <p style={{ margin: 0, color: 'var(--ink-soft)', userSelect: 'none' }}>{label}</p>
      <input ref={inputRef} type="file" accept={accept} multiple={multiple} style={{ display: 'none' }}
        onChange={e => onFilesSelected(Array.from(e.target.files))} />
    </div>
  )
}

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
        border: `2px dashed ${dragging ? '#4f46e5' : '#d1d5db'}`,
        borderRadius: 12, padding: 36, textAlign: 'center', cursor: 'pointer',
        backgroundColor: dragging ? '#eef2ff' : '#fafafa', marginBottom: 12,
        transition: 'all 0.2s ease',
      }}>
      <p style={{ margin: 0, color: '#6b7280', userSelect: 'none' }}>{label}</p>
      <input
        ref={inputRef}
        type="file"
        accept={accept}
        multiple={multiple}
        style={{ display: 'none' }}
        onChange={e => onFilesSelected(Array.from(e.target.files))}
      />
    </div>
  )
}

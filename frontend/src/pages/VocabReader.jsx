import Vocabulary from './Vocabulary.jsx'
import TextReader from './TextReader.jsx'

// На десктопе (≥1024px) — сплит Словарь|Читалка, на мобиле — только Словарь
export default function VocabReader() {
  return (
    <div className="vocab-reader-split">
      <div className="vocab-reader-left">
        <Vocabulary />
      </div>
      <div className="vocab-reader-right">
        <TextReader />
      </div>
    </div>
  )
}

import { useState, useCallback, useRef, useEffect } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { api, uploadFiles } from '../api/client.js'
import { useOnline, OfflineNotice } from '../components/OfflineGuard.jsx'
import { useI18nStore } from '../store/i18n.js'

// Локальные строки новых полей (10 языков) — чтобы не трогать общий i18n
const NSTR = {
  ru: { word: 'Урок', descLabel: 'Описание (необязательно)', descHint: 'Кратко: о чём урок, что тренируем…', book: '📘 Учебник', bookHint: 'Фото страниц учебника', tetrad: '✏️ Тетрадь / доска', tetradHint: 'Свои слова с доски или тетради', selected: (n) => `Выбрано: ${n}`,
    pv: { title: '👀 Проверь, что распознал ИИ', hint: 'Сними галочку с лишнего, дострой то, что пропустил ИИ. Урок создастся только из отмеченного.', words: '📖 Слова', sentences: '💬 Предложения', noWords: 'Слов не распознано.', noSentences: 'Предложений не распознано.', wordPh: 'слово', trPh: 'перевод', addWord: '+ добавить слово', sentPh: 'предложение', addSent: '+ добавить', cancel: 'Отмена', confirm: 'Подтвердить разбор →', fromBook: 'Учебник', fromExtra: 'Тетрадь/доска', cancelConfirm: 'Отменить создание урока? Загруженные фото и распознанное будут удалены.' } },
  uk: { word: 'Урок', descLabel: 'Опис (необов\'язково)', descHint: 'Коротко: про що урок, що тренуємо…', book: '📘 Підручник', bookHint: 'Фото сторінок підручника', tetrad: '✏️ Зошит / дошка', tetradHint: 'Свої слова з дошки або зошита', selected: (n) => `Обрано: ${n}`,
    pv: { title: '👀 Перевір, що розпізнав ШІ', hint: 'Зніми галочку із зайвого, допиши те, що пропустив ШІ. Урок створиться лише з відміченого.', words: '📖 Слова', sentences: '💬 Речення', noWords: 'Слів не розпізнано.', noSentences: 'Речень не розпізнано.', wordPh: 'слово', trPh: 'переклад', addWord: '+ додати слово', sentPh: 'речення', addSent: '+ додати', cancel: 'Скасувати', confirm: 'Підтвердити розбір →', fromBook: 'Підручник', fromExtra: 'Зошит/дошка', cancelConfirm: 'Скасувати створення уроку? Завантажені фото і розпізнане будуть видалені.' } },
  en: { word: 'Lesson', descLabel: 'Description (optional)', descHint: 'Briefly: what the lesson is about…', book: '📘 Textbook', bookHint: 'Photos of textbook pages', tetrad: '✏️ Notebook / board', tetradHint: 'Your own words from the board or notebook', selected: (n) => `Selected: ${n}`,
    pv: { title: '👀 Review what the AI recognized', hint: 'Uncheck anything wrong, add what the AI missed. The lesson will be created only from checked items.', words: '📖 Words', sentences: '💬 Sentences', noWords: 'No words recognized.', noSentences: 'No sentences recognized.', wordPh: 'word', trPh: 'translation', addWord: '+ add word', sentPh: 'sentence', addSent: '+ add', cancel: 'Cancel', confirm: 'Confirm →', fromBook: 'Textbook', fromExtra: 'Notebook/board', cancelConfirm: 'Cancel lesson creation? Uploaded photos and recognized data will be deleted.' } },
  de: { word: 'Lektion', descLabel: 'Beschreibung (optional)', descHint: 'Kurz: worum es geht…', book: '📘 Lehrbuch', bookHint: 'Fotos der Lehrbuchseiten', tetrad: '✏️ Heft / Tafel', tetradHint: 'Eigene Wörter von Tafel oder Heft', selected: (n) => `Ausgewählt: ${n}`,
    pv: { title: '👀 Überprüfe, was die KI erkannt hat', hint: 'Hake Falsches ab, ergänze, was die KI übersehen hat. Die Lektion wird nur aus dem Markierten erstellt.', words: '📖 Wörter', sentences: '💬 Sätze', noWords: 'Keine Wörter erkannt.', noSentences: 'Keine Sätze erkannt.', wordPh: 'Wort', trPh: 'Übersetzung', addWord: '+ Wort hinzufügen', sentPh: 'Satz', addSent: '+ hinzufügen', cancel: 'Abbrechen', confirm: 'Bestätigen →', fromBook: 'Lehrbuch', fromExtra: 'Heft/Tafel', cancelConfirm: 'Lektionserstellung abbrechen? Hochgeladene Fotos und Erkanntes werden gelöscht.' } },
  bg: { word: 'Урок', descLabel: 'Описание (по избор)', descHint: 'Накратко: за какво е урокът…', book: '📘 Учебник', bookHint: 'Снимки на страници', tetrad: '✏️ Тетрадка / дъска', tetradHint: 'Свои думи от дъската или тетрадката', selected: (n) => `Избрани: ${n}`,
    pv: { title: '👀 Провери какво разпозна ИИ', hint: 'Махни отметката от грешното, добави каквото ИИ е пропуснал. Урокът ще се създаде само от отметнатото.', words: '📖 Думи', sentences: '💬 Изречения', noWords: 'Не са разпознати думи.', noSentences: 'Не са разпознати изречения.', wordPh: 'дума', trPh: 'превод', addWord: '+ добави дума', sentPh: 'изречение', addSent: '+ добави', cancel: 'Отказ', confirm: 'Потвърди →', fromBook: 'Учебник', fromExtra: 'Тетрадка/дъска', cancelConfirm: 'Да се отмени ли създаването на урока? Качените снимки и разпознатото ще бъдат изтрити.' } },
  tr: { word: 'Ders', descLabel: 'Açıklama (isteğe bağlı)', descHint: 'Kısaca: ders ne hakkında…', book: '📘 Ders kitabı', bookHint: 'Ders kitabı sayfaları', tetrad: '✏️ Defter / tahta', tetradHint: 'Tahtadan veya defterden kendi kelimeleriniz', selected: (n) => `Seçildi: ${n}`,
    pv: { title: '👀 Yapay zekânın tanıdığını kontrol et', hint: 'Yanlış olanın işaretini kaldır, yapay zekânın atladığını ekle. Ders yalnızca işaretlenenlerden oluşturulacak.', words: '📖 Kelimeler', sentences: '💬 Cümleler', noWords: 'Kelime tanınmadı.', noSentences: 'Cümle tanınmadı.', wordPh: 'kelime', trPh: 'çeviri', addWord: '+ kelime ekle', sentPh: 'cümle', addSent: '+ ekle', cancel: 'İptal', confirm: 'Onayla →', fromBook: 'Ders kitabı', fromExtra: 'Defter/tahta', cancelConfirm: 'Ders oluşturma iptal edilsin mi? Yüklenen fotoğraflar ve tanınan veriler silinecek.' } },
  ar: { word: 'درس', descLabel: 'وصف (اختياري)', descHint: 'باختصار: عن ماذا الدرس…', book: '📘 الكتاب', bookHint: 'صور صفحات الكتاب', tetrad: '✏️ الدفتر / السبورة', tetradHint: 'كلماتك من السبورة أو الدفتر', selected: (n) => `المحدد: ${n}`,
    pv: { title: '👀 راجع ما تعرف عليه الذكاء الاصطناعي', hint: 'ألغِ تحديد الخاطئ، وأضف ما فاته الذكاء الاصطناعي. سيُنشأ الدرس فقط مما هو محدد.', words: '📖 الكلمات', sentences: '💬 الجمل', noWords: 'لم يتم التعرف على كلمات.', noSentences: 'لم يتم التعرف على جمل.', wordPh: 'كلمة', trPh: 'ترجمة', addWord: '+ إضافة كلمة', sentPh: 'جملة', addSent: '+ إضافة', cancel: 'إلغاء', confirm: 'تأكيد ←', fromBook: 'الكتاب', fromExtra: 'الدفتر/السبورة', cancelConfirm: 'هل تريد إلغاء إنشاء الدرس؟ سيتم حذف الصور المرفوعة والبيانات المتعرف عليها.' } },
  es: { word: 'Lección', descLabel: 'Descripción (opcional)', descHint: 'Breve: de qué trata la lección…', book: '📘 Libro', bookHint: 'Fotos de las páginas del libro', tetrad: '✏️ Cuaderno / pizarra', tetradHint: 'Tus palabras de la pizarra o el cuaderno', selected: (n) => `Seleccionadas: ${n}`,
    pv: { title: '👀 Revisa lo que reconoció la IA', hint: 'Desmarca lo incorrecto, añade lo que la IA se saltó. La lección se creará solo con lo marcado.', words: '📖 Palabras', sentences: '💬 Frases', noWords: 'No se reconocieron palabras.', noSentences: 'No se reconocieron frases.', wordPh: 'palabra', trPh: 'traducción', addWord: '+ añadir palabra', sentPh: 'frase', addSent: '+ añadir', cancel: 'Cancelar', confirm: 'Confirmar →', fromBook: 'Libro', fromExtra: 'Cuaderno/pizarra', cancelConfirm: '¿Cancelar la creación de la lección? Las fotos subidas y lo reconocido se eliminarán.' } },
  fr: { word: 'Leçon', descLabel: 'Description (facultatif)', descHint: 'Brièvement : de quoi parle la leçon…', book: '📘 Manuel', bookHint: 'Photos des pages du manuel', tetrad: '✏️ Cahier / tableau', tetradHint: 'Tes propres mots du tableau ou du cahier', selected: (n) => `Sélectionnées : ${n}`,
    pv: { title: '👀 Vérifie ce que l\'IA a reconnu', hint: 'Décoche ce qui est faux, ajoute ce que l\'IA a manqué. La leçon sera créée uniquement avec ce qui est coché.', words: '📖 Mots', sentences: '💬 Phrases', noWords: 'Aucun mot reconnu.', noSentences: 'Aucune phrase reconnue.', wordPh: 'mot', trPh: 'traduction', addWord: '+ ajouter un mot', sentPh: 'phrase', addSent: '+ ajouter', cancel: 'Annuler', confirm: 'Confirmer →', fromBook: 'Manuel', fromExtra: 'Cahier/tableau', cancelConfirm: 'Annuler la création de la leçon ? Les photos téléchargées et les données reconnues seront supprimées.' } },
  sq: { word: 'Mësimi', descLabel: 'Përshkrimi (opsional)', descHint: 'Shkurt: për çfarë është mësimi…', book: '📘 Libri', bookHint: 'Foto të faqeve të librit', tetrad: '✏️ Fletore / dërrasë', tetradHint: 'Fjalët e tua nga dërrasa ose fletorja', selected: (n) => `Zgjedhur: ${n}`,
    pv: { title: '👀 Kontrollo çfarë njohu AI-ja', hint: 'Hiq shenjën nga ajo që s\'është e saktë, shto çfarë AI-ja anashkaloi. Mësimi do të krijohet vetëm nga të shënuarat.', words: '📖 Fjalët', sentences: '💬 Fjalitë', noWords: 'Nuk u njohën fjalë.', noSentences: 'Nuk u njohën fjali.', wordPh: 'fjalë', trPh: 'përkthim', addWord: '+ shto fjalë', sentPh: 'fjali', addSent: '+ shto', cancel: 'Anulo', confirm: 'Konfirmo →', fromBook: 'Libri', fromExtra: 'Fletore/dërrasë', cancelConfirm: 'Të anulohet krijimi i mësimit? Fotot e ngarkuara dhe të dhënat e njohura do të fshihen.' } },
}

// Раздел требует сервер/ИИ: guard-обёртка отдельным компонентом, чтобы ранний
// return не менял список хуков основного компонента (Rules of Hooks)
export default function NewLesson() {
  const online = useOnline()
  if (!online) return <OfflineNotice />
  return <NewLessonInner />
}

function NewLessonInner() {
  const [title, setTitle]   = useState('')
  const [description, setDescription] = useState('')
  const [photos, setPhotos] = useState([])       // фото учебника (textbook)
  const [extraPhotos, setExtraPhotos] = useState([]) // фото тетради/доски (extra)
  const [audios, setAudios] = useState([])
  const [status, setStatus] = useState('idle')
  const [progress, setProgress] = useState('')
  const [error, setError]   = useState('')
  const [nextNumber, setNextNumber] = useState(null) // автономер следующего урока
  const [lessonId, setLessonId] = useState(null)     // урок уже создан, ждёт превью/подтверждения
  const [preview, setPreview] = useState(null)        // { words:[{...,checked}], sentences:[{...,checked}], grammar_points }
  const [newWordDe, setNewWordDe] = useState('')
  const [newWordTr, setNewWordTr] = useState('')
  const [newSentence, setNewSentence] = useState('')
  const navigate  = useNavigate()
  const [searchParams] = useSearchParams()
  const courseId  = searchParams.get('course_id')
  const { t, lang } = useI18nStore()
  const N = NSTR[lang] || NSTR.en
  const pollRef   = useRef(null)

  // Курсы для привязки: чтобы урок из раздела «Уроки» не оставался «одиночкой» вне курса
  // (такие уроки лезут в «Сегодня» и путают нумерацию). По умолчанию — курс из ссылки (если пришли из курса).
  const [courses, setCourses] = useState([])
  const [selectedCourse, setSelectedCourse] = useState(courseId || '')
  useEffect(() => {
    api.get('/courses').then(cs => setCourses(Array.isArray(cs) ? cs : [])).catch(() => {})
  }, [])

  // Автономер урока: считаем следующий по порядку (в выбранном курсе или в общем пуле)
  useEffect(() => {
    api.get('/lessons').then(all => {
      const list = (all || []).filter(l => selectedCourse ? String(l.course_id) === String(selectedCourse) : !l.course_id)
      const maxNum = list.reduce((m, l) => Math.max(m, l.lesson_number || 0), 0)
      setNextNumber(maxNum + 1)
    }).catch(() => setNextNumber(null))
  }, [selectedCourse])

  const addPhotos = useCallback((files) => {
    const newItems = files.filter(f => f.type.startsWith('image/')).map(file => ({ file, preview: URL.createObjectURL(file) }))
    setPhotos(prev => [...prev, ...newItems])
  }, [])

  const removePhoto = (idx) => {
    setPhotos(prev => {
      URL.revokeObjectURL(prev[idx].preview)
      return prev.filter((_, i) => i !== idx)
    })
  }

  const addExtraPhotos = useCallback((files) => {
    const newItems = files.filter(f => f.type.startsWith('image/')).map(file => ({ file, preview: URL.createObjectURL(file) }))
    setExtraPhotos(prev => [...prev, ...newItems])
  }, [])

  const removeExtraPhoto = (idx) => {
    setExtraPhotos(prev => {
      URL.revokeObjectURL(prev[idx].preview)
      return prev.filter((_, i) => i !== idx)
    })
  }

  const addAudio = useCallback((files) => {
    setAudios(files.slice(0, 1).map(file => ({ file })))
  }, [])

  const handleDrop = (e, type) => {
    e.preventDefault()
    const files = Array.from(e.dataTransfer.files)
    if (type === 'photo') addPhotos(files)
    else if (type === 'extra') addExtraPhotos(files)
    else addAudio(files)
  }

  const startPolling = (lessonId) => {
    pollRef.current = setInterval(async () => {
      try {
        const res = await api.get(`/lessons/${lessonId}/status`)
        if (res.progress) setProgress(res.progress)
        if (res.status === 'done') {
          clearInterval(pollRef.current)
          setStatus('done')
          photos.forEach(p => URL.revokeObjectURL(p.preview))
          extraPhotos.forEach(p => URL.revokeObjectURL(p.preview))
          setTimeout(() => navigate(selectedCourse ? `/courses/${selectedCourse}` : '/'), 2500)
        } else if (res.status === 'error') {
          clearInterval(pollRef.current)
          setError(res.progress || 'Ошибка обработки')
          setStatus('error')
        }
      } catch {}
    }, 3000)
  }

  const handleSubmit = async (e) => {
    e.preventDefault()
    setError('')
    try {
      setStatus('creating')
      setProgress('')
      // Автозаголовок: «Урок N» по порядку, если тема не задана
      const autoTitle = nextNumber ? `${N.word} ${nextNumber}` : `${t.lessons.newLesson} ${new Date().toLocaleDateString()}`
      const lesson = await api.post('/lessons', {
        title: title.trim() || autoTitle,
        description: description.trim() || null,
        date: new Date().toISOString().slice(0, 10),
        course_id: selectedCourse ? parseInt(selectedCourse) : null,
        lesson_number: nextNumber || null,
      })
      setLessonId(lesson.id)
      setStatus('uploading')
      const totalFiles = photos.length + extraPhotos.length + audios.length
      setProgress(`0 / ${totalFiles} файлов`)
      if (photos.length > 0) {
        const fd = new FormData()
        photos.forEach(p => fd.append('files', p.file))
        await uploadFiles(`/lessons/${lesson.id}/media`, fd)  // источник: учебник (по умолчанию)
      }
      if (extraPhotos.length > 0) {
        const fd = new FormData()
        extraPhotos.forEach(p => fd.append('files', p.file))
        await uploadFiles(`/lessons/${lesson.id}/media?source=extra`, fd)  // источник: тетрадь/доска
      }
      if (audios.length > 0) {
        const fd = new FormData()
        audios.forEach(a => fd.append('files', a.file))
        await uploadFiles(`/lessons/${lesson.id}/media`, fd)
      }

      if (photos.length > 0 || extraPhotos.length > 0) {
        // Есть фото — показываем превью распознанного, коммит только после подтверждения учителя
        setStatus('extracting')
        setProgress('Распознаю фото...')
        const data = await api.post(`/lessons/${lesson.id}/extract-preview`, {})
        setPreview({
          words: (data.words || []).map(w => ({ ...w, checked: true })),
          sentences: (data.sentences || []).map(s => ({ ...s, checked: true })),
          grammar_points: data.grammar_points || [],
        })
        setStatus('preview')
      } else {
        // Только аудио/без медиа — как раньше, разбор без превью (текст+транскрипция)
        setStatus('processing')
        setProgress('Запускаем...')
        await api.post(`/lessons/${lesson.id}/process`, {})
        startPolling(lesson.id)
      }
    } catch (err) {
      setError(err.message)
      setStatus('error')
      if (pollRef.current) clearInterval(pollRef.current)
    }
  }

  const confirmPreview = async () => {
    setError('')
    try {
      setStatus('processing')
      setProgress('Сохраняю урок...')
      const words = preview.words.filter(w => w.checked).map(({ checked, ...w }) => w)
      const sentences = preview.sentences.filter(s => s.checked).map(({ checked, ...s }) => s)
      await api.post(`/lessons/${lessonId}/confirm`, { words, sentences, grammar_points: preview.grammar_points })
      setPreview(null)
      startPolling(lessonId)
    } catch (err) {
      setError(err.message)
      setStatus('error')
    }
  }

  const cancelPreview = async () => {
    if (!window.confirm(N.pv.cancelConfirm)) return
    try { await api.delete(`/lessons/${lessonId}`) } catch { /* уже мог быть удалён */ }
    photos.forEach(p => URL.revokeObjectURL(p.preview))
    extraPhotos.forEach(p => URL.revokeObjectURL(p.preview))
    setPreview(null)
    setLessonId(null)
    setPhotos([])
    setExtraPhotos([])
    setAudios([])
    setStatus('idle')
    setProgress('')
  }

  const toggleWord = (idx) => setPreview(p => ({ ...p, words: p.words.map((w, i) => i === idx ? { ...w, checked: !w.checked } : w) }))
  const toggleSentence = (idx) => setPreview(p => ({ ...p, sentences: p.sentences.map((s, i) => i === idx ? { ...s, checked: !s.checked } : s) }))

  const addManualWord = () => {
    const de = newWordDe.trim()
    if (!de) return
    setPreview(p => ({ ...p, words: [...p.words, { word_de: de, translation_ru: newWordTr.trim(), example_sentence: null, source: 'textbook', media_id: null, checked: true }] }))
    setNewWordDe(''); setNewWordTr('')
  }

  const addManualSentence = () => {
    const text = newSentence.trim()
    if (!text) return
    setPreview(p => ({ ...p, sentences: [...p.sentences, { text, translation_ru: null, source: 'textbook', checked: true }] }))
    setNewSentence('')
  }

  const isProcessing = status !== 'idle' && status !== 'error' && status !== 'preview'

  const statusLabel = {
    creating:   '⏳ Создаём урок...',
    uploading:  '⏳ Загружаем файлы...',
    extracting: '⏳ Распознаём фото...',
    processing: `⏳ Обрабатываем...`,
    done:       '✅ Готово!',
  }[status] || ''

  if (status === 'preview' && preview) {
    return (
      <PreviewScreen
        preview={preview}
        error={error}
        N={N.pv}
        onToggleWord={toggleWord}
        onToggleSentence={toggleSentence}
        newWordDe={newWordDe} setNewWordDe={setNewWordDe}
        newWordTr={newWordTr} setNewWordTr={setNewWordTr}
        onAddWord={addManualWord}
        newSentence={newSentence} setNewSentence={setNewSentence}
        onAddSentence={addManualSentence}
        onConfirm={confirmPreview}
        onCancel={cancelPreview}
      />
    )
  }

  return (
    <div>
      <h1 style={{ marginBottom: 24 }}>{t.lessons.newLesson}</h1>
      <form onSubmit={handleSubmit}>

        <div style={{ marginBottom: 16 }}>
          <label style={{ display: 'block', fontWeight: 600, marginBottom: 6 }}>{t.lessons.lessonTopic}</label>
          <input value={title} onChange={e => setTitle(e.target.value)}
            placeholder={nextNumber ? `${N.word} ${nextNumber}` : t.lessons.topicPlaceholder} disabled={isProcessing}
            style={{ width: '100%', boxSizing: 'border-box' }} />
        </div>

        {/* Привязка к курсу — чтобы урок не остался «одиночкой» вне курса (иначе лезет в «Сегодня») */}
        <div style={{ marginBottom: 16 }}>
          <label style={{ display: 'block', fontWeight: 600, marginBottom: 6 }}>📚 Курс</label>
          <select value={selectedCourse} onChange={e => setSelectedCourse(e.target.value)} disabled={isProcessing}
            style={{ width: '100%', boxSizing: 'border-box', padding: '9px 10px', borderRadius: 8, border: `1px solid ${selectedCourse ? 'var(--line)' : 'var(--accent)'}`, background: 'var(--surface)', color: 'var(--ink)' }}>
            <option value="">— Без курса (отдельный урок) —</option>
            {courses.map(c => <option key={c.id} value={c.id}>{c.title}</option>)}
          </select>
          {!selectedCourse && (
            <div style={{ fontSize: 12.5, color: 'var(--accent)', marginTop: 6 }}>
              💡 Совет: привяжи урок к курсу — тогда он идёт по порядку и не «висит» отдельно в «Сегодня». Без курса — только для разовых уроков/наборов.
            </div>
          )}
        </div>

        <div style={{ marginBottom: 24 }}>
          <label style={{ display: 'block', fontWeight: 600, marginBottom: 6 }}>{N.descLabel}</label>
          <textarea value={description} onChange={e => setDescription(e.target.value)} placeholder={N.descHint} disabled={isProcessing}
            rows={2} style={{ width: '100%', boxSizing: 'border-box', resize: 'vertical', fontFamily: 'inherit' }} />
        </div>

        {/* 📘 Учебник (source=textbook) */}
        <div style={{ marginBottom: 8 }}>
          <label style={{ display: 'block', fontWeight: 600, marginBottom: 8 }}>{N.book}</label>
          <DropZone onFiles={addPhotos} onDrop={e => handleDrop(e, "photo")} accept="image/*,application/pdf" idKey="book" label={N.bookHint} disabled={isProcessing} />
        </div>
        <PhotoGrid items={photos} onRemove={removePhoto} disabled={isProcessing} label={N.selected(photos.length)} />

        {/* ✏️ Тетрадь / доска (source=extra) */}
        <div style={{ marginBottom: 8 }}>
          <label style={{ display: 'block', fontWeight: 600, marginBottom: 8 }}>{N.tetrad}</label>
          <DropZone onFiles={addExtraPhotos} onDrop={e => handleDrop(e, "extra")} accept="image/*,application/pdf" idKey="tetrad" label={N.tetradHint} disabled={isProcessing} />
        </div>
        <PhotoGrid items={extraPhotos} onRemove={removeExtraPhoto} disabled={isProcessing} label={N.selected(extraPhotos.length)} />

        <div style={{ marginBottom: 8 }}>
          <label style={{ display: 'block', fontWeight: 600, marginBottom: 8 }}>{t.lessons.audio}</label>
          <DropZone onFiles={addAudio} onDrop={e => handleDrop(e, 'audio')} accept="audio/*" idKey="audio" multiple={false} label={t.lessons.audioHint} disabled={isProcessing} />
        </div>

        {audios.length > 0 && (
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 20, padding: '10px 14px', background: 'rgba(78,154,110,0.1)', borderRadius: 8, border: '1px solid rgba(78,154,110,0.3)' }}>
            <span style={{ fontSize: 24 }}>🎵</span>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontWeight: 600, fontSize: 14, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{audios[0].file.name}</div>
              <div style={{ fontSize: 12, color: 'var(--ink-soft)' }}>{(audios[0].file.size / 1024 / 1024).toFixed(1)} MB</div>
            </div>
            {!isProcessing && (
              <button type="button" onClick={() => setAudios([])} style={{ background: 'none', border: 'none', color: 'var(--ink-soft)', cursor: 'pointer', fontSize: 20, padding: 4 }}>×</button>
            )}
          </div>
        )}

        {status !== 'idle' && status !== 'error' && (
          <div style={{ marginBottom: 16, padding: '14px 18px', background: 'var(--surface-2)', borderRadius: 10, border: `1px solid ${status === 'done' ? 'var(--good)' : 'var(--accent)'}40` }}>
            <div style={{ fontWeight: 600, color: status === 'done' ? 'var(--good)' : 'var(--accent)', marginBottom: progress ? 6 : 0 }}>
              {statusLabel}
            </div>
            {progress && status === 'processing' && (
              <div style={{ fontSize: 14, color: 'var(--ink-soft)' }}>{progress}</div>
            )}
            {status === 'processing' && (
              <div style={{ marginTop: 10, height: 4, background: 'var(--line)', borderRadius: 2, overflow: 'hidden' }}>
                <div style={{ height: '100%', background: 'var(--accent)', borderRadius: 2, animation: 'pulse-bar 2s ease-in-out infinite', width: '40%' }} />
              </div>
            )}
          </div>
        )}

        {error && (
          <div style={{ marginBottom: 16, padding: '12px 16px', background: 'rgba(179,56,44,0.1)', borderRadius: 8, border: '1px solid rgba(179,56,44,0.3)', color: 'var(--red)' }}>
            {error}
          </div>
        )}

        <button type="submit" disabled={(photos.length === 0 && extraPhotos.length === 0) || isProcessing}
          style={{ width: '100%', padding: '14px 32px', fontSize: 16, fontWeight: 700,
            background: (photos.length === 0 && extraPhotos.length === 0) || isProcessing ? 'var(--surface-2)' : 'var(--accent)',
            color: (photos.length === 0 && extraPhotos.length === 0) || isProcessing ? 'var(--ink-soft)' : 'var(--accent-ink)',
            border: 'none', borderRadius: 12, cursor: (photos.length === 0 && extraPhotos.length === 0) || isProcessing ? 'not-allowed' : 'pointer' }}>
          {isProcessing ? statusLabel : t.lessons.processBtn}
        </button>
      </form>

      <style>{`@keyframes pulse-bar { 0% { transform: translateX(-100%); } 100% { transform: translateX(350%); } }`}</style>
    </div>
  )
}

// Превью распознанного ПЕРЕД созданием урока (#5): учитель видит, что нашёл ИИ на фото,
// снимает галочки с ненужного и дописывает вручную то, что не распозналось — и только
// тогда данные попадают в урок (упражнения генерятся после подтверждения).
function PreviewScreen({ preview, error, N, onToggleWord, onToggleSentence, newWordDe, setNewWordDe, newWordTr, setNewWordTr, onAddWord, newSentence, setNewSentence, onAddSentence, onConfirm, onCancel }) {
  const wordsChecked = preview.words.filter(w => w.checked).length
  const sentChecked = preview.sentences.filter(s => s.checked).length
  const srcTag = s => s === 'extra' ? '✏️' : '📘'
  return (
    <div>
      <h1 style={{ marginBottom: 6 }}>{N.title}</h1>
      <p style={{ color: 'var(--ink-soft)', fontSize: 14, marginBottom: 20 }}>{N.hint}</p>

      {error && (
        <div style={{ marginBottom: 16, padding: '12px 16px', background: 'rgba(179,56,44,0.1)', borderRadius: 8, border: '1px solid rgba(179,56,44,0.3)', color: 'var(--red)' }}>
          {error}
        </div>
      )}

      <div style={{ marginBottom: 24 }}>
        <div style={{ fontWeight: 700, marginBottom: 10 }}>{N.words} ({wordsChecked} / {preview.words.length})</div>
        <div style={{ border: '1px solid var(--line)', borderRadius: 12, background: 'var(--surface)', maxHeight: 360, overflowY: 'auto' }}>
          {preview.words.map((w, idx) => (
            <label key={idx} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '9px 14px', borderBottom: idx < preview.words.length - 1 ? '1px solid var(--line)' : 'none', opacity: w.checked ? 1 : 0.45, cursor: 'pointer' }}>
              <input type="checkbox" checked={w.checked} onChange={() => onToggleWord(idx)} style={{ width: 17, height: 17, flexShrink: 0 }} />
              <span style={{ fontSize: 13, flexShrink: 0 }} title={w.source === 'extra' ? N.fromExtra : N.fromBook}>{srcTag(w.source)}</span>
              <span style={{ fontWeight: 600 }}>{w.word_de}</span>
              <span style={{ color: 'var(--ink-soft)' }}>— {w.translation_ru || '…'}</span>
            </label>
          ))}
          {!preview.words.length && <div style={{ padding: 14, color: 'var(--ink-soft)', fontSize: 14 }}>{N.noWords}</div>}
        </div>
        <div style={{ display: 'flex', gap: 8, marginTop: 10, flexWrap: 'wrap' }}>
          <input value={newWordDe} onChange={e => setNewWordDe(e.target.value)} placeholder={N.wordPh} style={{ flex: '1 1 140px' }} />
          <input value={newWordTr} onChange={e => setNewWordTr(e.target.value)} placeholder={N.trPh} style={{ flex: '1 1 140px' }} />
          <button type="button" onClick={onAddWord} disabled={!newWordDe.trim()}
            style={{ padding: '8px 16px', borderRadius: 9, border: '1px solid var(--accent)', background: 'var(--accent-soft)', color: 'var(--accent)', fontWeight: 700, fontSize: 13, cursor: newWordDe.trim() ? 'pointer' : 'not-allowed' }}>
            {N.addWord}
          </button>
        </div>
      </div>

      <div style={{ marginBottom: 28 }}>
        <div style={{ fontWeight: 700, marginBottom: 10 }}>{N.sentences} ({sentChecked} / {preview.sentences.length})</div>
        <div style={{ border: '1px solid var(--line)', borderRadius: 12, background: 'var(--surface)', maxHeight: 260, overflowY: 'auto' }}>
          {preview.sentences.map((s, idx) => (
            <label key={idx} style={{ display: 'flex', alignItems: 'flex-start', gap: 10, padding: '9px 14px', borderBottom: idx < preview.sentences.length - 1 ? '1px solid var(--line)' : 'none', opacity: s.checked ? 1 : 0.45, cursor: 'pointer' }}>
              <input type="checkbox" checked={s.checked} onChange={() => onToggleSentence(idx)} style={{ width: 17, height: 17, flexShrink: 0, marginTop: 2 }} />
              <span style={{ fontSize: 13, flexShrink: 0 }} title={s.source === 'extra' ? N.fromExtra : N.fromBook}>{srcTag(s.source)}</span>
              <span>
                <div>{s.text}</div>
                {s.translation_ru && <div style={{ color: 'var(--ink-soft)', fontSize: 13 }}>{s.translation_ru}</div>}
              </span>
            </label>
          ))}
          {!preview.sentences.length && <div style={{ padding: 14, color: 'var(--ink-soft)', fontSize: 14 }}>{N.noSentences}</div>}
        </div>
        <div style={{ display: 'flex', gap: 8, marginTop: 10 }}>
          <input value={newSentence} onChange={e => setNewSentence(e.target.value)} placeholder={N.sentPh} style={{ flex: 1 }} />
          <button type="button" onClick={onAddSentence} disabled={!newSentence.trim()}
            style={{ padding: '8px 16px', borderRadius: 9, border: '1px solid var(--accent)', background: 'var(--accent-soft)', color: 'var(--accent)', fontWeight: 700, fontSize: 13, cursor: newSentence.trim() ? 'pointer' : 'not-allowed' }}>
            {N.addSent}
          </button>
        </div>
      </div>

      <div style={{ display: 'flex', gap: 10 }}>
        <button type="button" onClick={onCancel}
          style={{ padding: '13px 20px', borderRadius: 12, border: '1px solid var(--line)', background: 'var(--surface)', color: 'var(--ink)', fontWeight: 700, fontSize: 15, cursor: 'pointer' }}>
          {N.cancel}
        </button>
        <button type="button" onClick={onConfirm} disabled={wordsChecked === 0}
          style={{ flex: 1, padding: '13px 20px', borderRadius: 12, border: 'none', fontWeight: 700, fontSize: 16, cursor: wordsChecked === 0 ? 'not-allowed' : 'pointer',
            background: wordsChecked === 0 ? 'var(--surface-2)' : 'var(--accent)', color: wordsChecked === 0 ? 'var(--ink-soft)' : 'var(--accent-ink)' }}>
          {N.confirm}
        </button>
      </div>
    </div>
  )
}

// Сетка превью загруженных фото с кнопкой удаления
function PhotoGrid({ items, onRemove, disabled, label }) {
  if (!items.length) return null
  return (
    <div style={{ marginBottom: 20 }}>
      <div style={{ fontSize: 13, color: 'var(--ink-soft)', marginBottom: 8 }}>{label}</div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(100px, 1fr))', gap: 8 }}>
        {items.map((item, idx) => (
          <div key={idx} style={{ position: 'relative', borderRadius: 8, overflow: 'hidden', aspectRatio: '1', background: 'var(--surface-2)' }}>
            <img src={item.preview} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }} />
            {!disabled && (
              <button type="button" onClick={() => onRemove(idx)} style={{ position: 'absolute', top: 4, right: 4, width: 22, height: 22, borderRadius: '50%', background: 'rgba(0,0,0,0.6)', color: '#fff', border: 'none', cursor: 'pointer', fontSize: 14, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 0 }}>×</button>
            )}
            <div style={{ position: 'absolute', bottom: 0, left: 0, right: 0, background: 'rgba(0,0,0,0.45)', color: '#fff', fontSize: 11, padding: '2px 4px', textAlign: 'center', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
              {idx + 1}. {item.file.name.replace(/\.[^.]+$/, '')}
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}

function DropZone({ onFiles, onDrop, accept, idKey, multiple = true, label, disabled }) {
  const [dragging, setDragging] = useState(false)
  const inputId = `upload-${idKey || accept}`
  return (
    <div
      onDrop={e => { if (!disabled) { e.preventDefault(); setDragging(false); onDrop(e) } }}
      onDragOver={e => { e.preventDefault(); if (!disabled) setDragging(true) }}
      onDragLeave={() => setDragging(false)}
      onClick={() => { if (!disabled) document.getElementById(inputId).click() }}
      style={{
        border: `2px dashed ${dragging ? 'var(--accent)' : 'var(--line)'}`,
        borderRadius: 12, padding: '24px 16px', textAlign: 'center',
        cursor: disabled ? 'not-allowed' : 'pointer',
        background: dragging ? 'var(--accent-soft)' : disabled ? 'var(--surface-2)' : 'var(--surface)',
        marginBottom: 8, transition: 'all 0.2s', opacity: disabled ? 0.6 : 1,
      }}>
      <div style={{ fontSize: 28, marginBottom: 6 }}>{accept.startsWith('image') ? '📷' : '🎵'}</div>
      <p style={{ margin: 0, color: 'var(--ink-soft)', fontSize: 14 }}>{label}</p>
      {/* Для фото — кнопка прямой съёмки камерой (мимо телефона/ноута/Google Photos) */}
      {accept.startsWith('image') && (
        <button type="button" disabled={disabled}
          onClick={e => { e.stopPropagation(); if (!disabled) document.getElementById(inputId + '-cam').click() }}
          style={{ marginTop: 10, padding: '8px 16px', borderRadius: 9, border: '1px solid var(--accent)', background: 'var(--accent-soft)', color: 'var(--accent)', fontWeight: 700, fontSize: 13, cursor: disabled ? 'not-allowed' : 'pointer' }}>
          📷 Сфотографировать
        </button>
      )}
      <input id={inputId} type="file" accept={accept} multiple={multiple} style={{ display: 'none' }}
        onChange={e => onFiles(Array.from(e.target.files))} disabled={disabled} />
      {accept.startsWith('image') && (
        <input id={inputId + '-cam'} type="file" accept="image/*" capture="environment" multiple={multiple} style={{ display: 'none' }}
          onChange={e => onFiles(Array.from(e.target.files))} disabled={disabled} />
      )}
    </div>
  )
}

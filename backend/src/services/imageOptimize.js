import sharp from 'sharp'
import { config } from '../config.js'
import { mkdirSync } from 'fs'
import { join } from 'path'

// Оптимизация картинок слов. gpt-image-1 отдаёт PNG 1024×1024 (~1.2 МБ) — тяжело и медленно,
// особенно на телефоне «в лесу». Пережимаем в WebP двух размеров:
//   - большой (десктоп/планшет, чётко, не размыто)  word_<id>.webp     768px q82
//   - маленький (мобильный, максимальное сжатие)     word_<id>_sm.webp  384px q72
// В БД пишем URL большого; фронт (WordImage) через srcset отдаёт мобильному маленький.
const LARGE = 768
const SMALL = 384

// Сохраняет буфер картинки в два webp-варианта. Возвращает URL большого (канонический).
export async function saveOptimizedImage(buffer, wordId) {
  const dir = join(config.uploadDir, 'word-images')
  mkdirSync(dir, { recursive: true })
  const base = `word_${wordId}`
  await sharp(buffer)
    .resize(LARGE, LARGE, { fit: 'inside', withoutEnlargement: true })
    .webp({ quality: 82 })
    .toFile(join(dir, `${base}.webp`))
  await sharp(buffer)
    .resize(SMALL, SMALL, { fit: 'inside', withoutEnlargement: true })
    .webp({ quality: 72 })
    .toFile(join(dir, `${base}_sm.webp`))
  return `/uploads/word-images/${base}.webp`
}

// Обложка курса (фото учебника) — портретная, заполняет рамку карточки без
// letterbox-полей (fit: 'cover', в отличие от 'inside' у картинок слов).
// Один размер (без _sm) — курсов мало, доп. srcset не оправдан.
const COVER_WIDTH = 480
const COVER_HEIGHT = 640

// Сохраняет обложку курса в webp. Перезаписывает файл при повторной загрузке
// (имя файла детерминировано по courseId — не нужно чистить старый файл).
export async function saveCourseCover(buffer, courseId) {
  const dir = join(config.uploadDir, 'course-covers')
  mkdirSync(dir, { recursive: true })
  const filename = `course_${courseId}.webp`
  await sharp(buffer)
    .resize(COVER_WIDTH, COVER_HEIGHT, { fit: 'cover' })
    .webp({ quality: 82 })
    .toFile(join(dir, filename))
  return `/uploads/course-covers/${filename}`
}

// Обложка книги — тот же формат, что у курсов (портретная, cover). Имя по bookId +
// кэш-бастер добавляет вызывающий (URL в БД), так что при перезагрузке превью обновится.
export async function saveBookCover(buffer, bookId) {
  const dir = join(config.uploadDir, 'book-covers')
  mkdirSync(dir, { recursive: true })
  const filename = `book_${bookId}.webp`
  await sharp(buffer)
    .resize(COVER_WIDTH, COVER_HEIGHT, { fit: 'cover' })
    .webp({ quality: 82 })
    .toFile(join(dir, filename))
  return `/uploads/book-covers/${filename}`
}

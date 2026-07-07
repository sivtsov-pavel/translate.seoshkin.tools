#!/usr/bin/env node
// Скрипт для пакетного импорта уроков из директории с фотографиями
//
// Структура папки:
//   lessons/
//     урок-01-приветствия/
//       фото1.jpg
//       фото2.jpg
//       аудио.mp3   (опционально)
//     урок-02-числа/
//       ...
//
// Или одна папка с фотографиями = один урок:
//   photos/
//     page1.jpg
//     page2.jpg
//
// Использование:
//   node import-lessons.js <путь-к-папке-с-уроками> [--single]
//
// --single : папка содержит фото одного урока (не подпапки)
//
// ENV переменные:
//   BACKEND_URL  — по умолчанию http://localhost:8090
//   OWNER_EMAIL  — email владельца (создаётся если не существует)
//   OWNER_PASS   — пароль
//   DELAY_MS     — пауза между уроками в мс (по умолчанию 3000)

import { readFileSync, readdirSync, statSync } from 'fs'
import { join, extname, basename } from 'path'
import { FormData, Blob } from 'node:buffer'

const BACKEND   = process.env.BACKEND_URL  || 'http://localhost:8090'
const EMAIL     = process.env.OWNER_EMAIL  || 'owner@school.local'
const PASSWORD  = process.env.OWNER_PASS   || 'LessonImport2026!'
const DELAY_MS  = parseInt(process.env.DELAY_MS || '3000')

const IMAGE_EXT = new Set(['.jpg', '.jpeg', '.png', '.webp', '.heic', '.heif'])
const AUDIO_EXT = new Set(['.mp3', '.m4a', '.wav', '.ogg', '.aac', '.opus'])

async function api(method, path, body) {
  const opts = { method, headers: { 'Content-Type': 'application/json' } }
  if (token) opts.headers['Authorization'] = `Bearer ${token}`
  if (body)  opts.body = JSON.stringify(body)
  const res = await fetch(`${BACKEND}${path}`, opts)
  const json = await res.json()
  if (!res.ok) throw new Error(`${method} ${path} → ${res.status}: ${JSON.stringify(json)}`)
  return json
}

async function uploadFile(lessonId, filePath, mimeType) {
  const data = readFileSync(filePath)
  const fd = new FormData()
  fd.append('files', new Blob([data], { type: mimeType }), basename(filePath))

  const headers = {}
  if (token) headers['Authorization'] = `Bearer ${token}`

  const res = await fetch(`${BACKEND}/api/lessons/${lessonId}/media`, { method: 'POST', headers, body: fd })
  if (!res.ok) throw new Error(`Ошибка загрузки файла ${filePath}: ${res.status}`)
  return res.json()
}

function getMime(filePath) {
  const ext = extname(filePath).toLowerCase()
  if (IMAGE_EXT.has(ext)) {
    const m = { '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.png': 'image/png', '.webp': 'image/webp', '.heic': 'image/heic', '.heif': 'image/heic' }
    return m[ext] || 'image/jpeg'
  }
  if (AUDIO_EXT.has(ext)) {
    const m = { '.mp3': 'audio/mpeg', '.m4a': 'audio/mp4', '.wav': 'audio/wav', '.ogg': 'audio/ogg', '.aac': 'audio/aac', '.opus': 'audio/opus' }
    return m[ext] || 'audio/mpeg'
  }
  return null
}

let token = null

async function loginOrRegister() {
  // Пробуем войти
  try {
    const res = await fetch(`${BACKEND}/api/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: EMAIL, password: PASSWORD }),
    })
    if (res.ok) {
      const { token: t } = await res.json()
      token = t
      console.log(`✓ Вошли как ${EMAIL}`)
      return
    }
  } catch {}

  // Регистрируемся
  const { token: t } = await api('POST', '/api/auth/register', {
    email: EMAIL, password: PASSWORD, role: 'owner'
  })
  token = t
  console.log(`✓ Зарегистрированы как ${EMAIL}`)
}

async function importLesson(dirOrFiles, lessonTitle) {
  // Получаем список файлов
  let files = Array.isArray(dirOrFiles)
    ? dirOrFiles
    : readdirSync(dirOrFiles)
        .map(f => join(dirOrFiles, f))
        .filter(f => statSync(f).isFile() && getMime(f))
        .sort()

  if (files.length === 0) {
    console.log(`  Пропускаем "${lessonTitle}" — нет подходящих файлов`)
    return
  }

  const photos = files.filter(f => IMAGE_EXT.has(extname(f).toLowerCase()))
  const audios = files.filter(f => AUDIO_EXT.has(extname(f).toLowerCase()))

  console.log(`\n📚 Урок: "${lessonTitle}"`)
  console.log(`   Фото: ${photos.length}, Аудио: ${audios.length}`)

  // Создаём урок
  const lesson = await api('POST', '/api/lessons', {
    title: lessonTitle,
    date: new Date().toISOString().slice(0, 10),
  })
  console.log(`   Создан урок #${lesson.id}`)

  // Загружаем фото
  for (const photo of photos) {
    console.log(`   ↑ ${basename(photo)}`)
    await uploadFile(lesson.id, photo, getMime(photo))
  }

  // Загружаем аудио
  for (const audio of audios) {
    console.log(`   ↑ ${basename(audio)} (аудио)`)
    await uploadFile(lesson.id, audio, getMime(audio))
  }

  // Запускаем обработку
  console.log(`   ⏳ Обработка через Claude AI...`)
  const result = await api('POST', `/api/lessons/${lesson.id}/process`, {})
  console.log(`   ✓ Готово! Слов: ${result.wordsCount}, Упражнений: ${result.exercisesCount}`)

  return result
}

async function main() {
  const args = process.argv.slice(2)
  const isSingle = args.includes('--single')
  const dir = args.find(a => !a.startsWith('--'))

  if (!dir) {
    console.error(`
Использование:
  node import-lessons.js <папка> [--single]

Примеры:
  # Папка с подпапками — каждая подпапка = один урок
  node import-lessons.js ./my-lessons

  # Одна папка с фотографиями = один урок
  node import-lessons.js ./my-lessons/урок-01 --single

ENV переменные (опционально):
  BACKEND_URL=http://localhost:8090
  OWNER_EMAIL=owner@school.local
  OWNER_PASS=LessonImport2026!
  DELAY_MS=3000
`)
    process.exit(1)
  }

  console.log(`Подключение к ${BACKEND}...`)
  await loginOrRegister()

  if (isSingle) {
    // Одна папка = один урок
    const title = basename(dir)
    await importLesson(dir, title)
  } else {
    // Подпапки = уроки
    const entries = readdirSync(dir)
      .map(name => ({ name, path: join(dir, name) }))
      .filter(e => statSync(e.path).isDirectory())
      .sort((a, b) => a.name.localeCompare(b.name, 'ru'))

    if (entries.length === 0) {
      console.error('Подпапки не найдены. Если у тебя одна папка с фото, добавь --single')
      process.exit(1)
    }

    console.log(`Найдено ${entries.length} уроков`)
    let ok = 0, fail = 0

    for (const entry of entries) {
      try {
        await importLesson(entry.path, entry.name)
        ok++
      } catch (err) {
        console.error(`  ✗ Ошибка: ${err.message}`)
        fail++
      }
      if (entries.indexOf(entry) < entries.length - 1) {
        console.log(`   Пауза ${DELAY_MS / 1000}с перед следующим уроком...`)
        await new Promise(r => setTimeout(r, DELAY_MS))
      }
    }

    console.log(`\n=== Импорт завершён: ${ok} успешно, ${fail} с ошибками ===`)
  }
}

main().catch(err => {
  console.error('Критическая ошибка:', err.message)
  process.exit(1)
})

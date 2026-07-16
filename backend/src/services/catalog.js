import { db } from '../db/index.js'

// Каталог учебников: «не плодить одно и то же». Учитель публикует свой курс как учебник,
// другие подключают его — уроки/слова/упражнения КОПИРУЮТСЯ как есть (с картинками и
// переводами), без единого вызова OpenAI. Мгновенно и бесплатно.

// Опубликовать курс как учебник в общий каталог. Возвращает textbook.
export async function publishCourse(courseId, ownerId, { publisher = null, level = null } = {}) {
  const { rows: cr } = await db.query('SELECT id, title, description, cover_image_url FROM courses WHERE id=$1 AND owner_id=$2', [courseId, ownerId])
  const course = cr[0]
  if (!course) throw new Error('Курс не найден')
  const { rows: lr } = await db.query("SELECT id, target_lang FROM lessons WHERE course_id=$1 AND status='done'", [courseId])
  if (!lr.length) throw new Error('В курсе нет готовых уроков')
  const targetLang = lr[0].target_lang || 'de'

  const { rows: tr } = await db.query(
    `INSERT INTO textbooks (name, publisher, level, target_lang, cover_url, is_public, created_by)
     VALUES ($1,$2,$3,$4,$5,true,$6) RETURNING id, name`,
    [course.title || 'Учебник', publisher, level, targetLang, course.cover_image_url || null, ownerId])
  // Помечаем уроки курса как принадлежащие этому учебнику каталога
  await db.query('UPDATE lessons SET textbook_id=$1 WHERE course_id=$2', [tr[0].id, courseId])
  return tr[0]
}

// Подключить учебник каталога к своей школе: копируем его уроки со словами/упражнениями.
export async function adoptTextbook(textbookId, newOwnerId, newSchoolId) {
  const { rows: tr } = await db.query('SELECT id, name FROM textbooks WHERE id=$1 AND is_public=true', [textbookId])
  if (!tr[0]) throw new Error('Учебник не найден')
  const { rows: lessons } = await db.query(
    "SELECT id, title, description, target_lang, title_translations, description_translations, lesson_number FROM lessons WHERE textbook_id=$1 AND status='done' ORDER BY lesson_number, id",
    [textbookId])

  let copied = 0
  for (const L of lessons) {
    const { rows: nl } = await db.query(
      `INSERT INTO lessons (owner_id, school_id, title, description, target_lang, title_translations, description_translations, lesson_number, status, progress)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,'done','Подключено из каталога') RETURNING id`,
      [newOwnerId, newSchoolId, L.title, L.description, L.target_lang, L.title_translations || {}, L.description_translations || {}, L.lesson_number])
    const newId = nl[0].id

    // Копируем слова (с картинками и переводами — бесплатно) и запоминаем маппинг старый→новый
    const { rows: words } = await db.query('SELECT id, word_de, translation_ru, example_sentence, example_sentence_ru, image_url, translations, source FROM words WHERE lesson_id=$1', [L.id])
    const wordIdMap = {}
    for (const w of words) {
      const { rows: nw } = await db.query(
        `INSERT INTO words (lesson_id, user_id, word_de, translation_ru, example_sentence, example_sentence_ru, image_url, translations, source)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9) ON CONFLICT (lesson_id, word_de) DO NOTHING RETURNING id`,
        [newId, newOwnerId, w.word_de, w.translation_ru, w.example_sentence, w.example_sentence_ru, w.image_url, w.translations, w.source])
      if (nw[0]) wordIdMap[w.id] = nw[0].id
    }
    // Копируем предложения урока
    const { rows: sents } = await db.query('SELECT text, translation_ru, source FROM lesson_sentences WHERE lesson_id=$1', [L.id])
    for (const s of sents) {
      await db.query('INSERT INTO lesson_sentences (lesson_id, text, translation_ru, source) VALUES ($1,$2,$3,$4)', [newId, s.text, s.translation_ru, s.source])
    }
    // Копируем упражнения (с переводами payload) — тоже бесплатно
    const { rows: exs } = await db.query('SELECT word_id, type, payload, payload_translations, image_url FROM exercises WHERE lesson_id=$1', [L.id])
    for (const e of exs) {
      await db.query(
        'INSERT INTO exercises (lesson_id, word_id, type, payload, payload_translations, image_url) VALUES ($1,$2,$3,$4,$5,$6)',
        [newId, wordIdMap[e.word_id] || null, e.type, e.payload, e.payload_translations || {}, e.image_url])
    }
    copied++
  }
  return { textbook: tr[0].name, lessons: copied }
}

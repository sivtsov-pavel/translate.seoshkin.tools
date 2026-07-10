#!/usr/bin/env node
/**
 * import-lessons.js — импорт 10 уроков немецкого курса
 *
 * Использование:
 *   IMPORT_PASSWORD=твой_пароль node import-lessons.js
 */

import { readFileSync, existsSync } from 'node:fs'
import { join, extname } from 'node:path'
import { fileURLToPath } from 'node:url'

const __dir  = fileURLToPath(new URL('.', import.meta.url))
const PHOTOS = join(__dir, 'IMPORT_Photos-3-001-uroki')
const API    = process.env.API_URL    || 'http://34.179.228.86:8090'
const EMAIL  = process.env.IMPORT_EMAIL || 'sivtsov.pavel@gmail.com'
const PASS   = process.env.IMPORT_PASSWORD

if (!PASS) {
  console.error('Укажи пароль: IMPORT_PASSWORD=... node import-lessons.js')
  process.exit(1)
}

let token

async function req(path, opts = {}) {
  const res = await fetch(`${API}${path}`, {
    ...opts,
    headers: { ...(token && { Authorization: `Bearer ${token}` }), ...opts.headers },
  })
  if (!res.ok) throw new Error(`${res.status} ${path}: ${await res.text()}`)
  return res.json()
}

function mime(f) {
  return extname(f).toLowerCase() === '.png' ? 'image/png' : 'image/jpeg'
}

const LESSONS = [
  {
    date: '2026-06-22',
    title: 'Урок 1: Первые шаги и приветствия',
    description: 'Знакомство с алфавитом (буква N), базовые приветствия в зависимости от времени суток. Стр. 6–7',
    text_content: `Guten Morgen — Доброе утро
Guten Tag — Добрый день
Guten Abend — Добрый вечер
Gute Nacht — Спокойной ночи
Hallo — Привет
Tschüss — Пока
Auf Wiedersehen — До свидания
der Name — имя
helfen — помогать
Wie heißen Sie? — Как вас зовут?
Wie heißt du? — Как тебя зовут?
Entschuldigung — Извините
bitte — пожалуйста
danke — спасибо
Ich heiße... — Меня зовут...`,
    photos: [],
  },
  {
    date: '2026-06-23',
    title: 'Урок 2: Глаголы действия и имена',
    description: 'Изучение окончаний глаголов (-en) и способов представиться. Работа с буквами E и En. Стр. 8–9',
    text_content: `lesen — читать
sprechen — говорить
schreiben — писать
heißen — называться
sehen — видеть
hören — слышать
klopfen — стучать
der Name — имя
Wie ist dein Name? — Как тебя зовут?
Mein Name ist... — Меня зовут...
Entschuldigung — Извините
Ich kann nicht lesen — Я не умею читать`,
    photos: [
      'IMG_20260623_124955.jpg',
      'IMG-20260624-WA0007.jpg',
      'Screenshot_20260624-123857_WhatsApp.png',
      'photo_2026-07-08 02.00.27.jpeg',
      'photo_2026-07-08 02.00.29.jpeg',
      'photo_2026-07-08 02.00.31.jpeg',
      'photo_2026-07-08 02.00.32.jpeg',
      'photo_2026-07-08 02.00.33.jpeg',
      'photo_2026-07-08 02.00.35.jpeg',
      'photo_2026-07-08 02.00.41.jpeg',
      'photo_2026-07-08 08.34.47.jpeg',
      'photo_2026-07-08 08.34.49.jpeg',
      'photo_2026-07-08 08.34.52.jpeg',
      'photo_2026-07-08 08.34.57.jpeg',
      'IMG_20260707_075250.jpg',
      'IMG_20260707_075258.jpg',
      'IMG_20260707_075301.jpg',
    ],
  },
  {
    date: '2026-06-24',
    title: 'Урок 3: Страны и происхождение',
    description: 'Работа с буквой T. Обсуждение того, откуда приехали ученики, и названия стран. Стр. 10–11',
    text_content: `Deutschland — Германия
Türkei — Турция
Russland — Россия
kommen aus — приехать из
Woher kommen Sie? — Откуда вы?
Ich komme aus... — Я из...
der Kurs — курс
die Kursleiterin — преподавательница курса
lernen — учить
wohnen — жить
die Sprache — язык`,
    photos: [
      'Screenshot_20260627-153504_Google.png',
      'photo_2026-07-08 02.00.22.jpeg',
      'photo_2026-07-08 02.00.23.jpeg',
      'photo_2026-07-08 02.00.25.jpeg',
      'photo_2026-07-08 02.00.26.jpeg',
      'photo_2026-07-08 08.34.42.jpeg',
      'photo_2026-07-08 08.34.44.jpeg',
      'IMG_20260707_075308.jpg',
      'IMG_20260707_075311.jpg',
      'IMG_20260707_075317.jpg',
    ],
  },
  {
    date: '2026-06-25',
    title: 'Урок 4: Мой город и адрес',
    description: 'Изучение буквы A. Городские учреждения, предметы личного пользования. Притяжательные местоимения meine/Ihre. Стр. 12–13',
    text_content: `das Amt — ведомство
die Stadt — город
die Adresse — адрес
die Tasche — сумка
Ist das Ihre Tasche? — Это ваша сумка?
Ja, das ist meine Tasche — Да, это моя сумка
das Mädchen — девочка
der Junge — мальчик
die Uhr — часы
die Ampel — светофор
der Apfel — яблоко
das Auto — автомобиль
die Haut — кожа
der Arm — рука
die Augen — глаза
der Aufzug — лифт
das Spiel — игра
die Nase — нос
die Flasche — бутылка
der Tisch — стол`,
    photos: [
      'IMG-20260626-WA0000.jpg','IMG-20260626-WA0001.jpg','IMG-20260626-WA0002.jpg',
      'IMG-20260626-WA0003.jpg','IMG-20260626-WA0004.jpg','IMG-20260626-WA0005.jpg',
      'IMG-20260626-WA0006.jpg','IMG-20260626-WA0007.jpg','IMG-20260626-WA0008.jpg',
      'IMG-20260626-WA0009.jpg','IMG-20260626-WA0010.jpg','IMG-20260626-WA0011.jpg',
      'IMG-20260626-WA0012.jpg','IMG-20260626-WA0013.jpg','IMG-20260626-WA0014.jpg',
      'IMG-20260626-WA0015.jpg','IMG-20260626-WA0016.jpg',
      'photo_2026-07-08 02.00.16.jpeg',
      'photo_2026-07-08 02.00.17.jpeg',
      'photo_2026-07-08 02.00.18.jpeg',
      'photo_2026-07-08 02.00.19.jpeg',
      'photo_2026-07-08 02.00.21.jpeg',
      'photo_2026-07-08 08.34.31.jpeg',
      'photo_2026-07-08 08.34.35.jpeg',
      'photo_2026-07-08 08.34.38.jpeg',
      'IMG_20260707_075337.jpg',
      'IMG_20260707_075342.jpg',
      'IMG_20260707_075344.jpg',
    ],
  },
  {
    date: '2026-06-29',
    title: 'Урок 5: Транспорт и дни недели',
    description: 'Буква R, долгие гласные. Виды транспорта, дни недели, вопросы о выходных. Стр. 14–17',
    text_content: `der Bus — автобус
die S-Bahn — городская электричка
der Zug — поезд
die U-Bahn — метро
hat Verspätung — опаздывает
Montag — понедельник
Dienstag — вторник
Mittwoch — среда
Donnerstag — четверг
Freitag — пятница
Samstag — суббота
Sonntag — воскресенье
das Wochenende — выходные
der Wecker — будильник
schwer — тяжёлый
manchmal — иногда
eins zwei drei vier fünf sechs sieben acht neun zehn
zwanzig dreißig vierzig fünfzig sechzig siebzig`,
    photos: [
      'IMG-20260629-WA0002.jpg','IMG-20260629-WA0003.jpg','IMG-20260629-WA0004.jpg',
      'IMG-20260629-WA0005.jpg','IMG-20260629-WA0006.jpg','IMG-20260629-WA0007.jpg',
      'IMG-20260629-WA0008.jpg','IMG-20260629-WA0009.jpg','IMG-20260629-WA0010.jpg',
      'IMG-20260629-WA0011.jpg','IMG-20260629-WA0012.jpg','IMG-20260629-WA0013.jpg',
      'IMG-20260629-WA0014.jpg','IMG-20260629-WA0015.jpg','IMG-20260629-WA0016.jpg',
      'IMG-20260629-WA0017.jpg',
      'photo_2026-07-08 02.00.09.jpeg',
      'photo_2026-07-08 02.00.11.jpeg',
      'photo_2026-07-08 02.00.12.jpeg',
      'photo_2026-07-08 02.00.14.jpeg',
      'photo_2026-07-08 02.00.15.jpeg',
      'photo_2026-07-08 08.34.24.jpeg',
      'photo_2026-07-08 08.34.27.jpeg',
      'IMG_20260707_075347.jpg',
      'IMG_20260707_075350.jpg',
      'IMG_20260707_075354.jpg',
    ],
  },
  {
    date: '2026-06-30',
    title: 'Урок 6: Предметы в классе и глагол können',
    description: 'Буквы I и Ie. Предметы в классе и дома. Модальный глагол können (мочь/уметь). Прилагательные. Стр. 18–26',
    text_content: `der Stift — ручка
die Brille — очки
der Stuhl — стул
das Sofa — диван
der Tisch — стол
die Flasche — бутылка
ledig — холост/не замужем
verheiratet — женат/замужем
die Unterschrift — подпись
die Information — информация
der Spiegel — зеркало
können — мочь уметь
ich kann — я могу
du kannst — ты можешь
er kann — он может
wir können — мы можем
ihr könnt — вы можете
sie können — они могут
Ich kann schwimmen — Я умею плавать
Ich kann gut singen — Я умею хорошо петь
schnell — быстро
langsam — медленно
gemütlich — уютно
Seite — страница`,
    photos: [
      'IMG-20260701-WA0000.jpg','IMG-20260701-WA0001.jpg','IMG-20260701-WA0002.jpg',
      'IMG-20260701-WA0003.jpg','IMG-20260701-WA0004.jpg','IMG-20260701-WA0005.jpg',
      'IMG-20260701-WA0006.jpg','IMG-20260701-WA0007.jpg','IMG-20260701-WA0008.jpg',
      'photo_2026-07-08 01.59.53.jpeg',
      'photo_2026-07-08 02.00.00.jpeg',
      'photo_2026-07-08 02.00.04.jpeg',
      'photo_2026-07-08 02.00.06.jpeg',
      'photo_2026-07-08 02.00.08.jpeg',
      'photo_2026-07-08 08.34.17.jpeg',
      'IMG_20260707_075401.jpg',
      'IMG_20260707_075406.jpg',
      'IMG_20260707_075410.jpg',
    ],
  },
  {
    date: '2026-07-01',
    title: 'Урок 7: Числа, стороны света и бытовые предметы',
    description: 'Дни недели, числа до 70. Стороны света. Бытовые предметы в доме. Стр. 22–31',
    text_content: `Heute ist Dienstag — Сегодня вторник
die Sonne — солнце
Süden — юг
Osten — восток
Westen — запад
Norden — север
die Insel — остров
der Schnee — снег
der See — озеро
das Messer — нож
die Post — почта
der Stuhl — стул
das Sofa — диван
die Hausnummer — номер дома
siebenzehn — семнадцать
siebzig — семьдесят
dreißig — тридцать
braun — коричневый
gemütlich — уютный
die Wand — стена
das Fenster — окно
die Tür — дверь`,
    photos: [
      'IMG_20260707_075413.jpg',
      'IMG_20260707_075417.jpg',
      'IMG_20260707_075422.jpg',
      'IMG_20260707_075426.jpg',
    ],
  },
  {
    date: '2026-07-02',
    title: 'Урок 8: Глагол gehen и падежи (Nominativ/Akkusativ/Dativ)',
    description: 'Спряжение глагола gehen в Präsens. Падежи и артикли в именительном, винительном, дательном падежах. Стр. 32–33',
    text_content: `gehen — идти
ich gehe — я иду
du gehst — ты идёшь
er geht — он идёт
wir gehen — мы идём
ihr geht — вы идёте
sie gehen — они идут
Nominativ — именительный падеж wer was
Akkusativ — винительный падеж wen was
Dativ — дательный падеж wem
der den dem — мужской род
die die der — женский род
das das dem — средний род
ein einen einem — неопределённый артикль
kein keinen keinem — отрицательный артикль
das Mädchen — девочка
der Käse — сыр
Ich hätte gerne einen Käse — Я бы хотел сыру
das Käsebrot — бутерброд с сыром
das Rad — колесо велосипед
die Räder — колёса велосипеды
der Vater — отец
die Väter — отцы`,
    photos: [
      'IMG-20260702-WA0000.jpg','IMG-20260702-WA0001.jpg','IMG-20260702-WA0002.jpg',
      'IMG-20260702-WA0003.jpg','IMG-20260702-WA0004.jpg','IMG-20260702-WA0005.jpg',
      'IMG-20260702-WA0006.jpg','IMG-20260702-WA0007.jpg','IMG-20260702-WA0008.jpg',
      'IMG-20260702-WA0009.jpg','IMG-20260702-WA0011.jpg','IMG-20260702-WA0012.jpg',
      'IMG-20260702-WA0013.jpg','IMG-20260702-WA0014.jpg','IMG-20260702-WA0015.jpg',
      'IMG-20260702-WA0016.jpg','IMG-20260702-WA0017.jpg',
      'IMG-20260703-WA0000.jpg','IMG-20260703-WA0001.jpg','IMG-20260703-WA0002.jpg',
      'IMG-20260703-WA0003.jpg','IMG-20260703-WA0004.jpg','IMG-20260703-WA0009.jpg',
      'IMG-20260703-WA0010.jpg','IMG-20260703-WA0011.jpg','IMG-20260703-WA0012.jpg',
      'IMG-20260703-WA0013.jpg',
      'IMG_20260707_075430.jpg',
      'IMG_20260707_075432.jpg',
    ],
  },
  {
    date: '2026-07-07',
    title: 'Урок 9: Умлаут Ä, bestellen и семья',
    description: 'Буква Ä ä. Заказ еды (bestellen). Члены семьи и родственники. Стр. 34–37',
    text_content: `bestellen — заказывать
der Käse — сыр
Ich hätte gerne... — Я бы хотел...
das Rad — велосипед колесо
die Räder — велосипеды колёса
der Vater — отец
die Väter — отцы
der Freund — друг
eine Freundin — подруга
der Schwiegersohn — зять
die Schwiegertochter — невестка
der Kumpel — приятель
die Familie — семья
die Mutter — мать
der Bruder — брат
die Schwester — сестра
der Sohn — сын
die Tochter — дочь
Zählen — считать`,
    photos: [
      'IMG_20260707_120824.jpg','IMG_20260707_120832.jpg','IMG_20260707_131023.jpg',
      'IMG_20260707_132800.jpg','IMG_20260707_132805.jpg','IMG_20260707_132813.jpg',
      'IMG_20260707_132817.jpg','IMG_20260707_132830.jpg','IMG_20260707_132840.jpg',
      'IMG_20260707_132844.jpg','IMG_20260707_132850.jpg','IMG_20260707_132855.jpg',
      'IMG_20260707_132901.jpg','IMG_20260707_132907.jpg','IMG_20260707_132913.jpg',
      'IMG_20260707_132918.jpg','IMG_20260707_132921.jpg',
      'IMG_20260707_075435.jpg',
      'IMG_20260707_075438.jpg',
    ],
  },
  {
    date: '2026-07-08',
    title: 'Урок 10: Завершение курса Vorkurs',
    description: 'Финальные темы Vorkurs. Повторение словаря и грамматики курса. Стр. 38–55',
    text_content: `wiederholen — повторять
die Wiederholung — повторение
der Vorkurs — подготовительный курс
das Wort — слово
die Wörter — слова
lernen — учить
sprechen — говорить
üben — упражняться
die Übung — упражнение
der Satz — предложение
die Grammatik — грамматика
richtig — правильно
falsch — неправильно
gut — хорошо
super — отлично
das Ende — конец
fertig — готово`,
    photos: [
      'IMG_20260708_115115.jpg',
    ],
  },
]

async function main() {
  console.log('Логин...')
  const auth = await req('/api/auth/login', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: EMAIL, password: PASS }),
  })
  token = auth.token
  console.log('Залогинен:', EMAIL)

  console.log('\nУдаляем старые уроки...')
  const existing = await req('/api/lessons')
  for (const l of existing) {
    await req(`/api/lessons/${l.id}`, { method: 'DELETE' })
    console.log(`  Удалён #${l.id}: ${l.title || 'без названия'}`)
  }
  if (!existing.length) console.log('  (нет уроков)')

  console.log('\nСоздаём 10 уроков...\n')

  for (let i = 0; i < LESSONS.length; i++) {
    const { photos, text_content, description, ...meta } = LESSONS[i]

    const lesson = await req('/api/lessons', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ title: meta.title, date: meta.date }),
    })

    await req(`/api/lessons/${lesson.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ description, text_content }),
    })

    const good = photos.filter(f => {
      const ok = existsSync(join(PHOTOS, f))
      if (!ok) console.log(`    MISSING: ${f}`)
      return ok
    })

    console.log(`[${i+1}/10] ${meta.title} (${meta.date}) — ${good.length} фото`)

    const BATCH = 5
    for (let j = 0; j < good.length; j += BATCH) {
      const batch = good.slice(j, j + BATCH)
      const form = new FormData()
      for (const f of batch) {
        const buf = readFileSync(join(PHOTOS, f))
        form.append('file', new Blob([buf], { type: mime(f) }), f)
      }
      await req(`/api/lessons/${lesson.id}/media`, { method: 'POST', body: form })
      console.log(`  фото ${Math.min(j + BATCH, good.length)}/${good.length} загружено`)
    }
  }

  console.log('\nИмпорт завершён! 10 уроков созданы.')
  console.log('Открой каждый урок и нажми Обработать для генерации упражнений.')
}

main().catch(err => { console.error('ОШИБКА:', err.message); process.exit(1) })

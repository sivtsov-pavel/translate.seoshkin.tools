#!/usr/bin/env node
// Настоящие находки сплошной сверки пар «предложение ↔ перевод» (скан 14.09.2026).
//
// Скан пометил 76 пар, но ЧИТАТЬ ИХ ОБЯЗАН ЧЕЛОВЕК: 64 из 76 оказались ложными —
// модель писала в поле «предложение» слова «верный перевод», и скрипт считал это
// находкой. Применить такой список целиком значило бы переписать шесть десятков
// нормальных переводов. Ниже — только то, что действительно сломано, каждая строка
// прочитана глазами и переписана руками.
//
// Что чинится:
//   • перевод с непереведённым словом («Я teach English»);
//   • сломанная грамматика русского («Я вижу два собаки», «У меня есть один собака»);
//   • сломанный НЕМЕЦКИЙ в самом эталоне («Ich habe einem Hund», «Ich suche der
//     Flughafen», «Ich lerne das Deutsch») — с новой сборкой фразы ученик собирает
//     именно эталон, то есть заучивает ошибку;
//   • немецкий пример в английском курсе («Komm bitte hierher» у слова «come»);
//   • арифметика из учебника («Vier und sieben. Zusammen: siebenundvierzig» — 4+7=11);
//   • обрывок рекламы вместо примера («Alles Digitale auf allango!»).
//
// 💸 Денег не тратит: все тексты заданы здесь.
//
//   docker compose -f docker-compose.prod.yml exec -T backend node scripts/fix-scan-findings-2026-09-14.mjs
//   docker compose -f docker-compose.prod.yml exec -T backend node scripts/fix-scan-findings-2026-09-14.mjs --apply
import { db } from '../src/db/index.js'

const apply = process.argv.includes('--apply')

const FIXES = [
  { id: 42386,  example: 'I teach English.',                     ru: 'Я преподаю английский.' },
  { id: 89394,  example: 'Please come here.',                    ru: 'Пожалуйста, подойди сюда.' },
  { id: 182083, example: 'Ich sehe zwei Hunde.',                 ru: 'Я вижу двух собак.' },
  { id: 122578, example: 'Ich habe einen Hund.',                 ru: 'У меня есть собака.' },
  { id: 122523, example: 'Ich helfe einem Freund.',              ru: 'Я помогаю другу.' },
  { id: 122568, example: 'Ich gebe meinem Freund ein Buch.',     ru: 'Я даю моему другу книгу.' },
  { id: 69580,  example: 'Mir gefallen die Zwiebeln.',           ru: 'Мне нравится лук.' },
  { id: 123071, example: 'Ich organisiere eine Veranstaltung.',  ru: 'Я организую мероприятие.' },
  { id: 88416,  example: 'Ich suche den Flughafen. Wo ist er?',  ru: 'Я ищу аэропорт. Где он?' },
  { id: 87144,  example: 'Ich lerne Deutsch.',                   ru: 'Я учу немецкий.' },
  { id: 86978,  example: 'Vier und sieben zusammen sind elf.',   ru: 'Четыре и семь вместе — одиннадцать.' },
  { id: 175433, example: 'Alles ist gut.',                       ru: 'Всё хорошо.' },
  { id: 101472, example: 'My grandfather is old.',               ru: 'Мой дедушка старый.' },
]

let n = 0
for (const f of FIXES) {
  const { rows } = await db.query('SELECT payload FROM exercises WHERE id = $1', [f.id])
  if (!rows[0]) { console.log(`#${f.id} — нет такого упражнения`); continue }
  const p = rows[0].payload || {}
  if (p.example === f.example && p.example_ru === f.ru) continue
  console.log(`#${f.id}: «${p.example}» / «${p.example_ru}»`)
  console.log(`      → «${f.example}» / «${f.ru}»`)
  if (apply) {
    await db.query('UPDATE exercises SET payload = payload || $2::jsonb WHERE id = $1',
      [f.id, JSON.stringify({ example: f.example, example_ru: f.ru })])
  }
  n++
}

console.log(`\n${apply ? 'Исправлено' : 'К исправлению'}: ${n} из ${FIXES.length}`)
if (!apply) console.log('Это пробный прогон. Записать: --apply')
process.exit(0)

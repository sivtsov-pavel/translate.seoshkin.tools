#!/usr/bin/env node
// Названия и описания трёх частей урока 42 на десяти локалях — написаны руками.
//
// Разбивка 29.09.2026 пришлась на пустой баланс OpenAI, и шаг генерации меты
// не отработал: у двух новых частей описания не было вовсе, а у первой осталось
// описание прежнего большого урока (про одежду, которая теперь в другой части).
//
// Строки интерфейса и короткие описания модель пишет сама в файлы/базу — это
// бесплатно, платный ключ не нужен (правило по расходам в CLAUDE.md).
//
// 💸 OpenAI НЕ вызывается — цена $0. Идемпотентен: повторный запуск ставит то же.
//
//   node scripts/set-lesson-meta-642-644.mjs           # план
//   node scripts/set-lesson-meta-642-644.mjs --apply
import { db } from '../src/db/index.js'

const APPLY = process.argv.includes('--apply')

const META = [
  {
    id: 642, number: 42, theme: 'Языки и место жительства',
    desc: 'Учимся говорить, на каких языках мы говорим и где живём: вопросы «Welche Sprache sprichst du?» и «Wo wohnst du?», названия языков и родной язык.',
    title: {
      ru: 'Языки и место жительства', uk: 'Мови та місце проживання', en: 'Languages and where you live',
      de: 'Sprachen und Wohnort', es: 'Idiomas y lugar de residencia', fr: 'Langues et lieu de résidence',
      bg: 'Езици и местоживеене', tr: 'Diller ve yaşadığın yer', sq: 'Gjuhët dhe vendbanimi', ar: 'اللغات ومكان السكن',
    },
    description: {
      ru: 'Учимся говорить, на каких языках мы говорим и где живём: вопросы «Welche Sprache sprichst du?» и «Wo wohnst du?», названия языков и родной язык.',
      uk: 'Вчимося говорити, якими мовами ми розмовляємо і де живемо: питання «Welche Sprache sprichst du?» і «Wo wohnst du?», назви мов та рідна мова.',
      en: 'Learn to say which languages you speak and where you live: the questions “Welche Sprache sprichst du?” and “Wo wohnst du?”, language names and your mother tongue.',
      de: 'Wir lernen zu sagen, welche Sprachen wir sprechen und wo wir wohnen: die Fragen „Welche Sprache sprichst du?“ und „Wo wohnst du?“, Sprachnamen und Muttersprache.',
      es: 'Aprendemos a decir qué idiomas hablamos y dónde vivimos: las preguntas «Welche Sprache sprichst du?» y «Wo wohnst du?», los nombres de los idiomas y la lengua materna.',
      fr: 'Nous apprenons à dire quelles langues nous parlons et où nous habitons : les questions « Welche Sprache sprichst du ? » et « Wo wohnst du ? », les noms des langues et la langue maternelle.',
      bg: 'Учим се да казваме кои езици говорим и къде живеем: въпросите «Welche Sprache sprichst du?» и «Wo wohnst du?», имена на езици и роден език.',
      tr: 'Hangi dilleri konuştuğumuzu ve nerede yaşadığımızı söylemeyi öğreniyoruz: «Welche Sprache sprichst du?» ve «Wo wohnst du?» soruları, dil adları ve ana dil.',
      sq: 'Mësojmë të themi cilat gjuhë flasim dhe ku banojmë: pyetjet «Welche Sprache sprichst du?» dhe «Wo wohnst du?», emrat e gjuhëve dhe gjuha amtare.',
      ar: 'نتعلّم أن نقول أيّ اللغات نتحدّث وأين نسكن: سؤالا «Welche Sprache sprichst du?» و«Wo wohnst du?»، أسماء اللغات واللغة الأم.',
    },
  },
  {
    id: 647, number: 43, theme: 'Одежда и погода',
    desc: 'Называем одежду и говорим, что носим зимой и когда холодно: куртка, шапка, обувь, штаны — и оборот «Wenn es sehr kalt ist…».',
    title: {
      ru: 'Одежда и погода', uk: 'Одяг і погода', en: 'Clothes and weather',
      de: 'Kleidung und Wetter', es: 'Ropa y tiempo', fr: 'Vêtements et météo',
      bg: 'Дрехи и време', tr: 'Giysiler ve hava', sq: 'Veshjet dhe moti', ar: 'الملابس والطقس',
    },
    description: {
      ru: 'Называем одежду и говорим, что носим зимой и когда холодно: куртка, шапка, обувь, штаны — и оборот «Wenn es sehr kalt ist…».',
      uk: 'Називаємо одяг і говоримо, що носимо взимку і коли холодно: куртка, шапка, взуття, штани — і зворот «Wenn es sehr kalt ist…».',
      en: 'Name clothes and say what you wear in winter and when it is cold: jacket, hat, shoes, trousers — and the phrase “Wenn es sehr kalt ist…”.',
      de: 'Wir benennen Kleidung und sagen, was wir im Winter und bei Kälte tragen: Jacke, Mütze, Schuhe, Hose — und die Wendung „Wenn es sehr kalt ist …“.',
      es: 'Nombramos la ropa y decimos qué llevamos en invierno y cuando hace frío: chaqueta, gorro, zapatos, pantalones — y la expresión «Wenn es sehr kalt ist…».',
      fr: 'Nous nommons les vêtements et disons ce que nous portons en hiver et quand il fait froid : veste, bonnet, chaussures, pantalon — et la tournure « Wenn es sehr kalt ist… ».',
      bg: 'Назоваваме дрехите и казваме какво носим зимата и когато е студено: яке, шапка, обувки, панталон — и изразът «Wenn es sehr kalt ist…».',
      tr: 'Giysileri adlandırıyoruz ve kışın, hava soğukken ne giydiğimizi söylüyoruz: mont, bere, ayakkabı, pantolon — ve «Wenn es sehr kalt ist…» kalıbı.',
      sq: 'Emërtojmë veshjet dhe themi çfarë veshim në dimër dhe kur bën ftohtë: xhaketë, kapelë, këpucë, pantallona — dhe shprehja «Wenn es sehr kalt ist…».',
      ar: 'نسمّي الملابس ونقول ماذا نرتدي في الشتاء وعندما يكون الجو بارداً: سترة، قبّعة، حذاء، بنطال — وعبارة «Wenn es sehr kalt ist…».',
    },
  },
  {
    id: 648, number: 44, theme: 'Знакомство и приветствия',
    desc: 'Знакомимся и здороваемся: имя и фамилия, откуда человек родом, анкетные данные — и приветствия от «Guten Morgen» до «Tschüss».',
    title: {
      ru: 'Знакомство и приветствия', uk: 'Знайомство та вітання', en: 'Introductions and greetings',
      de: 'Kennenlernen und Begrüßungen', es: 'Presentaciones y saludos', fr: 'Se présenter et saluer',
      bg: 'Запознанство и поздрави', tr: 'Tanışma ve selamlaşma', sq: 'Njohja dhe përshëndetjet', ar: 'التعارف والتحيات',
    },
    description: {
      ru: 'Знакомимся и здороваемся: имя и фамилия, откуда человек родом, анкетные данные — и приветствия от «Guten Morgen» до «Tschüss».',
      uk: 'Знайомимося і вітаємося: імʼя та прізвище, звідки людина родом, анкетні дані — і вітання від «Guten Morgen» до «Tschüss».',
      en: 'Get acquainted and greet people: first and last name, where someone is from, personal details — and greetings from “Guten Morgen” to “Tschüss”.',
      de: 'Wir lernen uns kennen und begrüßen einander: Vor- und Nachname, Herkunft, Personalien — und Begrüßungen von „Guten Morgen“ bis „Tschüss“.',
      es: 'Nos presentamos y saludamos: nombre y apellido, de dónde es una persona, datos personales — y saludos desde «Guten Morgen» hasta «Tschüss».',
      fr: 'Nous faisons connaissance et nous saluons : prénom et nom, origine, données personnelles — et les salutations de « Guten Morgen » à « Tschüss ».',
      bg: 'Запознаваме се и се поздравяваме: име и фамилия, откъде е човекът, лични данни — и поздрави от «Guten Morgen» до «Tschüss».',
      tr: 'Tanışıyoruz ve selamlaşıyoruz: ad ve soyad, kişinin nereli olduğu, kimlik bilgileri — ve «Guten Morgen»den «Tschüss»e selamlaşmalar.',
      sq: 'Njihemi dhe përshëndetemi: emri dhe mbiemri, nga vjen njeriu, të dhënat personale — dhe përshëndetjet nga «Guten Morgen» te «Tschüss».',
      ar: 'نتعارف ونتبادل التحيات: الاسم واللقب، من أين يأتي الشخص، البيانات الشخصية — وتحيات من «Guten Morgen» إلى «Tschüss».',
    },
  },
]

for (const m of META) {
  const { rows } = await db.query('SELECT id, lesson_number, title FROM lessons WHERE id = $1', [m.id])
  if (!rows[0]) { console.error(`  ✖ урок #${m.id} не найден — разбивка шла иначе, проверь id`); process.exit(1) }
  if (rows[0].lesson_number !== m.number) {
    console.error(`  ✖ #${m.id}: номер ${rows[0].lesson_number}, ожидался ${m.number} — не трогаю`); process.exit(1)
  }
  console.log(`  #${m.id} · Урок ${m.number}: ${m.theme}`)
  console.log(`      ${m.desc.slice(0, 90)}…`)
  console.log(`      локалей: название ${Object.keys(m.title).length}, описание ${Object.keys(m.description).length}`)
}

if (!APPLY) {
  console.log(`\nЭто план — ничего не изменено.\n  node scripts/set-lesson-meta-642-644.mjs --apply`)
  process.exit(0)
}

for (const m of META) {
  await db.query(
    `UPDATE lessons SET title = $1, description = $2,
            title_translations = $3::jsonb, description_translations = $4::jsonb
     WHERE id = $5`,
    [`Урок ${m.number}: ${m.theme}`, m.desc, JSON.stringify(m.title), JSON.stringify(m.description), m.id])
  console.log(`  ✓ #${m.id}`)
}
console.log('\nГотово. Потрачено: $0.0000')
process.exit(0)

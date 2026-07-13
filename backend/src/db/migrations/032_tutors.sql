-- Каталог школ и репетиторов
CREATE TABLE IF NOT EXISTS tutors (
  id          SERIAL PRIMARY KEY,
  user_id     INTEGER REFERENCES users(id) ON DELETE CASCADE,  -- владелец анкеты (NULL = демо-сид)
  name        TEXT NOT NULL,
  type        TEXT NOT NULL DEFAULT 'Репетитор',                -- Репетитор / Школа
  avatar_url  TEXT,
  langs       JSONB NOT NULL DEFAULT '["Немецкий"]',
  levels      JSONB NOT NULL DEFAULT '[]',
  country     TEXT, city TEXT, district TEXT,
  lat         DOUBLE PRECISION, lng DOUBLE PRECISION,
  format      TEXT NOT NULL DEFAULT 'Онлайн',                   -- Онлайн / Офлайн / Оба
  price       INTEGER NOT NULL DEFAULT 0,
  rating      NUMERIC(2,1) NOT NULL DEFAULT 5.0,
  reviews     INTEGER NOT NULL DEFAULT 0,
  experience  INTEGER NOT NULL DEFAULT 0,
  audience    JSONB NOT NULL DEFAULT '[]',
  about       TEXT,
  contact     TEXT,
  verified    BOOLEAN NOT NULL DEFAULT false,
  published   BOOLEAN NOT NULL DEFAULT true,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS tutors_user_uniq ON tutors(user_id) WHERE user_id IS NOT NULL;

-- Демо-анкеты (только если таблица пуста)
INSERT INTO tutors (name, type, avatar_url, langs, levels, country, city, district, lat, lng, format, price, rating, reviews, experience, audience, about, verified)
SELECT * FROM (VALUES
  ('Anna Müller','Репетитор','/tutors/t1.png','["Немецкий"]'::jsonb,'["A1","A2","B1","B2"]'::jsonb,'Германия','Мюнхен','Schwabing',48.137,11.575,'Оба',25,4.9,128,8,'["Взрослые","Дети"]'::jsonb,'Дипломированный преподаватель, готовлю к Goethe-Zertifikat. Тёплая атмосфера, много разговорной практики.',true),
  ('Deutsch mit Max','Репетитор','/tutors/t2.png','["Немецкий"]'::jsonb,'["A1","A2","B1"]'::jsonb,'Германия','Гамбург','Altona',53.551,9.993,'Онлайн',20,4.8,76,5,'["Дети","Подростки"]'::jsonb,'Специализируюсь на детях и подростках. Игровой подход, картинки, песни — учиться весело!',true),
  ('Sprachschule Berlin Mitte','Школа','/tutors/t3.png','["Немецкий","Английский"]'::jsonb,'["A1","A2","B1","B2","C1"]'::jsonb,'Германия','Берлин','Mitte',52.520,13.405,'Оба',18,4.7,342,15,'["Взрослые","Бизнес"]'::jsonb,'Языковая школа в центре Берлина. Группы и индивидуально, интеграционные курсы, подготовка к экзаменам.',true),
  ('Thomas Weber','Репетитор','/tutors/t4.png','["Немецкий"]'::jsonb,'["B1","B2","C1"]'::jsonb,'Германия','Франкфурт','Innenstadt',50.110,8.682,'Офлайн',35,5.0,54,20,'["Бизнес","Взрослые"]'::jsonb,'Бизнес-немецкий, деловая переписка, собеседования. 20 лет опыта, работал в корпорациях.',true),
  ('Olena Kovalenko','Репетитор','/tutors/t5.png','["Немецкий"]'::jsonb,'["A1","A2"]'::jsonb,'Германия','Кёльн','Ehrenfeld',50.937,6.960,'Онлайн',15,4.9,91,3,'["Взрослые","Начинающие"]'::jsonb,'Помогаю переехавшим освоить базовый немецкий с нуля. Объясняю на русском и украинском, поддержка в адаптации.',true),
  ('Sprachcafé Wien','Школа','/tutors/t6.png','["Немецкий"]'::jsonb,'["A1","A2","B1","B2"]'::jsonb,'Австрия','Вена','Innere Stadt',48.208,16.373,'Оба',22,4.6,210,12,'["Взрослые"]'::jsonb,'Разговорные клубы, курсы австрийского варианта немецкого, дружелюбная атмосфера кафе.',false),
  ('Lena Fischer','Репетитор','/tutors/t7.png','["Немецкий"]'::jsonb,'["A2","B1","B2"]'::jsonb,'Швейцария','Цюрих','Kreis 4',47.377,8.541,'Онлайн',40,4.8,63,10,'["Взрослые","Бизнес"]'::jsonb,'Швейцарский и стандартный немецкий, подготовка к переезду и работе в DACH-регионе.',true),
  ('Pablo Seoshkin','Репетитор','/tutors/t8.png','["Немецкий"]'::jsonb,'["A1","A2"]'::jsonb,'Германия','Мюнхен','Онлайн',48.140,11.580,'Онлайн',0,5.0,12,1,'["Дети","Начинающие"]'::jsonb,'Основатель Deutsch Lernen. Учу немецкий вместе с дочкой и сыном — тёплый семейный подход, много практики и любви.',true)
) AS v
WHERE NOT EXISTS (SELECT 1 FROM tutors);

import { readFileSync, readdirSync } from 'fs'
import { fileURLToPath } from 'url'
import { dirname, join } from 'path'
import pg from 'pg'
import { config } from '../../config.js'

const __dirname = dirname(fileURLToPath(import.meta.url))
const { Pool } = pg

async function runMigrations() {
  const pool = new Pool({ connectionString: config.databaseUrl })

  // Таблица для отслеживания выполненных миграций
  await pool.query(`
    CREATE TABLE IF NOT EXISTS schema_migrations (
      filename   VARCHAR(255) PRIMARY KEY,
      applied_at TIMESTAMPTZ DEFAULT NOW()
    )
  `)

  const files = readdirSync(__dirname)
    .filter(f => f.endsWith('.sql'))
    .sort()

  for (const file of files) {
    const { rows } = await pool.query(
      'SELECT filename FROM schema_migrations WHERE filename = $1',
      [file]
    )
    if (rows.length > 0) {
      console.log(`Пропускаем уже применённую миграцию: ${file}`)
      continue
    }

    const sql = readFileSync(join(__dirname, file), 'utf8')
    await pool.query(sql)
    await pool.query('INSERT INTO schema_migrations (filename) VALUES ($1)', [file])
    console.log(`Применена миграция: ${file}`)
  }

  await pool.end()
  console.log('Все миграции применены.')
}

export async function runMigrationsOnStartup() {
  await runMigrations()
}

// Запуск напрямую: node run.js
if (process.argv[1] === fileURLToPath(import.meta.url)) {
  runMigrations().catch(err => {
    console.error('Ошибка миграции:', err)
    process.exit(1)
  })
}

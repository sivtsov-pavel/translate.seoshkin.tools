import pg from 'pg'
import { config } from '../config.js'

const { Pool } = pg

// Единый пул соединений для всего приложения
const pool = new Pool({ connectionString: config.databaseUrl })

pool.on('error', (err) => {
  console.error('Неожиданная ошибка пула PostgreSQL:', err)
})

export const db = {
  query: (text, params) => pool.query(text, params),
  getClient: () => pool.connect(),
}

// Мини-обёртка над IndexedDB — без внешних библиотек.
// Хранилища: words (словарь), exercises (упражнения с SRS-прогрессом),
// queue (очередь ответов, накопленных офлайн), meta (служебное: время синка).

const DB_NAME = 'deutsch-offline'
const DB_VERSION = 1
let dbPromise = null

function openDb() {
  if (dbPromise) return dbPromise
  dbPromise = new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION)
    req.onupgradeneeded = () => {
      const db = req.result
      if (!db.objectStoreNames.contains('words'))     db.createObjectStore('words', { keyPath: 'id' })
      if (!db.objectStoreNames.contains('exercises')) db.createObjectStore('exercises', { keyPath: 'id' })
      if (!db.objectStoreNames.contains('queue'))     db.createObjectStore('queue', { keyPath: 'key' })
      if (!db.objectStoreNames.contains('meta'))      db.createObjectStore('meta', { keyPath: 'key' })
    }
    req.onsuccess = () => resolve(req.result)
    req.onerror   = () => reject(req.error)
  })
  return dbPromise
}

function tx(db, store, mode, fn) {
  return new Promise((resolve, reject) => {
    const t = db.transaction(store, mode)
    const s = t.objectStore(store)
    const out = fn(s)
    t.oncomplete = () => resolve(out?.result !== undefined ? out.result : undefined)
    t.onerror    = () => reject(t.error)
    t.onabort    = () => reject(t.error)
  })
}

export async function idbGetAll(store) {
  const db = await openDb()
  return new Promise((resolve, reject) => {
    const req = db.transaction(store, 'readonly').objectStore(store).getAll()
    req.onsuccess = () => resolve(req.result || [])
    req.onerror   = () => reject(req.error)
  })
}

export async function idbGet(store, key) {
  const db = await openDb()
  return new Promise((resolve, reject) => {
    const req = db.transaction(store, 'readonly').objectStore(store).get(key)
    req.onsuccess = () => resolve(req.result)
    req.onerror   = () => reject(req.error)
  })
}

export async function idbPut(store, value) {
  const db = await openDb()
  return tx(db, store, 'readwrite', s => s.put(value))
}

// Массовая запись одной транзакцией (быстро для сотен записей)
export async function idbPutAll(store, values) {
  const db = await openDb()
  return tx(db, store, 'readwrite', s => { for (const v of values) s.put(v) })
}

export async function idbClear(store) {
  const db = await openDb()
  return tx(db, store, 'readwrite', s => s.clear())
}

export async function idbDelete(store, key) {
  const db = await openDb()
  return tx(db, store, 'readwrite', s => s.delete(key))
}

export async function idbCount(store) {
  const db = await openDb()
  return new Promise((resolve, reject) => {
    const req = db.transaction(store, 'readonly').objectStore(store).count()
    req.onsuccess = () => resolve(req.result || 0)
    req.onerror   = () => reject(req.error)
  })
}

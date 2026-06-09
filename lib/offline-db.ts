const DB_NAME = 'conditioniq'
const DB_VERSION = 2
const INSPECTIONS_STORE = 'inspections'
const PHOTOS_STORE = 'photos'

let dbPromise: Promise<IDBDatabase> | null = null

function openDB(): Promise<IDBDatabase> {
  if (dbPromise) return dbPromise
  dbPromise = new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION)
    req.onupgradeneeded = e => {
      const db = (e.target as IDBOpenDBRequest).result
      if (!db.objectStoreNames.contains(INSPECTIONS_STORE)) {
        db.createObjectStore(INSPECTIONS_STORE, { keyPath: 'id' })
      }
      if (!db.objectStoreNames.contains(PHOTOS_STORE)) {
        db.createObjectStore(PHOTOS_STORE, { keyPath: 'id' })
      }
    }
    req.onsuccess = e => resolve((e.target as IDBOpenDBRequest).result)
    req.onerror = e => reject((e.target as IDBOpenDBRequest).error)
  })
  return dbPromise
}

export async function saveInspectionOffline(inspection: Record<string, any>): Promise<void> {
  const db = await openDB()
  return new Promise((resolve, reject) => {
    const tx = db.transaction(INSPECTIONS_STORE, 'readwrite')
    tx.objectStore(INSPECTIONS_STORE).put({ ...inspection, _localOnly: true, _savedAt: Date.now() })
    tx.oncomplete = () => resolve()
    tx.onerror = e => reject((e.target as IDBRequest).error)
  })
}

export async function getOfflineInspection(id: string): Promise<Record<string, any> | null> {
  const db = await openDB()
  return new Promise((resolve, reject) => {
    const req = db.transaction(INSPECTIONS_STORE, 'readonly').objectStore(INSPECTIONS_STORE).get(id)
    req.onsuccess = () => resolve(req.result ?? null)
    req.onerror = e => reject((e.target as IDBRequest).error)
  })
}

export async function getAllOfflineInspections(): Promise<Record<string, any>[]> {
  const db = await openDB()
  return new Promise((resolve, reject) => {
    const req = db.transaction(INSPECTIONS_STORE, 'readonly').objectStore(INSPECTIONS_STORE).getAll()
    req.onsuccess = () => resolve(req.result ?? [])
    req.onerror = e => reject((e.target as IDBRequest).error)
  })
}

export async function deleteOfflineInspection(id: string): Promise<void> {
  const db = await openDB()
  return new Promise((resolve, reject) => {
    const tx = db.transaction(INSPECTIONS_STORE, 'readwrite')
    tx.objectStore(INSPECTIONS_STORE).delete(id)
    tx.oncomplete = () => resolve()
    tx.onerror = e => reject((e.target as IDBRequest).error)
  })
}

export async function savePhotoOffline(id: string, blob: Blob, fieldName: string): Promise<void> {
  const db = await openDB()
  return new Promise((resolve, reject) => {
    const tx = db.transaction(PHOTOS_STORE, 'readwrite')
    tx.objectStore(PHOTOS_STORE).put({ id, blob, fieldName, savedAt: Date.now() })
    tx.oncomplete = () => resolve()
    tx.onerror = e => reject((e.target as IDBRequest).error)
  })
}

export async function getOfflinePhoto(id: string): Promise<Blob | null> {
  const db = await openDB()
  return new Promise((resolve, reject) => {
    const req = db.transaction(PHOTOS_STORE, 'readonly').objectStore(PHOTOS_STORE).get(id)
    req.onsuccess = () => resolve(req.result?.blob ?? null)
    req.onerror = e => reject((e.target as IDBRequest).error)
  })
}

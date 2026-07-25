const DB_NAME = 'arteam-printflow-files';
const DB_VERSION = 1;
const STORE_NAME = 'design-files';

function openFilesDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);
    request.onupgradeneeded = () => {
      const database = request.result;
      if (!database.objectStoreNames.contains(STORE_NAME)) database.createObjectStore(STORE_NAME);
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error ?? new Error('تعذر فتح مخزن الملفات المحلي.'));
  });
}

export async function saveDesignFile(storageKey: string, file: File): Promise<void> {
  const database = await openFilesDb();
  try {
    await new Promise<void>((resolve, reject) => {
      const transaction = database.transaction(STORE_NAME, 'readwrite');
      transaction.objectStore(STORE_NAME).put(file, storageKey);
      transaction.oncomplete = () => resolve();
      transaction.onerror = () => reject(transaction.error ?? new Error('تعذر حفظ الملف محلياً.'));
      transaction.onabort = () => reject(transaction.error ?? new Error('أُلغي حفظ الملف محلياً.'));
    });
  } finally {
    database.close();
  }
}

export async function getDesignFile(storageKey: string): Promise<File | null> {
  const database = await openFilesDb();
  try {
    return await new Promise<File | null>((resolve, reject) => {
      const transaction = database.transaction(STORE_NAME, 'readonly');
      const request = transaction.objectStore(STORE_NAME).get(storageKey);
      request.onsuccess = () => resolve(request.result instanceof File ? request.result : null);
      request.onerror = () => reject(request.error ?? new Error('تعذر قراءة الملف المحلي.'));
    });
  } finally {
    database.close();
  }
}

export async function deleteDesignFile(storageKey: string): Promise<void> {
  const database = await openFilesDb();
  try {
    await new Promise<void>((resolve, reject) => {
      const transaction = database.transaction(STORE_NAME, 'readwrite');
      transaction.objectStore(STORE_NAME).delete(storageKey);
      transaction.oncomplete = () => resolve();
      transaction.onerror = () => reject(transaction.error ?? new Error('تعذر حذف الملف المحلي.'));
    });
  } finally {
    database.close();
  }
}

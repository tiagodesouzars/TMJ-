/**
 * IndexedDB helper para persistência ultra-rápida e sem limite de 5MB de mídias do TMJ Squad
 */

const DB_NAME = 'tmj_media_db_v3';
const DB_VERSION = 1;
const VAULT_STORE = 'tmj_vault_drops';
const CHAT_STORE = 'tmj_chat_messages';

function openDB(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    if (typeof window === 'undefined' || !window.indexedDB) {
      return reject(new Error('IndexedDB não suportado'));
    }

    const request = indexedDB.open(DB_NAME, DB_VERSION);

    request.onupgradeneeded = (event) => {
      const db = (event.target as IDBOpenDBRequest).result;
      if (!db.objectStoreNames.contains(VAULT_STORE)) {
        db.createObjectStore(VAULT_STORE, { keyPath: 'id' });
      }
      if (!db.objectStoreNames.contains(CHAT_STORE)) {
        db.createObjectStore(CHAT_STORE, { keyPath: 'id' });
      }
    };

    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

/**
 * Salva drops do Vault no IndexedDB
 */
export async function saveVaultDropsToIndexedDB(drops: any[]): Promise<void> {
  try {
    const db = await openDB();
    const tx = db.transaction(VAULT_STORE, 'readwrite');
    const store = tx.objectStore(VAULT_STORE);

    // Limpa e reinsere os drops atualizados
    await new Promise<void>((resolve, reject) => {
      const clearReq = store.clear();
      clearReq.onsuccess = () => resolve();
      clearReq.onerror = () => reject(clearReq.error);
    });

    for (const drop of drops.slice(0, 50)) {
      if (drop && (drop.id || drop.docId)) {
        store.put({
          ...drop,
          id: drop.id || drop.docId
        });
      }
    }

    await new Promise<void>((resolve, reject) => {
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
  } catch (err) {
    console.warn('Aviso IndexedDB saveVaultDrops:', err);
  }
}

/**
 * Carrega drops do Vault do IndexedDB
 */
export async function loadVaultDropsFromIndexedDB(): Promise<any[]> {
  try {
    const db = await openDB();
    const tx = db.transaction(VAULT_STORE, 'readonly');
    const store = tx.objectStore(VAULT_STORE);

    return new Promise((resolve) => {
      const req = store.getAll();
      req.onsuccess = () => {
        const results = req.result || [];
        results.sort((a: any, b: any) => (b.timestamp || 0) - (a.timestamp || 0));
        resolve(results);
      };
      req.onerror = () => resolve([]);
    });
  } catch {
    return [];
  }
}

/**
 * Salva mensagens de chat no IndexedDB
 */
export async function saveChatMessagesToIndexedDB(messages: any[]): Promise<void> {
  try {
    const db = await openDB();
    const tx = db.transaction(CHAT_STORE, 'readwrite');
    const store = tx.objectStore(CHAT_STORE);

    for (const msg of messages.slice(-100)) {
      if (msg && (msg.id || msg.docId)) {
        store.put({
          ...msg,
          id: msg.id || msg.docId
        });
      }
    }

    await new Promise<void>((resolve, reject) => {
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
  } catch (err) {
    console.warn('Aviso IndexedDB saveChatMessages:', err);
  }
}

/**
 * Carrega mensagens de chat do IndexedDB
 */
export async function loadChatMessagesFromIndexedDB(): Promise<any[]> {
  try {
    const db = await openDB();
    const tx = db.transaction(CHAT_STORE, 'readonly');
    const store = tx.objectStore(CHAT_STORE);

    return new Promise((resolve) => {
      const req = store.getAll();
      req.onsuccess = () => {
        const results = req.result || [];
        results.sort((a: any, b: any) => (a.timestamp || 0) - (b.timestamp || 0));
        resolve(results);
      };
      req.onerror = () => resolve([]);
    });
  } catch {
    return [];
  }
}

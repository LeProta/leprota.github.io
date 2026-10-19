/* Partagé entre service worker et page ; jamais de PDF en cache. */
'use strict';
function openJournalDB() {
  return new Promise((resolve, reject) => {
    const r = indexedDB.open('journal-notifications', 1);
    r.onupgradeneeded = () => r.result.createObjectStore('editions', {keyPath: 'id'});
    r.onsuccess = () => resolve(r.result);
    r.onerror = () => reject(new Error('Stockage local indisponible'));
  });
}
async function journalRecords(value) {
  const db = await openJournalDB();
  try {
    return await new Promise((resolve, reject) => {
      const tx = db.transaction('editions', value ? 'readwrite' : 'readonly');
      const store = tx.objectStore('editions');
      if (value) store.put(value);
      const r = store.getAll();
      r.onsuccess = () => {
        const rows = r.result.sort((a,b) => b.receivedAt - a.receivedAt);
        if (value) for (const old of rows.slice(10)) store.delete(old.id);
      };
      tx.oncomplete = () => resolve(r.result.sort((a,b) => b.receivedAt - a.receivedAt));
      tx.onerror = tx.onabort = () => reject(new Error('Lecture locale impossible'));
    });
  } finally { db.close(); }
}
function safeJournalLink(value) {
  try {
    const u = new URL(value);
    return u.protocol === 'https:' && u.hostname === 'drive.google.com' && !u.port &&
      !u.username && !u.password && /^\/file\/d\/[A-Za-z0-9_-]{1,200}\/view$/.test(u.pathname) ? u.href : null;
  } catch { return null; }
}

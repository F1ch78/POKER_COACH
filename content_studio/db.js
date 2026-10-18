'use strict';
// Хранилище в браузере: проекты (JSON) и файлы ассетов (Blob) в IndexedDB.

const DB = (() => {
  let dbp = null;
  function open() {
    if (!dbp) dbp = new Promise((res, rej) => {
      const r = indexedDB.open('content-studio', 1);
      r.onupgradeneeded = () => {
        const d = r.result;
        if (!d.objectStoreNames.contains('projects')) d.createObjectStore('projects', { keyPath: 'id' });
        if (!d.objectStoreNames.contains('blobs')) d.createObjectStore('blobs');
      };
      r.onsuccess = () => res(r.result);
      r.onerror = () => rej(r.error);
    });
    return dbp;
  }
  async function tx(store, mode, fn) {
    const d = await open();
    return new Promise((res, rej) => {
      const t = d.transaction(store, mode);
      const req = fn(t.objectStore(store));
      t.oncomplete = () => res(req ? req.result : undefined);
      t.onerror = () => rej(t.error);
      t.onabort = () => rej(t.error);
    });
  }
  return {
    listProjects: () => tx('projects', 'readonly', s => s.getAll()),
    saveProject: p => tx('projects', 'readwrite', s => s.put(JSON.parse(JSON.stringify(p)))),
    deleteProject: id => tx('projects', 'readwrite', s => s.delete(id)),
    putBlob: (id, blob) => tx('blobs', 'readwrite', s => s.put(blob, id)),
    getBlob: id => tx('blobs', 'readonly', s => s.get(id)),
    delBlob: id => tx('blobs', 'readwrite', s => s.delete(id)),
  };
})();

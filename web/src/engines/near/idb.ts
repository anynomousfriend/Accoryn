// Minimal IndexedDB helpers shared by the engine keystore and transaction
// journal. One object store per database, out-of-line string keys, and each
// operation in its own transaction that resolves only after it commits.

export function resolveIndexedDb(factory?: IDBFactory): IDBFactory {
  const found = factory ?? (typeof indexedDB === "undefined" ? undefined : indexedDB);
  if (!found) throw new Error("This browser cannot store engine data locally.");
  return found;
}

function openDatabase(factory: IDBFactory, name: string, storeName: string): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = factory.open(name, 1);
    request.onupgradeneeded = () => {
      if (!request.result.objectStoreNames.contains(storeName)) request.result.createObjectStore(storeName);
    };
    request.onerror = () => reject(request.error);
    request.onblocked = () => reject(new Error("Local engine storage is blocked by another tab."));
    request.onsuccess = () => {
      const db = request.result;
      db.onversionchange = () => db.close();
      resolve(db);
    };
  });
}

/** Runs one request in its own transaction; resolves with its result after commit. */
export async function idbRequest<T>(
  factory: IDBFactory,
  name: string,
  storeName: string,
  mode: IDBTransactionMode,
  run: (store: IDBObjectStore) => IDBRequest<T>,
): Promise<T> {
  const db = await openDatabase(factory, name, storeName);
  return new Promise<T>((resolve, reject) => {
    let request: IDBRequest<T>;
    let tx: IDBTransaction;
    try {
      tx = db.transaction(storeName, mode, { durability: "strict" });
      request = run(tx.objectStore(storeName));
    } catch (error) {
      db.close();
      reject(error);
      return;
    }
    let settled = false;
    const fail = () => {
      if (settled) return;
      settled = true;
      db.close();
      reject(tx.error ?? request.error);
    };
    tx.oncomplete = () => {
      settled = true;
      db.close();
      resolve(request.result);
    };
    tx.onabort = fail;
    tx.onerror = fail;
  });
}

/** All [key, value] pairs of the store, values raw (callers validate). */
export async function idbEntries(factory: IDBFactory, name: string, storeName: string): Promise<Array<[string, unknown]>> {
  const db = await openDatabase(factory, name, storeName);
  return new Promise((resolve, reject) => {
    const out: Array<[string, unknown]> = [];
    let tx: IDBTransaction;
    try {
      tx = db.transaction(storeName, "readonly");
    } catch (error) {
      db.close();
      reject(error);
      return;
    }
    const cursor = tx.objectStore(storeName).openCursor();
    cursor.onsuccess = () => {
      const current = cursor.result;
      if (!current) return;
      out.push([String(current.key), current.value]);
      current.continue();
    };
    tx.oncomplete = () => {
      db.close();
      resolve(out);
    };
    tx.onabort = tx.onerror = () => {
      db.close();
      reject(tx.error);
    };
  });
}

export const isConstraintError = (error: unknown) => (error as { name?: unknown })?.name === "ConstraintError";

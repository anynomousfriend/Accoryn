import manifest from "./model-manifest.json" with { type: "json" };
import type { ObjectTemplate, ModelIdentity } from "./types.ts";
const identity = manifest.identity as ModelIdentity;
const keys = (value: Record<string, unknown>, expected: string[]) =>
  Object.keys(value).sort().join("|") === [...expected].sort().join("|");
export function validateTemplate(value: unknown): ObjectTemplate {
  const invalid = () => {
    throw new Error(
      "Stored registration is incompatible or damaged. Delete it and register the object again.",
    );
  };
  if (!value || typeof value !== "object" || Array.isArray(value))
    return invalid();
  const v = value as Record<string, unknown>;
  if (
    !keys(v, ["schemaVersion", "id", "label", "createdAt", "model", "views"]) ||
    v.schemaVersion !== 1
  )
    return invalid();
  if (
    typeof v.id !== "string" ||
    !/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
      v.id,
    )
  )
    return invalid();
  if (
    typeof v.label !== "string" ||
    v.label !== v.label.trim() ||
    v.label.length < 1 ||
    v.label.length > 60 ||
    /[\u0000-\u001f\u007f]/.test(v.label)
  )
    return invalid();
  if (
    typeof v.createdAt !== "string" ||
    !Number.isFinite(Date.parse(v.createdAt)) ||
    new Date(v.createdAt).toISOString() !== v.createdAt
  )
    return invalid();
  if (
    !v.model ||
    typeof v.model !== "object" ||
    !keys(v.model as Record<string, unknown>, Object.keys(identity))
  )
    return invalid();
  for (const k of Object.keys(identity) as (keyof ModelIdentity)[])
    if ((v.model as ModelIdentity)[k] !== identity[k]) return invalid();
  if (!Array.isArray(v.views) || v.views.length !== 3) return invalid();
  for (const vector of v.views)
    if (
      !Array.isArray(vector) ||
      vector.length !== 384 ||
      !vector.every((x) => typeof x === "number" && Number.isFinite(x)) ||
      Math.abs(Math.hypot(...vector) - 1) > 1e-4
    )
      return invalid();
  return structuredClone(value) as ObjectTemplate;
}
const canceled = () => new DOMException("Operation canceled.", "AbortError");
export class TemplateStore {
  private readonly recordKey: string;
  constructor(recordKey = "active") {
    this.recordKey = recordKey;
  }
  private connection: Promise<IDBDatabase> | null = null;
  private open(): Promise<IDBDatabase> {
    if (this.connection) return this.connection;
    this.connection = new Promise((resolve, reject) => {
      if (!globalThis.indexedDB) {
        reject(
          new Error(
            "Local storage is unavailable. Enable browser storage and retry.",
          ),
        );
        return;
      }
      const request = indexedDB.open("accoryn-object-research-v1", 1);
      let settled = false;
      request.onupgradeneeded = () => {
        if (!request.result.objectStoreNames.contains("templates"))
          request.result.createObjectStore("templates");
      };
      request.onerror = () => {
        settled = true;
        this.connection = null;
        reject(
          new Error(
            "Could not open local registration storage. Check browser settings and retry.",
          ),
        );
      };
      request.onblocked = () => {
        settled = true;
        this.connection = null;
        reject(
          new Error(
            "Close other app tabs and retry local registration storage.",
          ),
        );
      };
      request.onsuccess = () => {
        const db = request.result;
        if (settled) {
          db.close();
          return;
        }
        db.onversionchange = () => {
          db.close();
          this.connection = null;
        };
        resolve(db);
      };
    });
    return this.connection;
  }
  async read(): Promise<ObjectTemplate | null> {
    const db = await this.open();
    return new Promise((resolve, reject) => {
      const tx = db.transaction("templates", "readonly");
      const request = tx.objectStore("templates").get(this.recordKey);
      let result: unknown;
      request.onsuccess = () => {
        result = request.result;
      };
      tx.oncomplete = () => {
        try {
          resolve(result === undefined ? null : validateTemplate(result));
        } catch (e) {
          reject(e);
        }
      };
      tx.onabort = () =>
        reject(
          new Error(
            "Could not read local registration. Retry or check browser storage settings.",
          ),
        );
    });
  }
  private async write(
    value: ObjectTemplate | null,
    signal: AbortSignal,
  ): Promise<void> {
    if (signal.aborted) throw canceled();
    const db = await this.open();
    if (signal.aborted) throw canceled();
    return new Promise((resolve, reject) => {
      const tx = db.transaction("templates", "readwrite");
      const store = tx.objectStore("templates");
      const abort = () => {
        try {
          tx.abort();
        } catch {
          /* Completion already occurred; oncomplete reconciles persisted state. */
        }
      };
      signal.addEventListener("abort", abort, { once: true });
      tx.oncomplete = () => {
        signal.removeEventListener("abort", abort);
        resolve();
      };
      tx.onabort = () => {
        signal.removeEventListener("abort", abort);
        reject(
          signal.aborted
            ? canceled()
            : new Error(
                tx.error?.name === "QuotaExceededError"
                  ? "Browser storage is full. Free space and retry; the previous registration is preserved."
                  : "Could not save the local registration. Retry; the previous registration is preserved.",
              ),
        );
      };
      if (value) store.put(value, this.recordKey);
      else store.delete(this.recordKey);
    });
  }
  async save(template: ObjectTemplate, signal: AbortSignal) {
    return this.write(validateTemplate(template), signal);
  }
  async delete(signal: AbortSignal) {
    return this.write(null, signal);
  }
  close() {
    const connection = this.connection;
    this.connection = null;
    void connection?.then(
      (db) => db.close(),
      () => {},
    );
  }
}

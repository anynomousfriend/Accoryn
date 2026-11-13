import {
  idbRequest,
  resolveIndexedDb,
  isConstraintError,
} from "../near/idb.ts";
export type Operation = {
  requestId: string;
  kind: string;
  actor: string;
  receiver: string;
  args: Record<string, unknown>;
  deposit: string;
  expected?: Record<string, unknown>;
};
export interface OperationStore {
  get(id: string): Promise<unknown>;
  add(op: Operation): Promise<void>;
}
export function memoryOperationStore(): OperationStore {
  const data = new Map<string, Operation>();
  return {
    async get(id) {
      return structuredClone(data.get(id) ?? null);
    },
    async add(op) {
      if (data.has(op.requestId)) throw new Error("exists");
      data.set(op.requestId, structuredClone(op));
    },
  };
}
export function indexedOperationStore(): OperationStore {
  const factory = resolveIndexedDb();
  const db = "accoryn-app-operations-v1",
    store = "operations";
  return {
    get: (id) => idbRequest(factory, db, store, "readonly", (s) => s.get(id)),
    async add(op) {
      await idbRequest(factory, db, store, "readwrite", (s) =>
        s.add(op, op.requestId),
      );
    },
  };
}
export class Operations {
  private store: OperationStore;
  constructor(store: OperationStore) {
    this.store = store;
  }
  async isCancelled(id: string): Promise<boolean> {
    return (await this.get("!cancelled!" + id))?.kind === "cancelled";
  }
  async cancelBeforeSigning(id: string): Promise<void> {
    const original = await this.get(id);
    if (!original) throw new Error("Missing operation intent.");
    if (await this.isCancelled(id)) return;
    const marker: Operation = {
      requestId: "!cancelled!" + id,
      kind: "cancelled",
      actor: original.actor,
      receiver: original.receiver,
      args: { requestId: id },
      deposit: "0",
    };
    try {
      await this.store.add(marker);
    } catch (e) {
      if (!(await this.isCancelled(id))) throw e;
    }
  }
  async begin(op: Operation): Promise<void> {
    if (op.requestId.startsWith("!")) throw new Error("Reserved operation ID.");
    if (await this.isCancelled(op.requestId))
      throw new Error(
        "This intent was cancelled before signing. Review again using a new request.",
      );
    const previous = await this.get(op.requestId);
    if (previous) {
      if (JSON.stringify(previous) !== JSON.stringify(op))
        throw new Error("Request ID belongs to a different intent.");
      return;
    }
    try {
      await this.store.add(op);
    } catch (e) {
      const winner = await this.get(op.requestId);
      if (!winner || JSON.stringify(winner) !== JSON.stringify(op))
        throw isConstraintError(e)
          ? new Error("Request ID belongs to a different intent.")
          : e;
    }
  }
  async get(id: string): Promise<Operation | null> {
    const value = await this.store.get(id);
    if (value == null) return null;
    const v = value as Operation;
    if (
      v.requestId !== id ||
      typeof v.kind !== "string" ||
      typeof v.actor !== "string" ||
      typeof v.receiver !== "string" ||
      !v.args ||
      typeof v.args !== "object" ||
      !/^(0|[1-9][0-9]*)$/.test(v.deposit)
    )
      throw new Error("Damaged operation metadata; preserved for recovery.");
    return structuredClone(v);
  }
}

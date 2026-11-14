// Development-only discovery of public testnet IDs. Never an authentication
// source, never a signing-key store, and not bundled into the browser build.
import { readFile, writeFile, mkdir, rename, rm } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { randomUUID } from "node:crypto";
import type { IncomingMessage, ServerResponse } from "node:http";
import type { Plugin } from "vite";
import { NearRpcClient, RpcRequestError } from "../src/engines/near/rpc.ts";

const PATH = "/api/demo-users";
const validId = (id: unknown): id is string =>
  typeof id === "string" &&
  id.length <= 64 &&
  /^[a-z0-9]+(?:[-_.][a-z0-9]+)*\.testnet$/.test(id);
export function sameDemoOrigin(
  headers: Record<string, string | string[] | undefined>,
  secure: boolean,
): boolean {
  if (!headers.origin) return true;
  const authority = headers.host ?? headers[":authority"];
  if (typeof headers.origin !== "string" || typeof authority !== "string")
    return false;
  try {
    const target = new URL((secure ? "https://" : "http://") + authority);
    return (
      !target.username &&
      !target.password &&
      !target.search &&
      !target.hash &&
      target.pathname === "/" &&
      new URL(headers.origin).origin === target.origin
    );
  } catch {
    return false;
  }
}
type Directory = { version: 1; accounts: string[] };
class Refusal extends Error {
  readonly status: number;
  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
}
async function onChain(id: string): Promise<boolean> {
  try {
    await new NearRpcClient().viewAccount(id, { finality: "final" });
    return true;
  } catch (error) {
    if (error instanceof RpcRequestError && error.type === "UNKNOWN_ACCOUNT")
      return false;
    throw error;
  }
}
export function createDemoDirectory({
  file,
  verifyAccount = onChain,
  maxAccounts = 100,
}: {
  file: string;
  verifyAccount?: (id: string) => Promise<boolean>;
  maxAccounts?: number;
}) {
  let tail: Promise<unknown> = Promise.resolve();
  async function read(): Promise<Directory> {
    let source: string;
    try {
      source = await readFile(file, "utf8");
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === "ENOENT")
        return { version: 1, accounts: [] };
      throw error;
    }
    if (Buffer.byteLength(source) > 16_384)
      throw new Error("Invalid directory");
    const data = JSON.parse(source) as Directory;
    if (
      !data ||
      Object.keys(data).sort().join("|") !== "accounts|version" ||
      data.version !== 1 ||
      !Array.isArray(data.accounts) ||
      data.accounts.length > maxAccounts ||
      !data.accounts.every(validId) ||
      new Set(data.accounts).size !== data.accounts.length
    )
      throw new Error("Invalid directory");
    return { version: 1, accounts: [...data.accounts].sort() };
  }
  async function add(accountId: string) {
    const run = tail.then(async () => {
      const data = await read();
      if (data.accounts.includes(accountId)) return data;
      if (data.accounts.length >= maxAccounts)
        throw new Refusal(
          409,
          "The demo directory is full. Existing users remain available.",
        );
      if (!(await verifyAccount(accountId)))
        throw new Refusal(404, "This account is not confirmed on testnet.");
      const next: Directory = {
        version: 1,
        accounts: [...data.accounts, accountId].sort(),
      };
      await mkdir(dirname(file), { recursive: true });
      const temporary = file + "." + randomUUID() + ".tmp";
      try {
        await writeFile(temporary, JSON.stringify(next) + "\n", {
          mode: 0o600,
        });
        await rename(temporary, file);
      } finally {
        await rm(temporary, { force: true }).catch(() => {});
      }
      return next;
    });
    tail = run.catch(() => {});
    return run;
  }
  return async (req: IncomingMessage, res: ServerResponse): Promise<void> => {
    const send = (status: number, value: unknown) => {
      res.writeHead(status, {
        "Content-Type": "application/json; charset=utf-8",
        "Cache-Control": "no-store",
        "X-Content-Type-Options": "nosniff",
      });
      res.end(JSON.stringify(value));
    };
    try {
      if (new URL(req.url ?? "/", "http://localhost").pathname !== PATH) {
        send(404, { error: "Not found" });
        return;
      }
      if (req.method === "GET") {
        send(200, await read());
        return;
      }
      if (req.method !== "POST") {
        send(405, { error: "Use GET or POST." });
        return;
      }
      if (
        !sameDemoOrigin(
          req.headers,
          !!(req.socket as typeof req.socket & { encrypted?: boolean })
            .encrypted,
        )
      ) {
        send(403, { error: "Use the same demo server origin." });
        return;
      }
      if (
        !/^application\/json(?:;|$)/i.test(req.headers["content-type"] ?? "")
      ) {
        send(415, { error: "JSON is required." });
        return;
      }
      let size = 0;
      const parts: Buffer[] = [];
      for await (const part of req) {
        const bytes = Buffer.from(part);
        size += bytes.length;
        if (size <= 2048) parts.push(bytes);
      }
      if (size > 2048) {
        send(413, { error: "Request too large." });
        return;
      }
      let body: unknown;
      try {
        body = JSON.parse(Buffer.concat(parts).toString("utf8"));
      } catch {
        send(400, { error: "Invalid JSON." });
        return;
      }
      if (
        !body ||
        typeof body !== "object" ||
        Object.keys(body).join("|") !== "accountId" ||
        !validId((body as { accountId?: unknown }).accountId)
      ) {
        send(400, { error: "Only a public testnet accountId is accepted." });
        return;
      }
      send(200, await add((body as { accountId: string }).accountId));
    } catch (error) {
      if (res.destroyed || res.writableEnded) return;
      send(error instanceof Refusal ? error.status : 503, {
        error:
          error instanceof Refusal
            ? error.message
            : "Shared demo users are unavailable. Try again; existing accounts and keys are unchanged.",
      });
    }
  };
}
export function demoDirectoryPlugin(): Plugin {
  return {
    name: "local-demo-users",
    apply: "serve",
    configureServer(server) {
      const handler = createDemoDirectory({
        file: resolve(server.config.root, "../.local/demo-users.json"),
      });
      server.middlewares.use((req, res, next) => {
        if (new URL(req.url ?? "/", "http://localhost").pathname !== PATH) {
          next();
          return;
        }
        void handler(req, res);
      });
    },
  };
}

// LOCAL HTTP FIXTURE — not NEAR testnet.
//
// A node:http server on 127.0.0.1 that replays JSON-RPC/helper response shapes
// observed from real NEAR testnet endpoints on 2026-11-13. It exists only to
// exercise client-side error mapping, endpoint fallback, timeouts and polling.
// Nothing served here is evidence that a transaction or account exists.
import { createServer } from "node:http";
import type { IncomingHttpHeaders } from "node:http";
import type { AddressInfo, Socket } from "node:net";

export type FixtureRequest = {
  path: string;
  method: string;
  headers: IncomingHttpHeaders;
  body: any;
};
export type FixtureReply = {
  status?: number;
  json?: unknown;
  text?: string;
  /** Never answer (simulates a stalled endpoint). */
  hang?: boolean;
  delayMs?: number;
};
export type Fixture = {
  url: (path: string) => string;
  requests: FixtureRequest[];
  close: () => Promise<void>;
};

export async function startFixture(
  handler: (request: FixtureRequest) => FixtureReply | Promise<FixtureReply>,
): Promise<Fixture> {
  const requests: FixtureRequest[] = [];
  const sockets = new Set<Socket>();
  const server = createServer((req, res) => {
    let raw = "";
    req.setEncoding("utf8");
    req.on("data", (chunk: string) => (raw += chunk));
    req.on("end", async () => {
      let body: unknown = raw;
      try {
        body = raw ? JSON.parse(raw) : null;
      } catch {
        // keep raw text
      }
      const entry: FixtureRequest = { path: req.url ?? "/", method: req.method ?? "GET", headers: req.headers, body };
      requests.push(entry);
      const reply = await handler(entry);
      if (reply.hang) return;
      if (reply.delayMs) await new Promise((resolve) => setTimeout(resolve, reply.delayMs));
      const text = reply.text ?? (reply.json === undefined ? "" : JSON.stringify(reply.json));
      res.writeHead(reply.status ?? 200, {
        "content-type": reply.text !== undefined ? "text/plain" : "application/json",
      });
      res.end(text);
    });
  });
  server.on("connection", (socket) => {
    sockets.add(socket);
    socket.on("close", () => sockets.delete(socket));
  });
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const { port } = server.address() as AddressInfo;
  return {
    url: (path) => `http://127.0.0.1:${port}${path}`,
    requests,
    close: async () => {
      for (const socket of sockets) socket.destroy();
      await new Promise<void>((resolve) => server.close(() => resolve()));
    },
  };
}

/** JSON-RPC success envelope. */
export const ok = (id: unknown, result: unknown): FixtureReply => ({ json: { jsonrpc: "2.0", id, result } });

/** JSON-RPC HANDLER_ERROR envelope with the cause shape returned by nearcore. */
export const handlerError = (
  id: unknown,
  causeName: string,
  info: unknown = {},
  status = 200,
  data: unknown = "Server error",
): FixtureReply => ({
  status,
  json: {
    jsonrpc: "2.0",
    id,
    error: { name: "HANDLER_ERROR", cause: { name: causeName, info }, code: -32000, message: "Server error", data },
  },
});

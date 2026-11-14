export type DemoUserList = { version: 1; accounts: string[] };
export function parseDemoUsers(value: unknown): string[] {
  if (!value || typeof value !== "object")
    throw new Error("Demo list unavailable");
  const data = value as DemoUserList;
  if (
    Object.keys(data).sort().join("|") !== "accounts|version" ||
    data.version !== 1 ||
    !Array.isArray(data.accounts) ||
    data.accounts.length > 100 ||
    !data.accounts.every(
      (id) =>
        typeof id === "string" &&
        id.length <= 64 &&
        /^[a-z0-9]+(?:[-_.][a-z0-9]+)*\.testnet$/.test(id),
    ) ||
    new Set(data.accounts).size !== data.accounts.length
  )
    throw new Error("Demo list unavailable");
  return [...data.accounts].sort();
}
export async function fetchDemoUsers(signal?: AbortSignal): Promise<string[]> {
  const response = await fetch("/api/demo-users", {
    signal: signal
      ? AbortSignal.any([signal, AbortSignal.timeout(8000)])
      : AbortSignal.timeout(8000),
    cache: "no-store",
    redirect: "error",
  });
  if (!response.ok) throw new Error("Demo list unavailable");
  return parseDemoUsers(await response.json());
}
export async function publishDemoUser(
  accountId: string,
  signal?: AbortSignal,
): Promise<string[]> {
  const response = await fetch("/api/demo-users", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ accountId }),
    signal: signal ?? AbortSignal.timeout(20000),
    redirect: "error",
  });
  if (!response.ok) throw new Error("Demo publication unavailable");
  return parseDemoUsers(await response.json());
}

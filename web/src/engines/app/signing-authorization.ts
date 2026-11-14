import type { JournalSigner } from "../near/txjournal.ts";
export function guardedSigner(
  signer: JournalSigner,
  authorize: () => Promise<void>,
  signal: AbortSignal,
): JournalSigner {
  return {
    getPublicKey: () => signer.getPublicKey(),
    signTransaction: async (transaction) => {
      signal.throwIfAborted();
      await authorize();
      signal.throwIfAborted();
      return signer.signTransaction(transaction);
    },
  };
}

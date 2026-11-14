/** A financial intent must target the same vault the user is reviewing. */
export function loadedVaultId(
  loaded: { id: string } | null,
  requestedId: string,
): string {
  if (!loaded || loaded.id !== requestedId)
    throw new Error("Load and review this vault before funding it.");
  return loaded.id;
}

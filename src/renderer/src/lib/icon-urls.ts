/** URL of the auto-extracted PNG cached by main at userData/icons/<buttonId>.png. */
export function autoIconUrl(buttonId: string): string {
  return `deckicon://${buttonId}.png`;
}

/** URL of the user-supplied image copied by main to userData/icons/<buttonId>-custom.<ext>. */
export function customIconUrl(buttonId: string, sourcePath: string): string {
  const dot = sourcePath.lastIndexOf('.');
  const ext = dot >= 0 ? sourcePath.slice(dot).toLowerCase() : '';
  return `deckicon://${buttonId}-custom${ext}`;
}

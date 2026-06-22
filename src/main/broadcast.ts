export interface WebContentsLike {
  isDestroyed(): boolean;
  send(channel: string, payload: unknown): void;
}

/** Fan a push event out to every live target. */
export function broadcastToWebContents(
  targets: WebContentsLike[],
  channel: string,
  payload: unknown
): void {
  for (const t of targets) {
    if (!t.isDestroyed()) t.send(channel, payload);
  }
}

export interface WebContentsLike {
  isDestroyed(): boolean;
  send(channel: string, payload: unknown): void;
}

export interface WindowLike {
  isDestroyed(): boolean;
  readonly webContents: WebContentsLike;
}

/** Map windows to their webContents, skipping destroyed windows WITHOUT dereferencing their webContents. */
export function liveWebContents(windows: WindowLike[]): WebContentsLike[] {
  return windows.filter((w) => !w.isDestroyed()).map((w) => w.webContents);
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

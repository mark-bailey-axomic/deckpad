import type { DialogView } from '@shared/types';

export interface WinHandle {
  isDestroyed(): boolean;
}

interface Record_ {
  id: string;
  view: DialogView;
  win: WinHandle;
  payload: unknown;
}

/** Tracks open dialog windows (one per view) and their stashed payloads. */
export class DialogStore {
  private byView = new Map<DialogView, Record_>();
  private byId = new Map<string, Record_>();

  constructor(private genId: () => string) {}

  open(view: DialogView, win: WinHandle, payload: unknown): string {
    const existing = this.byView.get(view);
    if (existing) this.byId.delete(existing.id);
    const id = this.genId();
    const rec: Record_ = { id, view, win, payload };
    this.byView.set(view, rec);
    this.byId.set(id, rec);
    return id;
  }

  payloadFor(id: string): unknown | undefined {
    return this.byId.get(id)?.payload;
  }

  windowForView(view: DialogView): WinHandle | undefined {
    return this.byView.get(view)?.win;
  }

  viewForId(id: string): DialogView | undefined {
    return this.byId.get(id)?.view;
  }

  /** Updates the payload for the given view. No-op if no window is currently open for this view (intentional). */
  setPayloadForView(view: DialogView, payload: unknown): void {
    const rec = this.byView.get(view);
    if (rec) rec.payload = payload;
  }

  close(id: string): WinHandle | undefined {
    const rec = this.byId.get(id);
    if (!rec) return undefined;
    this.byId.delete(id);
    this.byView.delete(rec.view);
    return rec.win;
  }

  idForView(view: DialogView): string | undefined {
    return this.byView.get(view)?.id;
  }

  allWindows(): WinHandle[] {
    return [...this.byView.values()].map((r) => r.win);
  }
}

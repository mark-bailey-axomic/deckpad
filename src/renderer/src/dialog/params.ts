import type { DialogView } from '@shared/types';

const VALID_VIEWS: readonly DialogView[] = ['edit', 'settings', 'activity'];

function isDialogView(v: string): v is DialogView {
  return (VALID_VIEWS as readonly string[]).includes(v);
}

export function parseDialogParams(search: string): { view: DialogView; id: string } | null {
  const params = new URLSearchParams(search);
  const view = params.get('view');
  const id = params.get('id');
  if (!view || !isDialogView(view)) return null;
  if (!id) return null;
  return { view, id };
}

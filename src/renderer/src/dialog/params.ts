import type { DialogView } from '@shared/types';

const VALID_VIEWS = new Set<string>(['edit', 'settings', 'activity']);

export function parseDialogParams(search: string): { view: DialogView; id: string } | null {
  const params = new URLSearchParams(search);
  const view = params.get('view');
  const id = params.get('id');
  if (!view || !VALID_VIEWS.has(view)) return null;
  if (!id) return null;
  return { view: view as DialogView, id };
}

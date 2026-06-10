import type { ReactElement } from 'react';
import { DeckIcon } from './DeckIcon';

export interface MenuState { x: number; y: number; index: number }
export interface ContextMenuProps {
  menu: MenuState | null;
  onEdit: () => void;
  onDuplicate: () => void;
  onDelete: () => void;
}

export function ContextMenu({ menu, onEdit, onDuplicate, onDelete }: ContextMenuProps): ReactElement | null {
  if (!menu) return null;
  return (
    <div className="dp-menu" style={{ left: menu.x, top: menu.y }}>
      <button className="dp-menu-item" onClick={onEdit}><DeckIcon name="pencil" size={16} /> Edit</button>
      <button className="dp-menu-item" onClick={onDuplicate}><DeckIcon name="copy" size={16} /> Duplicate</button>
      <div className="dp-menu-sep" />
      <button className="dp-menu-item is-danger" onClick={onDelete}><DeckIcon name="trash" size={16} /> Delete</button>
    </div>
  );
}

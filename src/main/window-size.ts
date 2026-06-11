import { BAR_H, GAP, KEY_SIZE, PAD, TABS_H } from '@shared/constants';

/** Prototype sizing formula — the window IS the deck, no user resizing. */
export function windowSizeForGrid(cols: number, rows: number): { width: number; height: number } {
  return {
    width: PAD * 2 + cols * KEY_SIZE + (cols - 1) * GAP,
    height: BAR_H + TABS_H + PAD * 2 + rows * KEY_SIZE + (rows - 1) * GAP
  };
}

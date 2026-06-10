import type { DeckApi } from '@shared/types';
import { createMockDeck } from './deck-mock';

declare global {
  interface Window {
    deck?: DeckApi;
  }
}

let fallback: DeckApi | null = null;

/** Real preload bridge when present (Phase 4+); in-memory mock in tests/browser dev. */
export function getDeck(): DeckApi {
  if (window.deck) return window.deck;
  fallback ??= createMockDeck();
  return fallback;
}

import { describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import type { DeckApi } from '@shared/types';
import { DialogHost } from './DialogHost';
import type { EditPayload } from './messages';

function mockDeck(payload: unknown): DeckApi {
  return {
    openDialog: vi.fn(), getDialogPayload: vi.fn(async () => payload),
    sendDialogMessage: vi.fn(async () => undefined), closeDialog: vi.fn(async () => undefined),
    updateDialog: vi.fn(), onDialogMessage: () => () => undefined,
    onDialogUpdate: () => () => undefined,
    pickFile: vi.fn(async () => null), extractIcon: vi.fn(async () => null)
  } as unknown as DeckApi;
}

const editPayload: EditPayload = {
  draft: { id: 'b1', isNew: false, label: 'Hello', type: 'command', command: 'echo hi', cwd: '', showTerminal: false, path: '', icon: { kind: 'auto' } },
  index: 3, accent: '#34D399', surface: 'near-black'
};

describe('DialogHost', () => {
  it('fetches its payload and renders the edit view', async () => {
    const deck = mockDeck(editPayload);
    render(<DialogHost view="edit" id="id-1" deck={deck} />);
    expect(deck.getDialogPayload).toHaveBeenCalledWith('id-1');
    await waitFor(() => expect(screen.getByDisplayValue('Hello')).toBeInTheDocument());
  });

  it('renders nothing for an unknown view', async () => {
    const deck = mockDeck({ accent: '#000000', surface: 'near-black' });
    render(<DialogHost view={'unknown' as unknown as import('@shared/types').DialogView} id="id-x" deck={deck} />);
    await waitFor(() => expect(deck.getDialogPayload).toHaveBeenCalledWith('id-x'));
    expect(screen.queryByRole('dialog')).toBeNull();
    expect(screen.queryByDisplayValue('Hello')).toBeNull();
  });

  it('save sends a save message then asks to close', async () => {
    const deck = mockDeck(editPayload);
    render(<DialogHost view="edit" id="id-1" deck={deck} />);
    await waitFor(() => screen.getByDisplayValue('Hello'));
    // EditModal's save button text is "Save action" — /save/i matches it
    fireEvent.click(screen.getByRole('button', { name: /save/i }));
    await waitFor(() => {
      expect(deck.sendDialogMessage).toHaveBeenCalledWith('id-1', expect.objectContaining({ type: 'save', index: 3 }));
      expect(deck.closeDialog).toHaveBeenCalledWith('id-1');
    });
  });
});

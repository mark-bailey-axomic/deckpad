import { describe, expect, it, vi } from 'vitest';
import { act, render, screen, waitFor, fireEvent } from '@testing-library/react';
import type { DeckApi } from '@shared/types';
import { DialogHost } from './DialogHost';
import type { EditPayload, ActivityPayload } from './messages';
import type { ActivityItem } from '../components/ActivityPanel';

function mockDeck(payload: unknown): DeckApi {
  return {
    openDialog: vi.fn(), getDialogPayload: vi.fn(async () => payload),
    sendDialogMessage: vi.fn(async () => undefined), closeDialog: vi.fn(async () => undefined),
    updateDialog: vi.fn(), onDialogMessage: () => () => undefined,
    onDialogUpdate: () => () => undefined,
    pickFile: vi.fn(async () => null), extractIcon: vi.fn(async () => null)
  } as unknown as DeckApi;
}

/** Build a mockDeck that captures the onDialogUpdate callback so the test can fire it. */
function mockDeckWithUpdateCapture(payload: unknown): {
  deck: DeckApi;
  fireUpdate: (p: unknown) => void;
} {
  let captured: ((p: unknown) => void) | undefined;
  const deck = {
    openDialog: vi.fn(), getDialogPayload: vi.fn(async () => payload),
    sendDialogMessage: vi.fn(async () => undefined), closeDialog: vi.fn(async () => undefined),
    updateDialog: vi.fn(), onDialogMessage: () => () => undefined,
    onDialogUpdate: (cb: (p: unknown) => void) => {
      captured = cb;
      return () => { captured = undefined; };
    },
    pickFile: vi.fn(async () => null), extractIcon: vi.fn(async () => null)
  } as unknown as DeckApi;
  return {
    deck,
    fireUpdate: (p: unknown) => {
      if (captured) captured(p);
    }
  };
}

const editPayload: EditPayload = {
  draft: { id: 'b1', isNew: false, label: 'Hello', type: 'command', command: 'echo hi', cwd: '', showTerminal: false, path: '', icon: { kind: 'auto' } },
  index: 3, accent: '#34D399', surface: 'near-black'
};

const emptyActivityPayload: ActivityPayload = {
  items: [], now: Date.now(), accent: '#34D399', surface: 'near-black'
};

describe('DialogHost', () => {
  it('fetches its payload and renders the edit view', async () => {
    const deck = mockDeck(editPayload);
    render(<DialogHost view="edit" id="id-1" deck={deck} />);
    expect(deck.getDialogPayload).toHaveBeenCalledWith('id-1');
    await waitFor(() => expect(screen.getByDisplayValue('Hello')).toBeInTheDocument());
  });

  it('renders nothing for an unknown view', async () => {
    const { container } = render(
      <DialogHost view={'unknown' as unknown as import('@shared/types').DialogView} id="id-x" deck={mockDeck({ accent: '#000000', surface: 'near-black' })} />
    );
    // Wait for getDialogPayload to resolve so the dp-dialog-window div is present.
    await waitFor(() => expect(container.querySelector('.dp-dialog-window')).not.toBeNull());
    // The wrapper must be present but must contain no child elements — no modal/settings/activity rendered.
    expect(container.querySelector('.dp-dialog-window')!.children).toHaveLength(0);
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

  it('activity view re-renders live when onDialogUpdate fires', async () => {
    const { deck, fireUpdate } = mockDeckWithUpdateCapture(emptyActivityPayload);
    render(<DialogHost view="activity" id="id-a" deck={deck} />);

    // Wait for initial render — empty list shows placeholder text.
    await waitFor(() => expect(screen.getByText(/nothing running/i)).toBeInTheDocument());

    // Build a new payload with one running ActivityItem whose label is "LiveUpdate".
    const liveItem: ActivityItem = {
      button: { id: 'btn-live', label: 'LiveUpdate', type: 'command', command: 'echo live', cwd: '', showTerminal: false, path: '', icon: { kind: 'auto' } },
      groupName: 'G',
      state: 'running',
      startedAt: Date.now(),
      log: []
    };
    const updatedPayload: ActivityPayload = { items: [liveItem], now: Date.now(), accent: '#34D399', surface: 'near-black' };

    await act(async () => { fireUpdate(updatedPayload); });

    expect(await screen.findByText('LiveUpdate')).toBeInTheDocument();
  });
});

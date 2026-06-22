import { describe, expect, it, vi } from 'vitest';
import { act, render, screen, waitFor, fireEvent } from '@testing-library/react';
import type { DeckApi } from '@shared/types';
import { DialogHost } from './DialogHost';
import type { EditPayload, ActivityPayload, SettingsPayload } from './messages';
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
    // sendDialogMessage must have been invoked BEFORE closeDialog
    expect((deck.sendDialogMessage as any).mock.invocationCallOrder[0])
      .toBeLessThan((deck.closeDialog as any).mock.invocationCallOrder[0]);
  });

  it('settings view re-renders and sends patch when a toggle is clicked', async () => {
    const settingsPayload: SettingsPayload = {
      settings: {
        cols: 4, rows: 3, accent: '#34D399', surface: 'near-black',
        showLabels: false, launchStartup: false, alwaysOnTop: false,
        settingsInWindow: false, activityInWindow: false,
      },
      accent: '#34D399',
      surface: 'near-black',
    };
    const deck = mockDeck(settingsPayload);
    render(<DialogHost view="settings" id="id-s" deck={deck} />);

    // Wait for the Settings component to appear
    await waitFor(() => expect(screen.getByText('Show labels')).toBeInTheDocument());

    // ToggleRow renders as a <button> with the label as text.
    // The switch span carries 'is-on' class when value=true; initially showLabels=false.
    const toggleBtn = screen.getByRole('button', { name: /show labels/i });
    expect(toggleBtn.querySelector('.dp-switch')).not.toHaveClass('is-on');

    // Click → should toggle to true
    fireEvent.click(toggleBtn);

    // (a) sendDialogMessage called with settings-change patch
    await waitFor(() => {
      expect(deck.sendDialogMessage).toHaveBeenCalledWith('id-s', {
        type: 'settings-change',
        patch: { showLabels: true },
      });
    });

    // (b) the switch now reflects toggled value (window re-rendered)
    expect(toggleBtn.querySelector('.dp-switch')).toHaveClass('is-on');
  });

  it('null payload renders "Dialog unavailable." fallback without throwing', async () => {
    const deck = mockDeck(null);
    render(<DialogHost view="edit" id="id-null" deck={deck} />);
    expect(await screen.findByText(/dialog unavailable/i)).toBeInTheDocument();
    // Must not render any edit/settings/activity child
    expect(screen.queryByRole('textbox')).toBeNull();
  });

  it('rejected getDialogPayload renders "Dialog unavailable." fallback', async () => {
    const deck: DeckApi = {
      openDialog: vi.fn(), getDialogPayload: vi.fn(async () => { throw new Error('boom'); }),
      sendDialogMessage: vi.fn(async () => undefined), closeDialog: vi.fn(async () => undefined),
      updateDialog: vi.fn(), onDialogMessage: () => () => undefined,
      onDialogUpdate: () => () => undefined,
      pickFile: vi.fn(async () => null), extractIcon: vi.fn(async () => null)
    } as unknown as DeckApi;
    render(<DialogHost view="edit" id="id-err" deck={deck} />);
    expect(await screen.findByText(/dialog unavailable/i)).toBeInTheDocument();
    expect(screen.queryByRole('textbox')).toBeNull();
  });

  it('sendDialogMessage rejection routes to "Dialog unavailable." and does not produce unhandled rejection', async () => {
    const deck = mockDeck(editPayload);
    (deck.sendDialogMessage as ReturnType<typeof vi.fn>).mockRejectedValue(new Error('ipc error'));

    const unhandledHandler = vi.fn();
    window.addEventListener('unhandledrejection', unhandledHandler);

    render(<DialogHost view="edit" id="id-ipc" deck={deck} />);
    await waitFor(() => screen.getByDisplayValue('Hello'));

    fireEvent.click(screen.getByRole('button', { name: /save/i }));

    expect(await screen.findByText(/dialog unavailable/i)).toBeInTheDocument();
    expect(unhandledHandler).not.toHaveBeenCalled();

    window.removeEventListener('unhandledrejection', unhandledHandler);
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

import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { StrictMode } from 'react';
import { App } from './App';
import { getDeck } from './lib/deck';
import type { Button } from '@shared/types';

vi.mock('./lib/deck', async () => {
  const { createMockDeck } = await import('./lib/deck-mock');
  const deck = createMockDeck();
  return { getDeck: () => deck };
});

const button = (id: string, label: string): Button => ({
  id, label, type: 'command', command: 'true', icon: { kind: 'auto' }
});

/** Fully resets the mock config (grid + single 'Actions' group) so tests stay isolated. */
async function seedConfig(slots: (Button | null)[] = []) {
  const deck = getDeck();
  const cfg = await deck.getConfig();
  cfg.grid = { cols: 4, rows: 3 };
  cfg.groups = [{ id: 'g1', name: 'Actions', slots: [...slots, ...Array(12 - slots.length).fill(null)] }];
  await deck.saveConfig(cfg);
}

describe('App shell', () => {
  beforeEach(async () => {
    await seedConfig([button('b1', 'Dev Server')]);
  });

  it('renders brand, grid of cols×rows keys, and the action count', async () => {
    render(<App />);
    expect(await screen.findByText('DeckPad')).toBeInTheDocument();
    await waitFor(() => expect(document.querySelectorAll('.dp-key')).toHaveLength(12));
    expect(screen.getByText('1 action')).toBeInTheDocument();
    expect(screen.getByText('4×3')).toBeInTheDocument();
  });

  it('clicking an empty slot opens the Add action modal; Esc closes it without confirmation', async () => {
    render(<App />);
    await screen.findByText('Dev Server');
    fireEvent.click(document.querySelectorAll('.dp-key--empty')[0]);
    expect(screen.getByText('Add action')).toBeInTheDocument();
    fireEvent.keyDown(document, { key: 'Escape' });
    expect(screen.queryByText('Add action')).toBeNull();
  });

  it('saving a new action persists it via deck.saveConfig', async () => {
    render(<App />);
    await screen.findByText('Dev Server');
    fireEvent.click(document.querySelectorAll('.dp-key--empty')[0]);
    fireEvent.change(screen.getByPlaceholderText('e.g. Dev Server'), { target: { value: 'Deploy' } });
    fireEvent.change(screen.getByPlaceholderText('npm run dev'), { target: { value: './deploy.sh' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save action' }));
    await screen.findByText('Deploy');
    const persisted = await getDeck().getConfig();
    expect(persisted.groups[0].slots.filter(Boolean).map((b) => b!.label)).toContain('Deploy');
  });

  it('right-click on a filled key opens the context menu with Edit/Duplicate/Delete', async () => {
    render(<App />);
    const key = (await screen.findByText('Dev Server')).closest('.dp-key')!;
    fireEvent.contextMenu(key);
    expect(screen.getByText('Edit')).toBeInTheDocument();
    expect(screen.getByText('Duplicate')).toBeInTheDocument();
    expect(screen.getByText('Delete')).toBeInTheDocument();
  });

  it('pencil toggles edit mode (is-edit on filled keys)', async () => {
    render(<App />);
    await screen.findByText('Dev Server');
    fireEvent.click(screen.getByTitle('Edit layout'));
    expect(document.querySelector('.dp-key--filled.is-edit')).toBeInTheDocument();
  });

  it('shows the running pill and tab dot while an action runs', async () => {
    vi.useFakeTimers();
    render(<App />);
    await vi.waitFor(() => expect(document.querySelector('.dp-key--filled')).toBeTruthy());
    fireEvent.click(document.querySelector('.dp-key--filled')!);
    await vi.advanceTimersByTimeAsync(600); // mock deck: started at 200ms + 300ms reveal
    expect(screen.getByText('1 running')).toBeInTheDocument();
    expect(document.querySelector('.dp-tab-dot')).toBeInTheDocument();
    fireEvent.click(screen.getByText('1 running'));
    expect(document.querySelector('.dp-panel.is-open')).toBeInTheDocument();
    vi.useRealTimers();
  });

  it('adds a group with + and switches tabs', async () => {
    render(<App />);
    await screen.findByText('Dev Server');
    fireEvent.click(screen.getByTitle('New group'));
    expect(screen.getByText('Group 2')).toBeInTheDocument();
    await waitFor(async () => {
      const cfg = await getDeck().getConfig();
      expect(cfg.groups).toHaveLength(2);
    });
  });
});

// ---------------------------------------------------------------------------
// Phase 3 review findings — all tests below should be RED until fixed
// ---------------------------------------------------------------------------

describe('App — StrictMode purity (double-invoke)', () => {
  let saveConfigSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(async () => {
    await seedConfig([]);
    saveConfigSpy = vi.spyOn(getDeck(), 'saveConfig');
    saveConfigSpy.mockClear();
  });

  afterEach(() => {
    saveConfigSpy.mockRestore();
  });

  it('addGroup calls saveConfig exactly once and the persisted group id matches the tab', async () => {
    render(
      <StrictMode>
        <App />
      </StrictMode>
    );
    await screen.findByText('Actions'); // config loaded

    // Clear any calls from the initial getConfig/render cycle
    saveConfigSpy.mockClear();

    fireEvent.click(screen.getByTitle('New group'));

    // Wait for the new tab to appear
    await screen.findByText('Group 2');

    // Should be exactly 1 saveConfig call for this one mutation
    expect(saveConfigSpy).toHaveBeenCalledTimes(1);

    // The persisted group id must equal the id rendered in the DOM
    const cfg = await getDeck().getConfig();
    const persistedGroup = cfg.groups.find((g) => g.name === 'Group 2');
    expect(persistedGroup).toBeDefined();

    // The saved config should have a single consistent id for Group 2
    const savedArg = saveConfigSpy.mock.calls[0][0];
    const savedGroup = savedArg.groups.find((g: { name: string }) => g.name === 'Group 2');
    expect(savedGroup?.id).toBe(persistedGroup!.id);
  });
});

describe('App — save failure surfaces a toast', () => {
  let saveConfigSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(async () => {
    await seedConfig([]);
    saveConfigSpy = vi.spyOn(getDeck(), 'saveConfig');
  });

  afterEach(() => {
    saveConfigSpy.mockRestore();
  });

  it('shows an info toast instead of an unhandled rejection when saveConfig rejects', async () => {
    // Make the first save (from addGroup) reject
    saveConfigSpy.mockRejectedValueOnce(new Error('disk full'));

    render(<App />);
    await screen.findByText('Actions');

    fireEvent.click(screen.getByTitle('New group'));

    // A toast (role="status") should appear instead of an unhandled rejection
    await waitFor(() => expect(screen.getByRole('status')).toBeInTheDocument());
  });
});

describe('App — deleting a running button stops it and clears the pill', () => {
  let stopActionSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(async () => {
    await seedConfig([button('run1', 'LongJob')]);
    stopActionSpy = vi.spyOn(getDeck(), 'stopAction');
  });

  afterEach(() => {
    stopActionSpy.mockRestore();
    vi.useRealTimers();
  });

  it('right-click → Delete calls stopAction and removes the running pill', async () => {
    vi.useFakeTimers();

    render(<App />);
    await vi.waitFor(() => expect(screen.queryByText('LongJob')).toBeTruthy());

    // Find the filled key before clicking (label still shows while idle)
    const filledKey = document.querySelector('.dp-key--filled')!;
    expect(filledKey).toBeTruthy();

    // Click the button to start it running
    fireEvent.click(filledKey);
    await vi.advanceTimersByTimeAsync(600); // started (200 ms) + reveal (300 ms) + buffer

    expect(screen.getByText('1 running')).toBeInTheDocument();

    // Right-click the running key (label replaced by timer when running, use the key element directly)
    fireEvent.contextMenu(filledKey);
    expect(screen.getByText('Delete')).toBeInTheDocument();

    fireEvent.click(screen.getByText('Delete'));

    // stopAction should have been called for the button that was running
    expect(stopActionSpy).toHaveBeenCalledWith('run1');

    // Running pill should disappear
    await vi.waitFor(() => expect(screen.queryByText('1 running')).toBeNull());
  });
});

import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi, type MockInstance } from 'vitest';
import { StrictMode } from 'react';
import { App } from './App';
import { getDeck } from './lib/deck';
import type { Button, DeckApi } from '@shared/types';

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
  const deck = getDeck() as ReturnType<typeof import('./lib/deck-mock').createMockDeck>;
  const cfg = await deck.getConfig();
  cfg.grid = { cols: 4, rows: 3 };
  const capacity = cfg.grid.cols * cfg.grid.rows;
  cfg.groups = [{ id: 'g1', name: 'Actions', slots: [...slots, ...Array(Math.max(0, capacity - slots.length)).fill(null)] }];
  await deck.saveConfig(cfg);
}

beforeEach(() => {
  const deck = getDeck() as ReturnType<typeof import('./lib/deck-mock').createMockDeck>;
  deck.__reset();
});

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
    // Drain the mock's pending exit timer (fires at 200+1800=2000ms) so it doesn't
    // leak a running entry into the singleton mock for subsequent tests.
    await vi.advanceTimersByTimeAsync(2000);
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
  let saveConfigSpy: MockInstance<DeckApi['saveConfig']>;

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
    const savedGroup = savedArg.groups.find((g) => g.name === 'Group 2');
    expect(savedGroup?.id).toBe(persistedGroup!.id);
  });
});

describe('App — save failure surfaces a toast', () => {
  let saveConfigSpy: MockInstance<DeckApi['saveConfig']>;

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
  let stopActionSpy: MockInstance<DeckApi['stopAction']>;

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

describe('drag reorder + grid resize', () => {
  it('drag in edit mode performs insert/shift reorder and persists', async () => {
    await seedConfig([button('b1', 'One'), button('b2', 'Two'), button('b3', 'Three')]);
    render(<App />);
    await screen.findByText('One');
    fireEvent.click(screen.getByTitle('Edit layout'));
    const keys = document.querySelectorAll('.dp-key');
    fireEvent.dragStart(keys[0]);
    fireEvent.dragOver(keys[2]);
    fireEvent.drop(keys[2]);
    await waitFor(async () => {
      const cfg = await getDeck().getConfig();
      expect(cfg.groups[0].slots.slice(0, 3).map((s) => s?.label)).toEqual(['Two', 'Three', 'One']);
    });
  });

  it('grid shrink that loses buttons asks for confirmation naming the count', async () => {
    const labels = Array.from({ length: 8 }, (_, i) => button(`b${i}`, `B${i}`));
    await seedConfig(labels);
    const confirmSpy = vi.spyOn(window, 'confirm').mockReturnValue(false);
    render(<App />);
    await screen.findByText('B0');
    fireEvent.click(screen.getByTitle('Grid size'));
    // shrink rows 3 → 2 (capacity 12 → 8 keeps all) then cols 4 → 3 (capacity 6 < 8 filled)
    fireEvent.click(screen.getAllByRole('button', { name: 'Decrease' })[1]);
    fireEvent.click(screen.getAllByRole('button', { name: 'Decrease' })[0]);
    expect(confirmSpy).toHaveBeenCalledWith(expect.stringContaining('2 button'));
    // cancelled → grid unchanged
    const cfg = await getDeck().getConfig();
    expect(cfg.grid).toEqual({ cols: 4, rows: 2 });
    confirmSpy.mockRestore();
  });

  it('confirmed shrink compacts and persists the new grid', async () => {
    await seedConfig([button('b1', 'One')]);
    vi.spyOn(window, 'confirm').mockReturnValue(true);
    render(<App />);
    await screen.findByText('One');
    fireEvent.click(screen.getByTitle('Grid size'));
    fireEvent.click(screen.getAllByRole('button', { name: 'Decrease' })[0]); // cols 4 → 3
    await waitFor(async () => {
      const cfg = await getDeck().getConfig();
      expect(cfg.grid.cols).toBe(3);
      expect(cfg.groups[0].slots).toHaveLength(9);
    });
  });

  it('cancelled drag (dragStart then dragEnd without drop) resets state and does not reorder', async () => {
    await seedConfig([button('b1', 'A'), button('b2', 'B'), button('b3', 'C')]);
    const deck = getDeck();
    const saveConfigSpy = vi.spyOn(deck, 'saveConfig');
    render(<App />);
    await screen.findByText('A');

    // enable edit mode so dragging is active
    fireEvent.click(screen.getByTitle('Edit layout'));

    const keys = document.querySelectorAll('.dp-key');
    // drag starts on key A (index 0)
    fireEvent.dragStart(keys[0]);

    // dragEnd fires (e.g. user releases outside any drop target) without a drop
    fireEvent.dragEnd(keys[0]);

    // now drop on key B (index 1) — should be inert since dragFrom was cleared
    fireEvent.drop(keys[1]);

    // config must be unchanged: A, B, C still in order
    const cfg = await getDeck().getConfig();
    expect(cfg.groups[0].slots.slice(0, 3).map((s) => s?.label)).toEqual(['A', 'B', 'C']);

    // saveConfig must not have been called for a reorder (only the initial seedConfig save is prior)
    saveConfigSpy.mockClear(); // clear any prior calls
    fireEvent.drop(keys[1]); // fire again — still inert
    expect(saveConfigSpy).not.toHaveBeenCalled();

    // no .is-dragover class should remain anywhere
    expect(document.querySelector('.is-dragover')).toBeNull();

    saveConfigSpy.mockRestore();
  });

  it('external (OS file) drag is inert: dragOver + drop without prior dragStart does not reorder or crash', async () => {
    await seedConfig([button('b1', 'A'), button('b2', 'B')]);
    const deck = getDeck();
    const saveConfigSpy = vi.spyOn(deck, 'saveConfig');
    render(<App />);
    await screen.findByText('A');

    // enable edit mode
    fireEvent.click(screen.getByTitle('Edit layout'));

    const keys = document.querySelectorAll('.dp-key');
    // No dragStart on any key — simulate an OS file being dragged over
    fireEvent.dragOver(keys[1]);
    fireEvent.drop(keys[1]);

    // config must be unchanged
    const cfg = await getDeck().getConfig();
    expect(cfg.groups[0].slots.slice(0, 2).map((s) => s?.label)).toEqual(['A', 'B']);

    // no reorder save
    expect(saveConfigSpy).not.toHaveBeenCalled();

    // no .is-dragover stuck on any element
    expect(document.querySelector('.is-dragover')).toBeNull();

    saveConfigSpy.mockRestore();
  });
});

describe('duplicate + groups', () => {
  beforeEach(async () => {
    await seedConfig([button('b1', 'One')]);
  });

  it('duplicate places a copy with a NEW id in the first empty slot', async () => {
    await seedConfig([button('b1', 'One'), null, button('b3', 'Three')]);
    render(<App />);
    const key = (await screen.findByText('One')).closest('.dp-key')!;
    fireEvent.contextMenu(key);
    fireEvent.click(screen.getByText('Duplicate'));
    await waitFor(async () => {
      const cfg = await getDeck().getConfig();
      const copy = cfg.groups[0].slots[1];
      expect(copy?.label).toBe('One');
      expect(copy?.id).not.toBe('b1');
    });
  });

  it('duplicate on a full grid shows the info toast instead', async () => {
    await seedConfig(Array.from({ length: 12 }, (_, i) => button(`b${i}`, `B${i}`)));
    render(<App />);
    const key = (await screen.findByText('B0')).closest('.dp-key')!;
    fireEvent.contextMenu(key);
    fireEvent.click(screen.getByText('Duplicate'));
    expect(await screen.findByText(/no empty slot/i)).toBeInTheDocument();
  });

  it('double-click renames a group; empty name becomes Untitled', async () => {
    render(<App />);
    const tab = await screen.findByText('Actions');
    fireEvent.doubleClick(tab);
    const input = document.querySelector('.dp-tab-input') as HTMLInputElement;
    fireEvent.change(input, { target: { value: '   ' } });
    fireEvent.keyDown(input, { key: 'Enter' });
    expect(await screen.findByText('Untitled')).toBeInTheDocument();
  });

  it('cannot delete the last group (no delete badge rendered)', async () => {
    render(<App />);
    await screen.findByText('Actions');
    fireEvent.click(screen.getByTitle('Edit layout'));
    expect(document.querySelector('.dp-tab-del')).toBeNull();
  });

  it('deleting a group containing keys asks for confirmation', async () => {
    await seedConfig([button('b1', 'One')]);
    const confirmSpy = vi.spyOn(window, 'confirm').mockReturnValue(true);
    render(<App />);
    await screen.findByText('One');
    fireEvent.click(screen.getByTitle('New group'));
    fireEvent.click(screen.getByTitle('Edit layout'));
    // delete the FIRST tab (has 1 key) — expect confirm mentioning it
    fireEvent.click(document.querySelectorAll('.dp-tab-del')[0]);
    expect(confirmSpy).toHaveBeenCalled();
    await waitFor(async () => {
      const cfg = await getDeck().getConfig();
      expect(cfg.groups).toHaveLength(1);
    });
    confirmSpy.mockRestore();
  });

  it('deleting an empty group needs no confirmation', async () => {
    const confirmSpy = vi.spyOn(window, 'confirm');
    render(<App />);
    await screen.findByText('Actions');
    fireEvent.click(screen.getByTitle('New group'));
    fireEvent.click(screen.getByTitle('Edit layout'));
    fireEvent.click(document.querySelectorAll('.dp-tab-del')[1]); // new empty group
    expect(confirmSpy).not.toHaveBeenCalled();
    confirmSpy.mockRestore();
  });
});

describe('settings wiring', () => {
  beforeEach(async () => {
    await seedConfig([]);
  });

  it('accent + surface changes restyle the window immediately and persist', async () => {
    render(<App />);
    await screen.findByText('Actions');
    fireEvent.click(screen.getByTitle('Settings'));
    fireEvent.click(screen.getByRole('button', { name: '#8B5CF6' }));
    fireEvent.click(screen.getByText('Ink blue'));
    const win = document.querySelector('.dp-window') as HTMLElement;
    expect(win.style.getPropertyValue('--accent')).toBe('#8B5CF6');
    expect(win.style.background).toBeTruthy(); // ink-blue bg applied
    const cfg = await getDeck().getConfig();
    expect(cfg.settings).toMatchObject({ accent: '#8B5CF6', surface: 'ink-blue' });
  });

  it('Show labels toggle hides key labels', async () => {
    await seedConfig([button('b1', 'One')]);
    render(<App />);
    await screen.findByText('One');
    fireEvent.click(screen.getByTitle('Settings'));
    fireEvent.click(screen.getByText('Show labels'));
    expect(screen.queryByText('One')).toBeNull();
  });

  it('Launch at startup and Always on top call the deck API', async () => {
    const deck = getDeck();
    const loginSpy = vi.spyOn(deck, 'setLoginItem');
    const topSpy = vi.spyOn(deck, 'setAlwaysOnTop');
    render(<App />);
    await screen.findByText('Actions');
    fireEvent.click(screen.getByTitle('Settings'));
    fireEvent.click(screen.getByText('Launch at startup'));
    expect(loginSpy).toHaveBeenCalledWith(true);
    fireEvent.click(screen.getByText('Always on top'));
    expect(topSpy).toHaveBeenCalledWith(true);
  });
});

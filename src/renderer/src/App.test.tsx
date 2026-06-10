import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
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

import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { Key } from './Key';
import type { Button, KeyRuntime } from '@shared/types';

const button: Button = {
  id: 'b1', label: 'Dev Server', type: 'command', command: 'npm run dev', icon: { kind: 'auto' }
};
const rt = (over: Partial<KeyRuntime> = {}): KeyRuntime => ({ state: 'idle', log: [], failedDot: false, ...over });
const noop = () => undefined;
const base = {
  accent: '#34D399', editMode: false, showLabels: true, pressed: false, dragOver: false,
  now: Date.now(), onPress: noop, onStop: noop, onContext: noop, onDelete: noop,
  onDragStart: noop, onDragOver: noop, onDrop: noop
};

describe('Key states', () => {
  it('idle: filled key with label, no dots or overlays', () => {
    const { container } = render(<Key {...base} button={button} runtime={rt()} />);
    const el = container.querySelector('.dp-key--filled')!;
    expect(el.className).toContain('is-idle');
    expect(screen.getByText('Dev Server')).toBeInTheDocument();
    expect(container.querySelector('.dp-key-status')).toBeNull();
    expect(container.querySelector('.dp-key-shimmer')).toBeNull();
  });

  it('launching: shimmer overlay', () => {
    const { container } = render(<Key {...base} button={button} runtime={rt({ state: 'launching' })} />);
    expect(container.querySelector('.is-launching .dp-key-shimmer')).toBeInTheDocument();
  });

  it('running: status dot, ▶ mm:ss timer replaces label, stop overlay', () => {
    const startedAt = Date.now() - 83_000;
    const { container } = render(
      <Key {...base} button={button} runtime={rt({ state: 'running', startedAt })} now={Date.now()} />
    );
    expect(container.querySelector('.dp-key-status')).toBeInTheDocument();
    expect(screen.getByText(/▶ 01:23/)).toBeInTheDocument();
    expect(screen.queryByText('Dev Server')).toBeNull();
    expect(screen.getByRole('button', { name: 'Stop' })).toBeInTheDocument();
  });

  it('success: is-success class for the flash', () => {
    const { container } = render(<Key {...base} button={button} runtime={rt({ state: 'success' })} />);
    expect(container.querySelector('.is-success')).toBeInTheDocument();
  });

  it('failed: is-failed class; persistent red dot stays after returning to idle', () => {
    const { container, rerender } = render(
      <Key {...base} button={button} runtime={rt({ state: 'failed', failedDot: true, exit: 1 })} />
    );
    expect(container.querySelector('.is-failed')).toBeInTheDocument();
    rerender(<Key {...base} button={button} runtime={rt({ state: 'idle', failedDot: true })} />);
    expect(container.querySelector('.dp-key-faildot')).toBeInTheDocument();
  });

  it('empty slot renders dashed key with a plus and fires onPress', () => {
    const onPress = vi.fn();
    const { container } = render(<Key {...base} button={null} runtime={rt()} onPress={onPress} />);
    const el = container.querySelector('.dp-key--empty')!;
    fireEvent.click(el);
    expect(onPress).toHaveBeenCalled();
    expect(container.querySelector('.dp-empty-plus')).toBeInTheDocument();
  });

  it('edit mode: delete badge fires onDelete without onPress', () => {
    const onDelete = vi.fn();
    const onPress = vi.fn();
    render(<Key {...base} button={button} runtime={rt()} editMode onDelete={onDelete} onPress={onPress} />);
    fireEvent.click(screen.getByRole('button', { name: 'Delete' }));
    expect(onDelete).toHaveBeenCalled();
    expect(onPress).not.toHaveBeenCalled();
  });

  it('hides labels when showLabels is false', () => {
    render(<Key {...base} button={button} runtime={rt()} showLabels={false} />);
    expect(screen.queryByText('Dev Server')).toBeNull();
  });

  it('letter icon kind renders 1–2 derived letters on the tile color', () => {
    const b: Button = { ...button, icon: { kind: 'letter', tileColor: '#8B5CF6' } };
    render(<Key {...base} button={b} runtime={rt()} />);
    const tile = screen.getByText('DS');
    expect(tile.className).toContain('dp-key-letter');
  });

  it('emoji icon kind renders the emoji', () => {
    const b: Button = { ...button, icon: { kind: 'emoji', emoji: '🔥' } };
    render(<Key {...base} button={b} runtime={rt()} />);
    expect(screen.getByText('🔥')).toBeInTheDocument();
  });

  it('auto file/app icon renders deckicon img and falls back to letters on error', () => {
    const b: Button = { ...button, type: 'app', path: '/Applications/X.app', command: undefined };
    const { container } = render(<Key {...base} button={b} runtime={rt()} />);
    const img = container.querySelector('img')!;
    expect(img).toHaveAttribute('src', 'deckicon://b1.png');
    fireEvent.error(img);
    expect(screen.getByText('DS')).toBeInTheDocument();
  });
});

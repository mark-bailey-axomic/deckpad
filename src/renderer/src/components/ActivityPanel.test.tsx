import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { ActivityPanel, type ActivityItem } from './ActivityPanel';
import type { Button } from '@shared/types';

const btn = (id: string, label: string): Button => ({
  id, label, type: 'command', command: 'x', icon: { kind: 'auto' }
});

const runningItem: ActivityItem = {
  button: btn('b1', 'Dev Server'), groupName: 'Dev', state: 'running',
  startedAt: Date.now() - 65_000, log: ['line one', 'line two']
};
const failedItem: ActivityItem = {
  button: btn('b2', 'Backup'), groupName: 'Ops', state: 'failed',
  log: ['boom'], exit: 2, ranFor: 4200
};

describe('ActivityPanel', () => {
  it('shows the empty message when nothing is running', () => {
    render(<ActivityPanel open items={[]} now={Date.now()} accent="#34D399" onStop={() => {}} onClose={() => {}} />);
    expect(screen.getByText(/Nothing running/)).toBeInTheDocument();
  });

  it('running entry: label, group chip, elapsed, log, Stop button', () => {
    const onStop = vi.fn();
    const { container } = render(
      <ActivityPanel open items={[runningItem]} now={Date.now()} accent="#34D399" onStop={onStop} onClose={() => {}} />
    );
    expect(screen.getByText('Dev Server')).toBeInTheDocument();
    expect(screen.getByText('Dev')).toBeInTheDocument();
    expect(screen.getByText(/01:05/)).toBeInTheDocument();
    expect(container.querySelector('.dp-act-log')!.textContent).toBe('line one\nline two');
    fireEvent.click(screen.getByText('Stop'));
    expect(onStop).toHaveBeenCalledWith('b1');
  });

  it('failed entry: exit code, actual run duration, frozen log, no Stop', () => {
    render(<ActivityPanel open items={[failedItem]} now={Date.now()} accent="#34D399" onStop={() => {}} onClose={() => {}} />);
    expect(screen.getByText(/Failed · exit 2/)).toBeInTheDocument();
    expect(screen.getByText(/ran 00:04/)).toBeInTheDocument();
    expect(screen.queryByText('Stop')).toBeNull();
    expect(screen.getByText('boom')).toBeInTheDocument();
  });

  it('is-open class toggles with the open prop', () => {
    const { container, rerender } = render(
      <ActivityPanel open={false} items={[]} now={0} accent="#34D399" onStop={() => {}} onClose={() => {}} />
    );
    expect(container.querySelector('.dp-panel')!.className).not.toContain('is-open');
    rerender(<ActivityPanel open items={[]} now={0} accent="#34D399" onStop={() => {}} onClose={() => {}} />);
    expect(container.querySelector('.dp-panel')!.className).toContain('is-open');
  });
});

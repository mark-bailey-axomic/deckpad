import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { Toast } from './Toast';

describe('Toast', () => {
  it('renders nothing when toast is null', () => {
    const { container } = render(<Toast toast={null} onView={() => {}} onClose={() => {}} />);
    expect(container.firstChild).toBeNull();
  });

  it('fail toast shows "<label> failed (exit N)" with a View log link', () => {
    const onView = vi.fn();
    render(<Toast toast={{ kind: 'fail', buttonId: 'b1', label: 'Backup', exit: 2 }} onView={onView} onClose={() => {}} />);
    expect(screen.getByText(/Backup failed/)).toBeInTheDocument();
    expect(screen.getByText('(exit 2)')).toBeInTheDocument();
    fireEvent.click(screen.getByText('View log'));
    expect(onView).toHaveBeenCalled();
  });

  it('info toast shows the message without a View log link', () => {
    render(<Toast toast={{ kind: 'info', message: 'No empty slot in this group' }} onView={() => {}} onClose={() => {}} />);
    expect(screen.getByText('No empty slot in this group')).toBeInTheDocument();
    expect(screen.queryByText('View log')).toBeNull();
  });

  it('dismiss button fires onClose', () => {
    const onClose = vi.fn();
    render(<Toast toast={{ kind: 'fail', buttonId: 'b1', label: 'X', exit: 1 }} onView={() => {}} onClose={onClose} />);
    fireEvent.click(screen.getByRole('button', { name: 'Dismiss' }));
    expect(onClose).toHaveBeenCalled();
  });
});

import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { ContextMenu } from './ContextMenu';

describe('ContextMenu', () => {
  it('renders nothing when menu is null', () => {
    const { container } = render(<ContextMenu menu={null} onEdit={() => {}} onDuplicate={() => {}} onDelete={() => {}} />);
    expect(container.firstChild).toBeNull();
  });

  it('positions at x/y and fires the three actions', () => {
    const onEdit = vi.fn(); const onDuplicate = vi.fn(); const onDelete = vi.fn();
    const { container } = render(
      <ContextMenu menu={{ x: 40, y: 60, index: 2 }} onEdit={onEdit} onDuplicate={onDuplicate} onDelete={onDelete} />
    );
    const el = container.querySelector('.dp-menu') as HTMLElement;
    expect(el.style.left).toBe('40px');
    expect(el.style.top).toBe('60px');
    fireEvent.click(screen.getByText('Edit'));
    fireEvent.click(screen.getByText('Duplicate'));
    fireEvent.click(screen.getByText('Delete'));
    expect(onEdit).toHaveBeenCalled();
    expect(onDuplicate).toHaveBeenCalled();
    expect(onDelete).toHaveBeenCalled();
  });
});

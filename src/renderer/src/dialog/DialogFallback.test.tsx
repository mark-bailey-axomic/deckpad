import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { DialogFallback } from './DialogFallback';

describe('DialogFallback', () => {
  it('renders the given message text', () => {
    render(<DialogFallback message="Dialog unavailable." />);
    expect(screen.getByText('Dialog unavailable.')).toBeTruthy();
  });

  it('renders a Close button', () => {
    render(<DialogFallback message="test" />);
    expect(screen.getByRole('button', { name: /close/i })).toBeTruthy();
  });

  it('calls window.close when Close button is clicked', () => {
    const spy = vi.spyOn(window, 'close').mockImplementation(() => {});
    render(<DialogFallback message="test" />);
    fireEvent.click(screen.getByRole('button', { name: /close/i }));
    expect(spy).toHaveBeenCalled();
    spy.mockRestore();
  });
});

import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { Stepper } from './Stepper';

describe('Stepper', () => {
  it('clamps at min/max and disables the matching button', () => {
    const onChange = vi.fn();
    render(<Stepper value={2} min={2} max={6} onChange={onChange} suffix="cols" />);
    expect(screen.getByRole('button', { name: 'Decrease' })).toBeDisabled();
    fireEvent.click(screen.getByRole('button', { name: 'Increase' }));
    expect(onChange).toHaveBeenCalledWith(3);
  });
});

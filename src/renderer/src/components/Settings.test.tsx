import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { Settings } from './Settings';

const settings = {
  cols: 4, rows: 3, accent: '#34D399', surface: 'near-black' as const,
  showLabels: true, launchStartup: false, alwaysOnTop: false,
  settingsInWindow: false, activityInWindow: false
};

describe('Settings sheet', () => {
  it('renders steppers, 6 accent swatches, 3 surface cards, 5 toggles', () => {
    const { container } = render(<Settings open settings={settings} onChange={() => {}} onClose={() => {}} />);
    expect(container.querySelectorAll('.dp-swatch:not(.dp-swatch--sm)')).toHaveLength(6);
    expect(container.querySelectorAll('.dp-surf-opt')).toHaveLength(3);
    expect(screen.getByText('Show labels')).toBeInTheDocument();
    expect(screen.getByText('Launch at startup')).toBeInTheDocument();
    expect(screen.getByText('Always on top')).toBeInTheDocument();
    expect(screen.getByText('Open Settings in its own window')).toBeInTheDocument();
    expect(screen.getByText('Open Activity in its own window')).toBeInTheDocument();
  });

  it('emits patches for accent, surface, grid, and toggles', () => {
    const onChange = vi.fn();
    render(<Settings open settings={settings} onChange={onChange} onClose={() => {}} />);
    fireEvent.click(screen.getByRole('button', { name: '#8B5CF6' }));
    expect(onChange).toHaveBeenCalledWith({ accent: '#8B5CF6' });
    fireEvent.click(screen.getByText('Ink blue'));
    expect(onChange).toHaveBeenCalledWith({ surface: 'ink-blue' });
    fireEvent.click(screen.getByText('Always on top'));
    expect(onChange).toHaveBeenCalledWith({ alwaysOnTop: true });
    fireEvent.click(screen.getAllByRole('button', { name: 'Increase' })[0]);
    expect(onChange).toHaveBeenCalledWith({ cols: 5 });
  });
});

import { render } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { DeckIcon } from './DeckIcon';

describe('DeckIcon', () => {
  it('renders a 24×24 stroke svg at the requested size', () => {
    const { container } = render(<DeckIcon name="terminal" size={30} />);
    const svg = container.querySelector('svg')!;
    expect(svg).toHaveAttribute('width', '30');
    expect(svg).toHaveAttribute('viewBox', '0 0 24 24');
    expect(svg).toHaveAttribute('stroke', 'currentColor');
    expect(svg).toHaveAttribute('aria-hidden', 'true');
  });
  it('falls back to the app glyph for unknown names', () => {
    const { container } = render(<DeckIcon name={'nope' as never} />);
    expect(container.querySelectorAll('rect')).toHaveLength(4); // app glyph = 4 rects
  });
});

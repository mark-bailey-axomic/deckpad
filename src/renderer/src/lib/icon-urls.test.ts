import { describe, expect, it } from 'vitest';
import { autoIconUrl, customIconUrl } from './icon-urls';

describe('icon URLs', () => {
  it('auto icon is deckicon://<buttonId>.png', () => {
    expect(autoIconUrl('abc-123')).toBe('deckicon://abc-123.png');
  });
  it('custom icon keeps the source extension lowercased', () => {
    expect(customIconUrl('abc-123', '/Users/x/Pic.PNG')).toBe('deckicon://abc-123-custom.png');
    expect(customIconUrl('abc-123', '/x/logo.svg')).toBe('deckicon://abc-123-custom.svg');
  });
});

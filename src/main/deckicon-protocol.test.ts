import { describe, expect, it } from 'vitest';
import { sep } from 'node:path';
import { resolveIconPath } from './deckicon-protocol';

const ICONS = `${sep}data${sep}userData${sep}icons`;

describe('resolveIconPath', () => {
  it('maps deckicon://<name> into the icons dir', () => {
    expect(resolveIconPath(ICONS, 'deckicon://b1.png')).toBe(`${ICONS}${sep}b1.png`);
    expect(resolveIconPath(ICONS, 'deckicon://b1-custom.svg')).toBe(`${ICONS}${sep}b1-custom.svg`);
  });

  it('rejects path traversal out of the icons dir', () => {
    expect(resolveIconPath(ICONS, 'deckicon://../config.json')).toBeNull();
    expect(resolveIconPath(ICONS, 'deckicon://..%2F..%2Fetc%2Fpasswd')).toBeNull();
    expect(resolveIconPath(ICONS, 'deckicon://sub/../../x.png')).toBeNull();
  });

  it('rejects absolute-path smuggling and empty names', () => {
    expect(resolveIconPath(ICONS, 'deckicon:///etc/passwd')).toBeNull();
    expect(resolveIconPath(ICONS, 'deckicon://')).toBeNull();
  });
});

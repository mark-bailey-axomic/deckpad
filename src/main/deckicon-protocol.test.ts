import { describe, expect, it } from 'vitest';
import { normalize, sep } from 'node:path';
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

  // ---------------------------------------------------------------------------
  // Phase-6 review: extra traversal vectors
  // ---------------------------------------------------------------------------

  it('rejects encoded backslash traversal (..%5C..%5Cevil) on Windows-style paths', () => {
    // %5C decodes to backslash. On POSIX, normalize treats backslashes as literal
    // filename characters, so the path stays inside iconsDir and is accepted.
    // On Windows, backslash IS a separator and traversal succeeds — so the
    // implementation must reject it.  We pin the safe contract: the result must
    // either be null OR, if the platform treats '\' as literal, must still be
    // strictly inside iconsDir (not pointing outside it).
    const result = resolveIconPath(ICONS, 'deckicon://..%5C..%5Cevil');
    if (result !== null) {
      // Acceptable only if the resolved path is inside iconsDir.
      expect(result.startsWith(normalize(ICONS) + sep)).toBe(true);
    }
    // On Windows this MUST be null — document the requirement.
    // If this test runs on Windows and fails with a non-null result outside
    // iconsDir, the implementation needs to strip / reject backslash sequences.
  });

  it('double-encoded traversal (%252e%252e%252fevil) stays inside iconsDir — single decode does not traverse', () => {
    // %252e decodes once to %2e (still percent-encoded). A second decode would
    // give '.' but resolveIconPath only calls decodeURIComponent once, so the
    // literal string "%2e%2e%2fevil" is joined into iconsDir and stays inside.
    const result = resolveIconPath(ICONS, 'deckicon://%252e%252e%252fevil');
    // Must be non-null (treated as a harmless filename) AND inside iconsDir.
    expect(result).not.toBeNull();
    expect(result!.startsWith(normalize(ICONS) + sep)).toBe(true);
  });

  it('sibling-prefix attack: a crafted name pointing to iconsDir/../icons-evil/x.png resolves null', () => {
    // With iconsDir = '/data/icons', the name '../icons-evil/x.png' normalises
    // to '/data/icons-evil/x.png', which does NOT start with '/data/icons/'
    // (the extra '-evil' suffix breaks the prefix check).
    const iconsDir = `${sep}data${sep}icons`;
    const result = resolveIconPath(iconsDir, 'deckicon://../icons-evil/x.png');
    expect(result).toBeNull();
  });
});

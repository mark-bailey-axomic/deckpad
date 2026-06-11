import { protocol, net } from 'electron';
import { realpathSync } from 'node:fs';
import { isAbsolute, join, normalize, sep } from 'node:path';
import { pathToFileURL } from 'node:url';

export const DECKICON_SCHEME = 'deckicon';

/** Resolve a deckicon:// URL to a file inside iconsDir; null if it escapes the dir. */
export function resolveIconPath(iconsDir: string, url: string): string | null {
  const raw = url.slice(`${DECKICON_SCHEME}://`.length);
  if (!raw) return null;
  let name: string;
  try {
    name = decodeURIComponent(raw);
  } catch {
    return null;
  }
  if (isAbsolute(name) || name.startsWith('/') || name.startsWith('\\')) return null;
  const full = normalize(join(iconsDir, name));
  const root = normalize(iconsDir) + sep;
  if (!full.startsWith(root)) return null;
  return full;
}

/** Call before app ready. */
export function registerDeckIconScheme(): void {
  protocol.registerSchemesAsPrivileged([
    { scheme: DECKICON_SCHEME, privileges: { standard: false, stream: true } }
  ]);
}

/** Call after app ready. */
export function registerDeckIconProtocol(iconsDir: string): void {
  protocol.handle(DECKICON_SCHEME, async (request) => {
    const file = resolveIconPath(iconsDir, request.url);
    if (!file) return new Response('forbidden', { status: 403 });

    // Containment re-check after symlink resolution (tolerate ENOENT).
    try {
      const real = realpathSync(file);
      const root = normalize(iconsDir) + sep;
      if (!real.startsWith(root)) return new Response('forbidden', { status: 403 });
    } catch (err: unknown) {
      if ((err as NodeJS.ErrnoException).code !== 'ENOENT') {
        return new Response('forbidden', { status: 403 });
      }
      // ENOENT: file doesn't exist yet — fall through to net.fetch which will 404.
    }

    try {
      return await net.fetch(pathToFileURL(file).toString());
    } catch {
      return new Response('not found', { status: 404 });
    }
  });
}

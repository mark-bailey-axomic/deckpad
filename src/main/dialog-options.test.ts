import { describe, expect, it } from 'vitest';
import { dialogWindowOptions, DIALOG_SIZES } from './dialog-options';

const parent = { id: 1 } as never; // BrowserWindow stand-in; only identity is used

describe('dialogWindowOptions', () => {
  it('edit: modal child attached to parent, frameless', () => {
    const { options, size } = dialogWindowOptions('edit', '/preload.js', parent);
    expect(options.frame).toBe(false);
    expect(options.modal).toBe(true);
    expect(options.parent).toBe(parent);
    expect(options.webPreferences?.preload).toBe('/preload.js');
    expect(size).toEqual(DIALOG_SIZES.edit);
  });

  it('settings: modal child attached to parent', () => {
    const { options } = dialogWindowOptions('settings', '/preload.js', parent);
    expect(options.modal).toBe(true);
    expect(options.parent).toBe(parent);
  });

  it('activity: independent — not modal, no parent', () => {
    const { options } = dialogWindowOptions('activity', '/preload.js', parent);
    expect(options.modal).toBe(false);
    expect(options.parent).toBeUndefined();
    expect(options.frame).toBe(false);
  });
});

import { describe, expect, it } from 'vitest';
import { isValidPayload } from './messages';

describe('isValidPayload', () => {
  it('accepts a well-formed edit payload', () => {
    expect(isValidPayload('edit', { draft: {}, index: 0, accent: '#fff', surface: 'near-black' })).toBe(true);
  });

  it('accepts a well-formed settings payload', () => {
    expect(isValidPayload('settings', { settings: {}, accent: '#fff', surface: 'near-black' })).toBe(true);
  });

  it('accepts a well-formed activity payload', () => {
    expect(isValidPayload('activity', { items: [], now: 0, accent: '#fff', surface: 'near-black' })).toBe(true);
  });

  it('rejects an edit-shaped payload routed to the settings view', () => {
    expect(isValidPayload('settings', { draft: {}, index: 0 })).toBe(false);
  });

  it('rejects an edit payload missing a numeric index', () => {
    expect(isValidPayload('edit', { draft: {} })).toBe(false);
  });

  it('rejects a settings payload whose settings is null', () => {
    expect(isValidPayload('settings', { settings: null })).toBe(false);
  });

  it('rejects an activity payload whose items is not an array', () => {
    expect(isValidPayload('activity', { items: {} })).toBe(false);
  });

  it('rejects null and non-object values', () => {
    expect(isValidPayload('edit', null)).toBe(false);
    expect(isValidPayload('edit', undefined)).toBe(false);
    expect(isValidPayload('settings', 'nope')).toBe(false);
    expect(isValidPayload('activity', 42)).toBe(false);
  });
});

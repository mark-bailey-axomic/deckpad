import { describe, expect, it } from 'vitest';
import { parseDialogParams } from './params';

describe('parseDialogParams', () => {
  it('returns { view: "edit", id } for a valid edit view with id', () => {
    const result = parseDialogParams('?view=edit&id=abc-123');
    expect(result).toEqual({ view: 'edit', id: 'abc-123' });
  });

  it('returns { view: "settings", id } for a valid settings view with id', () => {
    const result = parseDialogParams('?view=settings&id=xyz-789');
    expect(result).toEqual({ view: 'settings', id: 'xyz-789' });
  });

  it('returns { view: "activity", id } for a valid activity view with id', () => {
    const result = parseDialogParams('?view=activity&id=deadbeef');
    expect(result).toEqual({ view: 'activity', id: 'deadbeef' });
  });

  it('returns null for an unknown view', () => {
    const result = parseDialogParams('?view=unknown&id=abc-123');
    expect(result).toBeNull();
  });

  it('returns null when view is missing', () => {
    const result = parseDialogParams('?id=abc-123');
    expect(result).toBeNull();
  });

  it('returns null when id is missing', () => {
    const result = parseDialogParams('?view=edit');
    expect(result).toBeNull();
  });

  it('returns null when id is empty string', () => {
    const result = parseDialogParams('?view=edit&id=');
    expect(result).toBeNull();
  });
});

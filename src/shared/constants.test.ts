import { describe, expect, it } from 'vitest';
import { IPC } from './constants';

describe('IPC dialog channels', () => {
  it('defines all dialog channels', () => {
    expect(IPC.openDialog).toBe('dialog:open');
    expect(IPC.getDialogPayload).toBe('dialog:get-payload');
    expect(IPC.sendDialogMessage).toBe('dialog:send-message');
    expect(IPC.closeDialog).toBe('dialog:close');
    expect(IPC.updateDialog).toBe('dialog:update-data');
    expect(IPC.dialogMessage).toBe('dialog:message');
    expect(IPC.dialogUpdate).toBe('dialog:update');
  });

  it('has no duplicate channel strings', () => {
    const values = Object.values(IPC);
    expect(new Set(values).size).toBe(values.length);
  });
});

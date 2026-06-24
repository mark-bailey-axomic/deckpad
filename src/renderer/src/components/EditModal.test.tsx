import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { EditModal, newDraft } from './EditModal';

const baseProps = {
  accent: '#34D399',
  onSave: vi.fn(),
  onCancel: vi.fn(),
  pickFile: vi.fn().mockResolvedValue(null)
};

describe('EditModal', () => {
  it('offers only command and script types', () => {
    render(<EditModal {...baseProps} open draft={newDraft()} />);
    expect(screen.getByText('Run command')).toBeInTheDocument();
    expect(screen.getByText('Add script')).toBeInTheDocument();
    expect(screen.queryByText('Open file')).toBeNull();
    expect(screen.queryByText('Launch app')).toBeNull();
  });

  it('shows the language selector and script body when type is script', () => {
    const draft = { ...newDraft(), type: 'script' as const };
    render(<EditModal {...baseProps} open draft={draft} />);
    expect(screen.getByText('Python')).toBeInTheDocument();
    expect(screen.getByText('TypeScript')).toBeInTheDocument();
    expect(screen.getByPlaceholderText(/write your script/i)).toBeInTheDocument();
  });

  it('disables Save for a script with an empty body', () => {
    const draft = { ...newDraft(), type: 'script' as const, label: 'Build', script: '' };
    render(<EditModal {...baseProps} open draft={draft} />);
    expect(screen.getByText('Save action')).toBeDisabled();
  });

  it('saves a script button without command/showTerminal fields', () => {
    const onSave = vi.fn();
    const draft = { ...newDraft(), type: 'script' as const, label: 'Build', language: 'python' as const, script: 'print(1)' };
    render(<EditModal {...baseProps} onSave={onSave} open draft={draft} />);
    fireEvent.click(screen.getByText('Save action'));
    expect(onSave).toHaveBeenCalledTimes(1);
    const saved = onSave.mock.calls[0][0];
    expect(saved).toMatchObject({ type: 'script', language: 'python', script: 'print(1)' });
    expect(saved.command).toBeUndefined();
    expect(saved.showTerminal).toBeUndefined();
    expect('isNew' in saved).toBe(false);
  });

  it('Tab in the script body inserts two spaces instead of moving focus', () => {
    const draft = { ...newDraft(), type: 'script' as const, label: 'B', script: 'a' };
    render(<EditModal {...baseProps} open draft={draft} />);
    const ta = screen.getByPlaceholderText(/write your script/i) as HTMLTextAreaElement;
    ta.focus();
    ta.setSelectionRange(1, 1);
    fireEvent.keyDown(ta, { key: 'Tab' });
    expect(ta.value).toBe('a  ');
    expect(document.activeElement).toBe(ta);
  });
});

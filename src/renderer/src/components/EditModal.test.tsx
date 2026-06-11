import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { EditModal, newDraft } from './EditModal';

const baseProps = {
  accent: '#34D399',
  onSave: vi.fn(),
  onCancel: vi.fn(),
  pickFile: vi.fn().mockResolvedValue(null),
  extractIcon: vi.fn().mockResolvedValue(null)
};

describe('newDraft', () => {
  it('creates a command draft with a fresh UUID id', () => {
    const d = newDraft();
    expect(d.id).toMatch(/^[0-9a-f-]{36}$/);
    expect(d.type).toBe('command');
    expect(d.icon).toEqual({ kind: 'auto' });
  });
});

describe('EditModal', () => {
  it('renders nothing when closed', () => {
    const { container } = render(<EditModal {...baseProps} open={false} draft={null} />);
    expect(container.firstChild).toBeNull();
  });

  it('disables Save until a label is present', () => {
    render(<EditModal {...baseProps} open draft={newDraft()} />);
    const save = screen.getByRole('button', { name: 'Save action' });
    expect(save).toBeDisabled();
    fireEvent.change(screen.getByPlaceholderText('e.g. Dev Server'), { target: { value: 'Deploy' } });
    expect(save).toBeEnabled();
  });

  it('command type shows command/cwd/showTerminal; file type shows the file row', () => {
    render(<EditModal {...baseProps} open draft={newDraft()} />);
    expect(screen.getByPlaceholderText('npm run dev')).toBeInTheDocument();
    expect(screen.getByText('Show terminal window')).toBeInTheDocument();
    fireEvent.click(screen.getByText('Open file'));
    expect(screen.queryByPlaceholderText('npm run dev')).toBeNull();
    expect(screen.getByText(/Choose a file/)).toBeInTheDocument();
  });

  it('saves the edited command button via onSave', () => {
    const onSave = vi.fn();
    render(<EditModal {...baseProps} onSave={onSave} open draft={newDraft()} />);
    fireEvent.change(screen.getByPlaceholderText('e.g. Dev Server'), { target: { value: 'Deploy' } });
    fireEvent.change(screen.getByPlaceholderText('npm run dev'), { target: { value: './deploy.sh' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save action' }));
    expect(onSave).toHaveBeenCalledWith(expect.objectContaining({
      label: 'Deploy', type: 'command', command: './deploy.sh'
    }));
  });

  it('file pick fills path, defaults label, extracts icon, and shows the Auto badge', async () => {
    const pickFile = vi.fn().mockResolvedValue('/Users/x/Notes.pdf');
    const extractIcon = vi.fn().mockResolvedValue('deckicon://id.png');
    const draft = { ...newDraft(), type: 'file' as const };
    render(<EditModal {...baseProps} pickFile={pickFile} extractIcon={extractIcon} open draft={draft} />);
    fireEvent.click(screen.getByText(/Choose a file/));
    await waitFor(() => expect(screen.getByText('/Users/x/Notes.pdf')).toBeInTheDocument());
    expect(pickFile).toHaveBeenCalledWith('file');
    expect(extractIcon).toHaveBeenCalledWith('/Users/x/Notes.pdf', draft.id);
    expect((screen.getByPlaceholderText('e.g. Dev Server') as HTMLInputElement).value).toBe('Notes.pdf');
    expect(screen.getByText('Auto from file')).toBeInTheDocument();
  });

  it('emoji picker: 12-emoji grid selects an emoji', () => {
    render(<EditModal {...baseProps} open draft={newDraft()} />);
    fireEvent.click(screen.getByText('Pick emoji'));
    const cells = document.querySelectorAll('.dp-emoji-cell');
    expect(cells).toHaveLength(12);
    fireEvent.click(screen.getByText('🔥'));
    expect(document.querySelector('.dp-prev-emoji')!.textContent).toBe('🔥');
  });

  it('letter tile: 8 color swatches set the tile color', () => {
    render(<EditModal {...baseProps} open draft={newDraft()} />);
    fireEvent.click(screen.getByText('Letter tile'));
    const swatches = document.querySelectorAll('.dp-swatch--sm');
    expect(swatches).toHaveLength(8);
    fireEvent.click(screen.getByRole('button', { name: '#EC4899' }));
    expect((document.querySelector('.dp-prev-tile') as HTMLElement).style.background).toBeTruthy();
  });

  it('choose image picks an image file into icon.sourcePath', async () => {
    const pickFile = vi.fn().mockResolvedValue('/Users/x/logo.svg');
    const onSave = vi.fn();
    render(<EditModal {...baseProps} pickFile={pickFile} onSave={onSave} open draft={newDraft()} />);
    fireEvent.change(screen.getByPlaceholderText('e.g. Dev Server'), { target: { value: 'X' } });
    fireEvent.click(screen.getByText('Choose image…'));
    await waitFor(() => expect(pickFile).toHaveBeenCalledWith('image'));
    // Wait for the async pick → setState to land (button gains is-on) before saving.
    await waitFor(() => expect(screen.getByText('Choose image…').closest('button')).toHaveClass('is-on'));
    fireEvent.click(screen.getByRole('button', { name: 'Save action' }));
    expect(onSave).toHaveBeenCalledWith(expect.objectContaining({
      icon: expect.objectContaining({ kind: 'image', sourcePath: '/Users/x/logo.svg' })
    }));
  });

  it('Cancel and scrim mousedown call onCancel', () => {
    const onCancel = vi.fn();
    const { container } = render(<EditModal {...baseProps} onCancel={onCancel} open draft={newDraft()} />);
    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));
    fireEvent.mouseDown(container.querySelector('.dp-scrim')!);
    expect(onCancel).toHaveBeenCalledTimes(2);
  });

  // -------------------------------------------------------------------------
  // Phase 3 review finding — should be RED until fixed
  // -------------------------------------------------------------------------

  it('type switch from command to file strips command/cwd/showTerminal from saved Button', async () => {
    const onSave = vi.fn();
    const pickFile = vi.fn().mockResolvedValue('/tmp/report.pdf');
    const draft = newDraft();
    // Pre-fill command-specific fields
    draft.command = 'echo hello';
    draft.cwd = '/home/user';
    draft.showTerminal = true;
    draft.label = 'MyAction';

    render(
      <EditModal
        {...baseProps}
        pickFile={pickFile}
        onSave={onSave}
        open
        draft={draft}
      />
    );

    // Switch type to 'file'
    fireEvent.click(screen.getByText('Open file'));

    // Pick a file so the save button becomes active and path is set
    fireEvent.click(screen.getByText(/Choose a file/));
    await waitFor(() => expect(screen.getByText('/tmp/report.pdf')).toBeInTheDocument());

    fireEvent.click(screen.getByRole('button', { name: 'Save action' }));

    expect(onSave).toHaveBeenCalledOnce();
    const saved = onSave.mock.calls[0][0] as Record<string, unknown>;

    // command-specific keys must be absent when type is 'file'
    expect(saved).not.toHaveProperty('command');
    expect(saved).not.toHaveProperty('cwd');
    expect(saved).not.toHaveProperty('showTerminal');
  });
});

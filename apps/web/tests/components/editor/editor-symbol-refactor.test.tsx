import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { EditorSymbolRefactor } from '@/components/editor/editor-symbol-refactor';
import type { SymbolUsage, RenameSymbolResult } from '@/lib/api/projects';

const USAGES: SymbolUsage[] = [
  { fileNodeId: 'f1', path: 'book.adoc', kind: 'xref', range: { from: 10, to: 18 } },
  { fileNodeId: 'f2', path: 'chapter.adoc', kind: 'xref', range: { from: 4, to: 12 } },
];

function setup(overrides: Partial<React.ComponentProps<typeof EditorSymbolRefactor>> = {}) {
  const findUsages = jest.fn(async () => USAGES);
  const renameSymbol = jest.fn(
    async (): Promise<RenameSymbolResult> => ({ rewrittenFiles: 2, updatedReferences: 3, warnings: [] }),
  );
  const onNavigate = jest.fn();
  const onRenamed = jest.fn();
  const onClose = jest.fn();
  render(
    <EditorSymbolRefactor
      open
      projectId="p1"
      canEdit
      initial={{ kind: 'anchor', name: 'intro' }}
      findUsages={findUsages}
      renameSymbol={renameSymbol}
      onNavigate={onNavigate}
      onRenamed={onRenamed}
      onClose={onClose}
      {...overrides}
    />,
  );
  return { findUsages, renameSymbol, onNavigate, onRenamed, onClose };
}

describe('EditorSymbolRefactor', () => {
  test('renders nothing when closed', () => {
    const { container } = render(
      <EditorSymbolRefactor
        open={false}
        projectId="p1"
        canEdit
        findUsages={jest.fn()}
        renameSymbol={jest.fn()}
        onNavigate={jest.fn()}
        onRenamed={jest.fn()}
        onClose={jest.fn()}
      />,
    );
    expect(container).toBeEmptyDOMElement();
  });

  test('auto-lists usages for the seeded symbol on open', async () => {
    const { findUsages } = setup();
    await waitFor(() => expect(findUsages).toHaveBeenCalledWith('p1', 'intro'));
    expect(await screen.findByText('book.adoc')).toBeInTheDocument();
    expect(screen.getByText('chapter.adoc')).toBeInTheDocument();
  });

  test('clicking a usage navigates to it', async () => {
    const { onNavigate } = setup();
    fireEvent.click(await screen.findByText('chapter.adoc'));
    expect(onNavigate).toHaveBeenCalledWith(USAGES[1]);
  });

  test('renaming calls the API and reports the outcome', async () => {
    const { renameSymbol, onRenamed } = setup();
    await screen.findByText('book.adoc'); // let the auto-find settle (clears loading)
    fireEvent.change(screen.getByLabelText('New name'), { target: { value: 'overview' } });
    fireEvent.click(screen.getByRole('button', { name: 'Rename' }));
    await waitFor(() =>
      expect(renameSymbol).toHaveBeenCalledWith('p1', { symbolKind: 'anchor', oldName: 'intro', newName: 'overview' }),
    );
    expect(onRenamed).toHaveBeenCalledWith({ rewrittenFiles: 2, updatedReferences: 3, warnings: [] }, 'anchor', 'intro', 'overview');
    expect(await screen.findByText(/Renamed across 2 files/)).toBeInTheDocument();
  });

  test('the Rename button is disabled when the new name equals the old', () => {
    setup(); // newName seeds to 'intro' === name
    expect(screen.getByRole('button', { name: 'Rename' })).toBeDisabled();
  });

  test('a viewer (no edit permission) cannot see the rename control', async () => {
    setup({ canEdit: false });
    await screen.findByText('book.adoc');
    expect(screen.queryByLabelText('New name')).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Rename' })).not.toBeInTheDocument();
  });

  test('surfaces a rename error from the API', async () => {
    const failing = jest.fn(async () => {
      const error: Error & { code?: string } = new Error('Cannot rename to "summary": a anchor with that name already exists');
      error.code = 'INVALID_SYMBOL_RENAME';
      throw error;
    });
    setup({ renameSymbol: failing });
    await screen.findByText('book.adoc'); // let the auto-find settle (clears loading)
    fireEvent.change(screen.getByLabelText('New name'), { target: { value: 'summary' } });
    fireEvent.click(screen.getByRole('button', { name: 'Rename' }));
    expect(await screen.findByRole('alert')).toHaveTextContent(/already exists/);
  });
});

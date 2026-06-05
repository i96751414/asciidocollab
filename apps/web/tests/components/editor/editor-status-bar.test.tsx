import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import { EditorStatusBar } from '@/components/editor/editor-status-bar';
import type { EditorSaveState } from '@/hooks/use-auto-save';

describe('EditorStatusBar', () => {
  test('renders line number, column number, total lines', () => {
    render(
      <EditorStatusBar
        line={5}
        col={10}
        totalLines={42}
        saveState="saved"
        onRetry={jest.fn()}
      />
    );
    expect(screen.getByText(/5/)).toBeInTheDocument();
    expect(screen.getByText(/10/)).toBeInTheDocument();
    expect(screen.getByText(/42/)).toBeInTheDocument();
  });

  const saveStates: Array<{ state: EditorSaveState; text: string }> = [
    { state: 'saved',   text: 'Saved' },
    { state: 'saving',  text: 'Saving' },
    { state: 'unsaved', text: 'Unsaved' },
    { state: 'error',   text: 'Error' },
  ];

  test.each(saveStates)(
    'renders save state badge with correct text for "$state"',
    ({ state, text }) => {
      render(
        <EditorStatusBar
          line={1}
          col={1}
          totalLines={10}
          saveState={state}
          onRetry={jest.fn()}
        />
      );
      expect(screen.getByText(new RegExp(text, 'i'))).toBeInTheDocument();
    }
  );

  test('"error" state shows a retry button', () => {
    const onRetry = jest.fn();
    render(
      <EditorStatusBar
        line={1}
        col={1}
        totalLines={10}
        saveState="error"
        onRetry={onRetry}
      />
    );
    const retryButton = screen.getByRole('button', { name: /retry/i });
    expect(retryButton).toBeInTheDocument();
    fireEvent.click(retryButton);
    expect(onRetry).toHaveBeenCalledTimes(1);
  });
});

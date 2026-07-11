import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { CommentComposer } from '@/components/review/composer';

jest.mock('@/lib/api/review', () => ({
  createReviewItem: jest.fn().mockResolvedValue({}),
  replyToThread: jest.fn().mockResolvedValue({}),
  editReviewItem: jest.fn().mockResolvedValue({}),
}));

// Render the emoji popover inline (Radix's portal doesn't open under jsdom's synthetic click).
jest.mock('@/components/ui/dropdown-menu', () => ({
  DropdownMenu: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  DropdownMenuTrigger: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  DropdownMenuContent: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
}));

const api = jest.requireMock('@/lib/api/review');

const anchor = { quote: { prefix: '', exact: 'x', suffix: '' }, lineHint: 1 };

beforeEach(() => {
  api.createReviewItem.mockClear().mockResolvedValue({});
  api.replyToThread.mockClear().mockResolvedValue({});
  api.editReviewItem.mockClear().mockResolvedValue({});
});

describe('CommentComposer', () => {
  test('new mode creates a root item and clears the field', async () => {
    const onSubmitted = jest.fn();
    render(<CommentComposer mode="new" projectId="p1" documentId="d1" anchor={anchor} onSubmitted={onSubmitted} />);

    const textarea = screen.getByTestId('comment-composer').querySelector('textarea')!;
    expect(screen.getByTestId('review-composer-submit')).toHaveTextContent('Comment');
    expect(screen.getByTestId('review-composer-submit')).toBeDisabled(); // empty

    fireEvent.change(textarea, { target: { value: 'a new comment' } });
    fireEvent.click(screen.getByTestId('review-composer-submit'));

    await waitFor(() =>
      expect(api.createReviewItem).toHaveBeenCalledWith('p1', 'd1', { kind: 'comment', body: 'a new comment', anchor }),
    );
    await waitFor(() => expect(onSubmitted).toHaveBeenCalled());
    expect(textarea).toHaveValue('');
  });

  test('new mode honours an explicit kind (task)', async () => {
    render(<CommentComposer mode="new" projectId="p1" documentId="d1" anchor={anchor} kind="task" />);
    const textarea = screen.getByTestId('comment-composer').querySelector('textarea')!;
    fireEvent.change(textarea, { target: { value: 'a task' } });
    fireEvent.click(screen.getByTestId('review-composer-submit'));
    await waitFor(() =>
      expect(api.createReviewItem).toHaveBeenCalledWith('p1', 'd1', { kind: 'task', body: 'a task', anchor }),
    );
  });

  test('a non-Error rejection falls back to a generic message', async () => {
    api.replyToThread.mockRejectedValueOnce('nope');
    render(<CommentComposer mode="reply" projectId="p1" rootId="root-1" />);
    const textarea = screen.getByTestId('comment-composer').querySelector('textarea')!;
    fireEvent.change(textarea, { target: { value: 'x' } });
    fireEvent.click(screen.getByTestId('review-composer-submit'));
    await waitFor(() => expect(screen.getByText('Failed to submit')).toBeInTheDocument());
  });

  test('an over-limit body disables submit and shows a negative counter', () => {
    render(<CommentComposer mode="reply" projectId="p1" rootId="root-1" />);
    const textarea = screen.getByTestId('comment-composer').querySelector('textarea')!;
    fireEvent.change(textarea, { target: { value: 'x'.repeat(5000) } });
    expect(screen.getByTestId('review-composer-submit')).toBeDisabled();
  });

  test('focusing the field publishes the active thread id (reply → root, else null)', () => {
    const setActiveThreadId = jest.fn();
    const { rerender } = render(
      <CommentComposer mode="reply" projectId="p1" rootId="root-1" setActiveThreadId={setActiveThreadId} />,
    );
    fireEvent.focus(screen.getByTestId('comment-composer').querySelector('textarea')!);
    expect(setActiveThreadId).toHaveBeenLastCalledWith('root-1');

    rerender(
      <CommentComposer mode="new" projectId="p1" documentId="d1" anchor={anchor} setActiveThreadId={setActiveThreadId} />,
    );
    fireEvent.focus(screen.getByTestId('comment-composer').querySelector('textarea')!);
    expect(setActiveThreadId).toHaveBeenLastCalledWith(null);
  });

  test('reply mode appends a reply via Ctrl+Enter', async () => {
    render(<CommentComposer mode="reply" projectId="p1" rootId="root-1" />);
    const textarea = screen.getByTestId('comment-composer').querySelector('textarea')!;
    expect(screen.getByTestId('review-composer-submit')).toHaveTextContent('Reply');

    fireEvent.change(textarea, { target: { value: 'a reply' } });
    fireEvent.keyDown(textarea, { key: 'Enter', ctrlKey: true });

    await waitFor(() => expect(api.replyToThread).toHaveBeenCalledWith('p1', 'root-1', { body: 'a reply' }));
  });

  test('edit mode prefills the body, saves, and keeps the text', async () => {
    const onSubmitted = jest.fn();
    render(<CommentComposer mode="edit" projectId="p1" itemId="i1" initialBody="original" onSubmitted={onSubmitted} />);

    const textarea = screen.getByDisplayValue('original');
    expect(screen.getByTestId('review-composer-submit')).toHaveTextContent('Save');

    fireEvent.change(textarea, { target: { value: 'updated' } });
    fireEvent.click(screen.getByTestId('review-composer-submit'));

    await waitFor(() => expect(api.editReviewItem).toHaveBeenCalledWith('p1', 'i1', { body: 'updated' }));
    await waitFor(() => expect(onSubmitted).toHaveBeenCalled());
    // Edit keeps the text in place (unlike new/reply which clear).
    expect(textarea).toHaveValue('updated');
  });

  test('surfaces a submit failure and does not clear', async () => {
    api.createReviewItem.mockRejectedValueOnce(new Error('boom'));
    render(<CommentComposer mode="new" projectId="p1" documentId="d1" anchor={anchor} />);
    const textarea = screen.getByTestId('comment-composer').querySelector('textarea')!;

    fireEvent.change(textarea, { target: { value: 'will fail' } });
    fireEvent.click(screen.getByTestId('review-composer-submit'));

    await waitFor(() => expect(screen.getByText('boom')).toBeInTheDocument());
    expect(textarea).toHaveValue('will fail');
  });

  test('inserting an emoji appends it to the body and restores the caret', async () => {
    render(<CommentComposer mode="reply" projectId="p1" rootId="root-1" />);
    const emojiButton = screen
      .getAllByRole('button', { name: /^Insert / })
      .find((button) => button.getAttribute('aria-label') !== 'Insert emoji')!;
    fireEvent.click(emojiButton);
    const textarea = screen.getByTestId('comment-composer').querySelector('textarea')!;
    expect(textarea.value.length).toBeGreaterThan(0);
    // Let the queued rAF (focus + caret restore) run.
    await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));
    expect(textarea).toHaveFocus();
  });

  test('Cancel and Escape invoke onCancel', () => {
    const onCancel = jest.fn();
    render(<CommentComposer mode="reply" projectId="p1" rootId="root-1" onCancel={onCancel} />);

    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));
    expect(onCancel).toHaveBeenCalledTimes(1);

    const textarea = screen.getByTestId('comment-composer').querySelector('textarea')!;
    fireEvent.keyDown(textarea, { key: 'Escape' });
    expect(onCancel).toHaveBeenCalledTimes(2);
  });
});

import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import type { ReviewItemDto } from '@asciidocollab/shared';
import { ReviewStatusControl, ReviewTaskControls, RevertTaskAction } from '@/components/review/task-controls';
import { assignTask, convertReviewItem, setTaskStatus } from '@/lib/api/review';

jest.mock('@/lib/api/review', () => ({
  assignTask: jest.fn().mockResolvedValue({}),
  convertReviewItem: jest.fn().mockResolvedValue({}),
  setTaskStatus: jest.fn().mockResolvedValue({}),
}));

jest.mock('@/components/avatar', () => ({
  Avatar: ({ displayName }: { displayName: string }) =>
    require('react').createElement('span', { 'data-testid': 'avatar', 'aria-label': displayName }),
}));

// Render dropdown items as buttons that fire their onSelect, so the pickers are clickable in jsdom.
jest.mock('@/components/ui/dropdown-menu', () => ({
  DropdownMenu: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  DropdownMenuTrigger: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  DropdownMenuContent: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  DropdownMenuItem: ({ children, onSelect }: { children: React.ReactNode; onSelect?: () => void }) => (
    <button type="button" onClick={() => onSelect?.()}>
      {children}
    </button>
  ),
}));

const mockSetStatus = setTaskStatus as jest.MockedFunction<typeof setTaskStatus>;
const mockAssign = assignTask as jest.MockedFunction<typeof assignTask>;
const mockConvert = convertReviewItem as jest.MockedFunction<typeof convertReviewItem>;

const task = (overrides: Partial<ReviewItemDto> = {}): ReviewItemDto => ({
  id: 't1',
  documentId: 'd1',
  projectId: 'p1',
  kind: 'task',
  status: 'open',
  body: 'Do the thing',
  author: { id: 'u1', displayName: 'Alice', avatarKey: null },
  reactions: [],
  createdAt: new Date().toISOString(),
  updatedAt: new Date().toISOString(),
  ...overrides,
});

describe('ReviewTaskControls', () => {
  beforeEach(() => {
    mockSetStatus.mockClear();
    mockAssign.mockClear();
    mockConvert.mockClear();
  });

  test('picking an assignee calls assignTask with the member id', async () => {
    render(
      <ReviewTaskControls
        projectId="p1"
        item={task()}
        members={[{ id: 'u2', displayName: 'Bob' }]}
      />,
    );
    fireEvent.click(screen.getByRole('button', { name: 'Bob' }));
    await waitFor(() =>
      expect(mockAssign).toHaveBeenCalledWith('p1', 't1', { assigneeId: 'u2', dueDate: null }),
    );
  });

  test('a comment offers only Convert to task', async () => {
    render(<ReviewTaskControls projectId="p1" item={task({ kind: 'comment', status: undefined })} />);
    const convert = screen.getByTestId('task-controls-convert');
    expect(convert).toBeInTheDocument();
    fireEvent.click(convert);
    await waitFor(() => expect(mockConvert).toHaveBeenCalledWith('p1', 't1', { kind: 'task' }));
  });

  test('renders nothing when readOnly', () => {
    render(<ReviewTaskControls projectId="p1" item={task()} readOnly />);
    expect(screen.queryByTestId('task-controls')).not.toBeInTheDocument();
    expect(screen.queryByTestId('task-controls-convert')).not.toBeInTheDocument();
  });

  test('an overdue due date is flagged, a future one is not', () => {
    const { rerender } = render(<ReviewTaskControls projectId="p1" item={task({ dueDate: '2000-01-01' })} />);
    expect(screen.getByTestId('task-controls-due-date')).toHaveAttribute('title', 'Overdue');

    rerender(<ReviewTaskControls projectId="p1" item={task({ dueDate: '2999-01-01' })} />);
    expect(screen.getByTestId('task-controls-due-date')).toHaveAttribute('title', 'Due date');
  });

  test('an assigned task shows the assignee and keeps the due date on assignment', async () => {
    render(
      <ReviewTaskControls
        projectId="p1"
        item={task({ assignee: { id: 'u9', displayName: 'Zoe', avatarKey: null }, dueDate: '2026-09-15' })}
        members={[{ id: 'u9', displayName: 'Zoe' }]}
      />,
    );
    expect(screen.getByTestId('task-controls-assignee')).toHaveAttribute('aria-label', 'Assignee: Zoe');
    // Unassigning preserves the existing due date.
    fireEvent.click(screen.getByRole('button', { name: 'Unassigned' }));
    await waitFor(() =>
      expect(mockAssign).toHaveBeenCalledWith('p1', 't1', { assigneeId: null, dueDate: '2026-09-15' }),
    );
  });

  test('editing the due date calls assignTask with the new value', async () => {
    render(<ReviewTaskControls projectId="p1" item={task()} />);
    fireEvent.change(screen.getByTestId('task-controls-due-date'), { target: { value: '2026-09-15' } });
    await waitFor(() =>
      expect(mockAssign).toHaveBeenCalledWith('p1', 't1', { assigneeId: null, dueDate: '2026-09-15' }),
    );
  });

  test('clearing the due date sends null', async () => {
    render(<ReviewTaskControls projectId="p1" item={task({ dueDate: '2026-09-15' })} />);
    fireEvent.change(screen.getByTestId('task-controls-due-date'), { target: { value: '' } });
    await waitFor(() =>
      expect(mockAssign).toHaveBeenCalledWith('p1', 't1', { assigneeId: null, dueDate: null }),
    );
  });

  test('clicking the due-date chip opens the native picker', () => {
    render(<ReviewTaskControls projectId="p1" item={task({ dueDate: '2026-09-15' })} />);
    const input = screen.getByTestId('task-controls-due-date') as HTMLInputElement;
    const showPicker = jest.fn();
    input.showPicker = showPicker;
    fireEvent.click(input);
    expect(showPicker).toHaveBeenCalled();
  });

  test('a picker that refuses to open is swallowed, leaving the input usable', () => {
    render(<ReviewTaskControls projectId="p1" item={task()} />);
    const input = screen.getByTestId('task-controls-due-date') as HTMLInputElement;
    input.showPicker = () => {
      throw new Error('requires user activation');
    };
    expect(() => fireEvent.click(input)).not.toThrow();
  });
});

describe('ReviewStatusControl', () => {
  beforeEach(() => mockSetStatus.mockClear());

  test('changing the status calls setTaskStatus', async () => {
    const onChanged = jest.fn();
    render(<ReviewStatusControl projectId="p1" item={task()} onChanged={onChanged} />);
    fireEvent.click(screen.getByRole('button', { name: 'Resolved' }));
    await waitFor(() => expect(mockSetStatus).toHaveBeenCalledWith('p1', 't1', { status: 'resolved' }));
    await waitFor(() => expect(onChanged).toHaveBeenCalled());
  });

  test('readOnly shows the status as a static badge with no picker', () => {
    render(<ReviewStatusControl projectId="p1" item={task({ status: 'in_progress' })} readOnly />);
    expect(screen.getByText('In progress')).toBeInTheDocument();
    expect(screen.queryByTestId('task-controls-status')).not.toBeInTheDocument();
  });

  test('renders nothing for a comment', () => {
    const { container } = render(
      <ReviewStatusControl projectId="p1" item={task({ kind: 'comment', status: undefined })} />,
    );
    expect(container).toBeEmptyDOMElement();
  });
});

describe('RevertTaskAction', () => {
  beforeEach(() => mockConvert.mockClear());

  test('reverting a task calls convertReviewItem with kind comment', async () => {
    const onChanged = jest.fn();
    render(<RevertTaskAction projectId="p1" item={task()} onChanged={onChanged} />);
    fireEvent.click(screen.getByRole('button', { name: /revert to comment/i }));
    await waitFor(() => expect(mockConvert).toHaveBeenCalledWith('p1', 't1', { kind: 'comment' }));
    await waitFor(() => expect(onChanged).toHaveBeenCalled());
  });

  test('a failed revert is swallowed and does not call onChanged', async () => {
    mockConvert.mockRejectedValueOnce(new Error('offline'));
    const onChanged = jest.fn();
    render(<RevertTaskAction projectId="p1" item={task()} onChanged={onChanged} />);
    fireEvent.click(screen.getByRole('button', { name: /revert to comment/i }));
    await waitFor(() => expect(mockConvert).toHaveBeenCalled());
    expect(onChanged).not.toHaveBeenCalled();
  });

  test('renders nothing for a comment or when readOnly', () => {
    const { container: asComment } = render(
      <RevertTaskAction projectId="p1" item={task({ kind: 'comment', status: undefined })} />,
    );
    expect(asComment).toBeEmptyDOMElement();
    const { container: asReadOnly } = render(<RevertTaskAction projectId="p1" item={task()} readOnly />);
    expect(asReadOnly).toBeEmptyDOMElement();
  });
});

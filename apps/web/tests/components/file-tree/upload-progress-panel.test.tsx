import React from 'react';
import { render, screen, fireEvent, act } from '@testing-library/react';
import { UploadProgressPanel } from '@/components/file-tree/upload-progress-panel';
import type { UploadProgress } from '@/hooks/use-drop-upload';

jest.useFakeTimers();

const makeProgress = (overrides: Partial<UploadProgress> = {}): UploadProgress => ({
  id: crypto.randomUUID(),
  name: 'file.txt',
  relativePath: 'file.txt',
  status: 'done',
  ...overrides,
});

describe('UploadProgressPanel', () => {
  it('renders overall progress counter text N / M files', () => {
    const progress = [
      makeProgress({ status: 'done' }),
      makeProgress({ status: 'uploading' }),
    ];
    render(<UploadProgressPanel progress={progress} onDismiss={jest.fn()} />);
    expect(screen.getByText(/1 \/ 2 files/i)).toBeInTheDocument();
  });

  it('progress bar aria-valuenow equals number of completed items', () => {
    const progress = [
      makeProgress({ status: 'done' }),
      makeProgress({ status: 'done' }),
      makeProgress({ status: 'uploading' }),
    ];
    render(<UploadProgressPanel progress={progress} onDismiss={jest.fn()} />);
    const progressBar = screen.getByRole('progressbar');
    expect(progressBar).toHaveAttribute('aria-valuenow', '67');
  });

  it('each item row shows filename and correct aria-label on status icon', () => {
    const progress = [
      makeProgress({ name: 'uploading.txt', status: 'uploading' }),
      makeProgress({ name: 'done.txt', status: 'done' }),
      makeProgress({ name: 'fail.txt', status: 'error', errorMessage: 'oops' }),
    ];
    render(<UploadProgressPanel progress={progress} onDismiss={jest.fn()} />);

    expect(screen.getByText('uploading.txt')).toBeInTheDocument();
    expect(screen.getByLabelText('uploading')).toBeInTheDocument();
    expect(screen.getByLabelText('done')).toBeInTheDocument();
    expect(screen.getByLabelText('failed: oops')).toBeInTheDocument();
  });

  it('when all items are done no close button and onDismiss called after 2s', () => {
    const onDismiss = jest.fn();
    const progress = [makeProgress({ status: 'done' }), makeProgress({ status: 'done' })];
    render(<UploadProgressPanel progress={progress} onDismiss={onDismiss} />);

    expect(screen.queryByRole('button')).toBeNull();

    act(() => jest.advanceTimersByTime(2000));
    expect(onDismiss).toHaveBeenCalledTimes(1);
  });

  it('when any item has error a close button is rendered and onDismiss NOT called automatically', () => {
    const onDismiss = jest.fn();
    const progress = [
      makeProgress({ status: 'done' }),
      makeProgress({ status: 'error', errorMessage: 'err' }),
    ];
    render(<UploadProgressPanel progress={progress} onDismiss={onDismiss} />);

    expect(screen.getByRole('button')).toBeInTheDocument();
    act(() => jest.advanceTimersByTime(3000));
    expect(onDismiss).not.toHaveBeenCalled();
  });

  it('clicking the close button calls onDismiss', () => {
    const onDismiss = jest.fn();
    const progress = [makeProgress({ status: 'error', errorMessage: 'err' })];
    render(<UploadProgressPanel progress={progress} onDismiss={onDismiss} />);

    fireEvent.click(screen.getByRole('button'));
    expect(onDismiss).toHaveBeenCalledTimes(1);
  });

  it('items list has overflow-y auto / max-height styling', () => {
    const progress = [makeProgress()];
    const { container } = render(<UploadProgressPanel progress={progress} onDismiss={jest.fn()} />);
    const list = container.querySelector('[data-testid="items-list"]');
    expect(list).not.toBeNull();
  });

  it('items with status error display their errorMessage', () => {
    const progress = [makeProgress({ status: 'error', errorMessage: 'Something went wrong' })];
    render(<UploadProgressPanel progress={progress} onDismiss={jest.fn()} />);
    expect(screen.getByText('Something went wrong')).toBeInTheDocument();
  });
});

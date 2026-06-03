import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import { DragDropZone } from '@/components/file-tree/drag-drop-zone';
import type { UploadProgress } from '@/hooks/use-drop-upload';

jest.mock('@/hooks/use-drop-upload', () => ({
  useDropUpload: jest.fn(),
}));
jest.mock('@/components/file-tree/upload-progress-panel', () => ({
  UploadProgressPanel: ({ progress, onDismiss }: { progress: UploadProgress[]; onDismiss: () => void }) => (
    <div data-testid="upload-panel">
      {progress.map((p) => <div key={p.id}>{p.name}</div>)}
      <button onClick={onDismiss}>dismiss</button>
    </div>
  ),
}));

const mockUseDropUpload = jest.requireMock('@/hooks/use-drop-upload').useDropUpload as jest.Mock;

function makeProgress(overrides: Partial<UploadProgress> = {}): UploadProgress {
  return {
    id: 'test-id',
    name: 'file.txt',
    relativePath: 'file.txt',
    status: 'done',
    ...overrides,
  };
}

describe('DragDropZone', () => {
  const mockOnDrop = jest.fn();

  beforeEach(() => {
    jest.clearAllMocks();
    mockUseDropUpload.mockReturnValue({ onDrop: mockOnDrop, progress: [] });
  });

  it('drop highlight appears on dragOver', () => {
    const { container } = render(
      <DragDropZone targetFolderId="folder-1" projectId="proj-1">
        <div>content</div>
      </DragDropZone>,
    );
    const zone = container.firstChild as HTMLElement;
    fireEvent.dragOver(zone);
    expect(zone.className).toMatch(/ring/i);
  });

  it('drop highlight clears on dragLeave', () => {
    const { container } = render(
      <DragDropZone targetFolderId="folder-1" projectId="proj-1">
        <div>content</div>
      </DragDropZone>,
    );
    const zone = container.firstChild as HTMLElement;
    fireEvent.dragOver(zone);
    fireEvent.dragLeave(zone);
    // After dragLeave the highlight class should be gone
    expect(zone.className).not.toMatch(/ring-2/);
  });

  it('onDrop from useDropUpload is called with dataTransfer.items on drop', () => {
    const { container } = render(
      <DragDropZone targetFolderId="folder-1" projectId="proj-1">
        <div>content</div>
      </DragDropZone>,
    );
    const zone = container.firstChild as HTMLElement;
    const mockItems = {} as DataTransferItemList;
    fireEvent.drop(zone, { dataTransfer: { items: mockItems } });
    expect(mockOnDrop).toHaveBeenCalledWith(mockItems);
  });

  it('UploadProgressPanel rendered when progress is non-empty', () => {
    mockUseDropUpload.mockReturnValue({
      onDrop: mockOnDrop,
      progress: [makeProgress()],
    });
    render(
      <DragDropZone targetFolderId="folder-1" projectId="proj-1">
        <div>content</div>
      </DragDropZone>,
    );
    expect(screen.getByTestId('upload-panel')).toBeInTheDocument();
  });

  it('UploadProgressPanel not rendered when progress is empty', () => {
    render(
      <DragDropZone targetFolderId="folder-1" projectId="proj-1">
        <div>content</div>
      </DragDropZone>,
    );
    expect(screen.queryByTestId('upload-panel')).not.toBeInTheDocument();
  });
});

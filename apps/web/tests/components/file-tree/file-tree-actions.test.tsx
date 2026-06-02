import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { FileTreeActions } from '@/components/file-tree/file-tree-actions';

// Mock Radix dropdown so items render inline for testing
jest.mock('@/components/ui/dropdown-menu', () => ({
  DropdownMenu: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  DropdownMenuTrigger: ({ children, asChild }: { children: React.ReactNode; asChild?: boolean }) =>
    asChild ? <>{children}</> : <div>{children}</div>,
  DropdownMenuContent: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  DropdownMenuItem: ({ children, onSelect, className }: { children: React.ReactNode; onSelect?: () => void; className?: string }) => (
    <button onClick={onSelect} className={className}>{children}</button>
  ),
  DropdownMenuPortal: ({ children }: { children: React.ReactNode }) => <>{children}</>,
}));

jest.mock('@/lib/api/file-tree', () => ({
  createFolder: jest.fn().mockResolvedValue({ fileNodeId: 'new-folder', path: '/new-folder' }),
  createFileNode: jest.fn().mockResolvedValue({ fileNodeId: 'new-file', path: '/new-file.adoc' }),
  renameFileNode: jest.fn().mockResolvedValue(undefined),
  moveFileNode: jest.fn().mockResolvedValue(undefined),
  deleteFileNode: jest.fn().mockResolvedValue(undefined),
  FileTreeApiError: class FileTreeApiError extends Error {
    constructor(public status: number, public code: string, message: string) { super(message); }
  },
}));

describe('FileTreeActions', () => {
  const projectId = 'proj-1';
  const fileNodeId = 'node-1';
  const parentId = 'parent-1';

  it('all six menu items are present', () => {
    render(
      <FileTreeActions
        projectId={projectId}
        fileNodeId={fileNodeId}
        parentId={parentId}
        nodeType="file"
        nodeName="test.adoc"
        onUpdate={jest.fn()}
      />,
    );

    expect(screen.getByText(/New File/i)).toBeInTheDocument();
    expect(screen.getByText(/New Folder/i)).toBeInTheDocument();
    expect(screen.getByText(/Upload File/i)).toBeInTheDocument();
    expect(screen.getByText(/Rename/i)).toBeInTheDocument();
    expect(screen.getByText(/Move/i)).toBeInTheDocument();
    expect(screen.getByText(/Delete/i)).toBeInTheDocument();
  });

  it('Delete item calls deleteFileNode when selected', async () => {
    const onUpdate = jest.fn();
    const { deleteFileNode } = jest.requireMock('@/lib/api/file-tree');
    render(
      <FileTreeActions
        projectId={projectId}
        fileNodeId={fileNodeId}
        parentId={parentId}
        nodeType="file"
        nodeName="test.adoc"
        onUpdate={onUpdate}
      />,
    );

    fireEvent.click(screen.getByText(/Delete/i));

    await waitFor(() => expect(deleteFileNode).toHaveBeenCalledWith(projectId, fileNodeId));
  });
});

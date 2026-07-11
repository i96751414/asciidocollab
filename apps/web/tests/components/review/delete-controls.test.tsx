import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import {
  DeleteItemAction,
  BulkDeleteDocumentAction,
  ProjectBulkDeleteButton,
} from '@/components/review/delete-controls';
import { deleteReviewItem, bulkDeleteDocument, bulkDeleteProject } from '@/lib/api/review';

jest.mock('@/lib/api/review', () => ({
  deleteReviewItem: jest.fn().mockResolvedValue(undefined),
  bulkDeleteDocument: jest.fn().mockResolvedValue({ deleted: 3 }),
  bulkDeleteProject: jest.fn().mockResolvedValue({ deleted: 7 }),
}));

const mockDeleteItem = deleteReviewItem as jest.MockedFunction<typeof deleteReviewItem>;
const mockBulkDoc = bulkDeleteDocument as jest.MockedFunction<typeof bulkDeleteDocument>;
const mockBulkProject = bulkDeleteProject as jest.MockedFunction<typeof bulkDeleteProject>;

describe('DeleteItemAction', () => {
  beforeEach(() => mockDeleteItem.mockClear());

  test('confirm gates the destructive call', async () => {
    const onDeleted = jest.fn();
    render(<DeleteItemAction projectId="p1" itemId="r1" onDeleted={onDeleted} />);

    // First click only arms the confirm — nothing is deleted yet.
    fireEvent.click(screen.getByTestId('delete-item'));
    expect(mockDeleteItem).not.toHaveBeenCalled();

    // The explicit confirm fires the delete.
    fireEvent.click(screen.getByTestId('delete-item-confirm'));
    await waitFor(() => expect(mockDeleteItem).toHaveBeenCalledWith('p1', 'r1'));
    await waitFor(() => expect(onDeleted).toHaveBeenCalled());
  });

  test('hidden when readOnly', () => {
    render(<DeleteItemAction projectId="p1" itemId="r1" readOnly />);
    expect(screen.queryByTestId('delete-item')).not.toBeInTheDocument();
  });
});

describe('BulkDeleteDocumentAction', () => {
  beforeEach(() => mockBulkDoc.mockClear());

  test('sends only the confirm after arming (no expectedCount guard — deletes all rows)', async () => {
    render(<BulkDeleteDocumentAction projectId="p1" documentId="d1" count={3} />);
    fireEvent.click(screen.getByTestId('bulk-delete-document'));
    expect(mockBulkDoc).not.toHaveBeenCalled();
    fireEvent.click(screen.getByTestId('bulk-delete-document-confirm'));
    await waitFor(() => expect(mockBulkDoc).toHaveBeenCalledWith('p1', 'd1', { confirm: true }));
  });
});

describe('ProjectBulkDeleteButton', () => {
  beforeEach(() => mockBulkProject.mockClear());

  test('renders nothing for a non-owner', () => {
    render(<ProjectBulkDeleteButton projectId="p1" count={4} isOwner={false} />);
    expect(screen.queryByTestId('bulk-delete-project')).not.toBeInTheDocument();
  });

  test('owner confirm gates the project-wide delete', async () => {
    const onDeleted = jest.fn();
    render(<ProjectBulkDeleteButton projectId="p1" count={4} isOwner onDeleted={onDeleted} />);
    fireEvent.click(screen.getByTestId('bulk-delete-project'));
    expect(mockBulkProject).not.toHaveBeenCalled();
    fireEvent.click(screen.getByTestId('bulk-delete-project-confirm'));
    await waitFor(() =>
      expect(mockBulkProject).toHaveBeenCalledWith('p1', { confirm: true, expectedCount: 4 }),
    );
    await waitFor(() => expect(onDeleted).toHaveBeenCalledWith({ deleted: 7 }));
  });
});

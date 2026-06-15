import React from 'react';
import { render, screen, fireEvent, waitFor, within } from '@testing-library/react';
import { MemberList } from '@/components/member-list';
import type { ProjectMember } from '@/lib/api';

const mockUpdateRole = jest.fn();
const mockRemove = jest.fn();

jest.mock('@/lib/api', () => ({
  membersApi: {
    updateRole: (...arguments_: unknown[]) => mockUpdateRole(...arguments_),
    remove: (...arguments_: unknown[]) => mockRemove(...arguments_),
  },
}));

const makeMember = (overrides: Partial<ProjectMember> = {}): ProjectMember => ({
  userId: 'u1',
  email: 'alice@example.com',
  displayName: 'Alice',
  role: 'editor',
  joinedAt: new Date().toISOString(),
  ...overrides,
});

const owner = makeMember({ userId: 'owner', displayName: 'Olivia', email: 'olivia@example.com', role: 'owner' });
const editor = makeMember({ userId: 'u1', displayName: 'Alice', email: 'alice@example.com', role: 'editor' });
const secondOwner = makeMember({ userId: 'owner2', displayName: 'Oscar', email: 'oscar@example.com', role: 'owner' });

const rowFor = (name: string) => screen.getByText(name).closest('div[class*="border"]') as HTMLElement;

beforeEach(() => {
  jest.clearAllMocks();
  mockUpdateRole.mockResolvedValue({ data: { userId: 'u1', role: 'viewer' } });
  mockRemove.mockResolvedValue({ data: { message: 'removed' } });
});

describe('MemberList', () => {
  test('renders an empty state when there are no members', () => {
    render(<MemberList projectId="p1" members={[]} currentUserId="owner" currentUserRole="owner" />);
    expect(screen.getByText(/no members yet/i)).toBeInTheDocument();
  });

  test('renders member names, emails, and the (you) marker', () => {
    render(
      <MemberList projectId="p1" members={[owner, editor]} currentUserId="owner" currentUserRole="owner" />,
    );
    expect(screen.getByText('Olivia')).toBeInTheDocument();
    expect(screen.getByText('alice@example.com')).toBeInTheDocument();
    expect(screen.getByText('(you)')).toBeInTheDocument();
  });

  test('non-owners see roles as static text, not selectable controls', () => {
    render(
      <MemberList projectId="p1" members={[owner, editor]} currentUserId="u1" currentUserRole="editor" />,
    );
    expect(screen.queryByRole('combobox')).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /remove/i })).not.toBeInTheDocument();
    expect(screen.getByText('editor')).toBeInTheDocument();
  });

  test('owners can change another member role', async () => {
    const onUpdateRole = jest.fn();
    render(
      <MemberList
        projectId="p1"
        members={[secondOwner, editor]}
        currentUserId="owner2"
        currentUserRole="owner"
        onUpdateRole={onUpdateRole}
      />,
    );

    fireEvent.change(within(rowFor('Alice')).getByRole('combobox'), { target: { value: 'viewer' } });

    await waitFor(() => expect(mockUpdateRole).toHaveBeenCalledWith('p1', 'u1', 'viewer'));
    expect(onUpdateRole).toHaveBeenCalledWith('u1', 'viewer');
  });

  test('shows an error when updating a role fails', async () => {
    mockUpdateRole.mockRejectedValue(new Error('Cannot update'));
    render(
      <MemberList projectId="p1" members={[secondOwner, editor]} currentUserId="owner2" currentUserRole="owner" />,
    );

    fireEvent.change(within(rowFor('Alice')).getByRole('combobox'), { target: { value: 'viewer' } });

    expect(await screen.findByText('Cannot update')).toBeInTheDocument();
  });

  test('updates a role successfully without an onUpdateRole callback', async () => {
    render(
      <MemberList projectId="p1" members={[secondOwner, editor]} currentUserId="owner2" currentUserRole="owner" />,
    );

    fireEvent.change(within(rowFor('Alice')).getByRole('combobox'), { target: { value: 'viewer' } });

    await waitFor(() => expect(mockUpdateRole).toHaveBeenCalledWith('p1', 'u1', 'viewer'));
  });

  test('removes a member successfully without an onRemove callback', async () => {
    render(
      <MemberList projectId="p1" members={[owner, editor]} currentUserId="owner" currentUserRole="owner" />,
    );

    fireEvent.click(within(rowFor('Alice')).getByRole('button', { name: /remove/i }));
    const dialog = await screen.findByRole('dialog');
    fireEvent.click(within(dialog).getByRole('button', { name: /^remove$/i }));

    await waitFor(() => expect(mockRemove).toHaveBeenCalledWith('p1', 'u1'));
  });

  test('shows a fallback message when role update rejects with a non-Error', async () => {
    mockUpdateRole.mockRejectedValue('boom');
    render(
      <MemberList projectId="p1" members={[secondOwner, editor]} currentUserId="owner2" currentUserRole="owner" />,
    );

    fireEvent.change(within(rowFor('Alice')).getByRole('combobox'), { target: { value: 'viewer' } });

    expect(await screen.findByText('Failed to update role')).toBeInTheDocument();
  });

  test('shows a fallback message when removal rejects with a non-Error', async () => {
    mockRemove.mockRejectedValue('boom');
    render(
      <MemberList projectId="p1" members={[owner, editor]} currentUserId="owner" currentUserRole="owner" />,
    );

    fireEvent.click(within(rowFor('Alice')).getByRole('button', { name: /remove/i }));
    const dialog = await screen.findByRole('dialog');
    fireEvent.click(within(dialog).getByRole('button', { name: /^remove$/i }));

    expect(await screen.findByText('Failed to remove member')).toBeInTheDocument();
  });

  test('cancelling the confirmation dialog dismisses it without removing', async () => {
    render(
      <MemberList projectId="p1" members={[owner, editor]} currentUserId="owner" currentUserRole="owner" />,
    );

    fireEvent.click(within(rowFor('Alice')).getByRole('button', { name: /remove/i }));
    const dialog = await screen.findByRole('dialog');
    fireEvent.click(within(dialog).getByRole('button', { name: /cancel/i }));

    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
    expect(mockRemove).not.toHaveBeenCalled();
  });

  test('the sole owner cannot change their own role', () => {
    render(
      <MemberList projectId="p1" members={[owner, editor]} currentUserId="owner" currentUserRole="owner" />,
    );
    expect(within(rowFor('Olivia')).getByRole('combobox')).toBeDisabled();
  });

  test('the last owner has no Remove button but other members do', () => {
    render(
      <MemberList projectId="p1" members={[owner, editor]} currentUserId="owner" currentUserRole="owner" />,
    );
    expect(within(rowFor('Olivia')).queryByRole('button', { name: /remove/i })).not.toBeInTheDocument();
    expect(within(rowFor('Alice')).getByRole('button', { name: /remove/i })).toBeInTheDocument();
  });

  test('removing a member opens a confirmation dialog and removes on confirm', async () => {
    const onRemove = jest.fn();
    render(
      <MemberList
        projectId="p1"
        members={[owner, editor]}
        currentUserId="owner"
        currentUserRole="owner"
        onRemove={onRemove}
      />,
    );

    fireEvent.click(within(rowFor('Alice')).getByRole('button', { name: /remove/i }));

    const dialog = await screen.findByRole('dialog');
    expect(within(dialog).getByText('Remove member')).toBeInTheDocument();
    fireEvent.click(within(dialog).getByRole('button', { name: /^remove$/i }));

    await waitFor(() => expect(mockRemove).toHaveBeenCalledWith('p1', 'u1'));
    expect(onRemove).toHaveBeenCalledWith('u1');
  });

  test('shows an error when removal fails', async () => {
    mockRemove.mockRejectedValue(new Error('Removal blocked'));
    render(
      <MemberList projectId="p1" members={[owner, editor]} currentUserId="owner" currentUserRole="owner" />,
    );

    fireEvent.click(within(rowFor('Alice')).getByRole('button', { name: /remove/i }));
    const dialog = await screen.findByRole('dialog');
    fireEvent.click(within(dialog).getByRole('button', { name: /^remove$/i }));

    expect(await screen.findByText('Removal blocked')).toBeInTheDocument();
  });

  test('archived projects disable role changes and hide Remove buttons', () => {
    render(
      <MemberList
        projectId="p1"
        members={[secondOwner, editor]}
        currentUserId="owner2"
        currentUserRole="owner"
        isArchived={true}
      />,
    );
    expect(within(rowFor('Alice')).getByRole('combobox')).toBeDisabled();
    expect(within(rowFor('Alice')).queryByRole('button', { name: /remove/i })).not.toBeInTheDocument();
  });
});

import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { InviteMemberForm } from '@/components/invite-member-form';
import type { ProjectMember, UserSearchResult } from '@/lib/api';

const mockInvite = jest.fn();

jest.mock('@/lib/api', () => ({
  membersApi: { invite: (...arguments_: unknown[]) => mockInvite(...arguments_) },
}));

const fakeUser: UserSearchResult = { userId: 'u1', displayName: 'Alice', email: 'alice@example.com' };

// Replace the combobox with a simple button that selects a fixed user, so the form's
// own behaviour (submit, role selection, error/loading) can be tested in isolation.
jest.mock('@/components/user-search-combobox', () => ({
  UserSearchCombobox: ({
    value,
    onChange,
    disabled,
  }: {
    value: UserSearchResult | null;
    onChange: (user: UserSearchResult | null) => void;
    disabled?: boolean;
  }) => (
    <div>
      <button type="button" disabled={disabled} onClick={() => onChange(fakeUser)}>
        select-user
      </button>
      <span data-testid="selected-user">{value ? value.email : 'none'}</span>
    </div>
  ),
}));

const invitedMember: ProjectMember = {
  userId: 'u1',
  email: 'alice@example.com',
  displayName: 'Alice',
  role: 'editor',
  joinedAt: new Date().toISOString(),
};

const noop = () => undefined;

const selectUser = () => fireEvent.click(screen.getByRole('button', { name: /select-user/i }));
const submit = () => fireEvent.click(screen.getByRole('button', { name: /add member/i }));

beforeEach(() => {
  jest.clearAllMocks();
  mockInvite.mockResolvedValue({ data: invitedMember });
});

describe('InviteMemberForm', () => {
  test('disables the submit button until a user is selected', () => {
    render(<InviteMemberForm projectId="p1" />);

    expect(screen.getByRole('button', { name: /add member/i })).toBeDisabled();
    selectUser();
    expect(screen.getByRole('button', { name: /add member/i })).toBeEnabled();
  });

  test('submitting without a selected user does not call the API', () => {
    const { container } = render(<InviteMemberForm projectId="p1" />);
    fireEvent.submit(container.querySelector('form') as HTMLFormElement);
    expect(mockInvite).not.toHaveBeenCalled();
  });

  test('invites the selected user with the chosen role and resets the form', async () => {
    const onSuccess = jest.fn();
    render(<InviteMemberForm projectId="p1" onSuccess={onSuccess} />);

    selectUser();
    fireEvent.change(screen.getByLabelText(/role/i), { target: { value: 'editor' } });
    submit();

    await waitFor(() => {
      expect(mockInvite).toHaveBeenCalledWith('p1', { email: 'alice@example.com', role: 'editor' });
    });
    expect(onSuccess).toHaveBeenCalledWith(invitedMember);
    await waitFor(() => expect(screen.getByTestId('selected-user')).toHaveTextContent('none'));
    expect(screen.getByLabelText(/role/i)).toHaveValue('viewer');
  });

  test('defaults to the viewer role', async () => {
    render(<InviteMemberForm projectId="p1" />);

    selectUser();
    submit();

    await waitFor(() => {
      expect(mockInvite).toHaveBeenCalledWith('p1', { email: 'alice@example.com', role: 'viewer' });
    });
  });

  test('shows a loading label while inviting', async () => {
    let resolveInvite: (value: unknown) => void = noop;
    mockInvite.mockImplementation(() => new Promise((resolve) => { resolveInvite = resolve; }));
    render(<InviteMemberForm projectId="p1" />);

    selectUser();
    submit();

    expect(await screen.findByRole('button', { name: /adding/i })).toBeDisabled();
    resolveInvite({ data: invitedMember });
    await waitFor(() => expect(screen.getByRole('button', { name: /add member/i })).toBeInTheDocument());
  });

  test('shows the API error message on failure', async () => {
    mockInvite.mockRejectedValue(new Error('Already a member'));
    render(<InviteMemberForm projectId="p1" />);

    selectUser();
    submit();

    expect(await screen.findByText('Already a member')).toBeInTheDocument();
  });

  test('shows a fallback error when the rejection is not an Error', async () => {
    mockInvite.mockRejectedValue('nope');
    render(<InviteMemberForm projectId="p1" />);

    selectUser();
    submit();

    expect(await screen.findByText('Failed to invite member')).toBeInTheDocument();
  });
});

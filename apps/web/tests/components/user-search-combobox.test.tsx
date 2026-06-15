import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { UserSearchCombobox } from '@/components/user-search-combobox';
import type { UserSearchResult } from '@/lib/api';

const mockSearch = jest.fn();

jest.mock('@/lib/api', () => ({
  usersApi: { search: (...arguments_: unknown[]) => mockSearch(...arguments_) },
}));

const alice: UserSearchResult = { userId: 'u1', displayName: 'Alice', email: 'alice@example.com' };
const bob: UserSearchResult = { userId: 'u2', displayName: 'Bob', email: 'bob@example.com' };

const type = (value: string) => {
  fireEvent.change(screen.getByRole('textbox'), { target: { value } });
};

beforeEach(() => {
  jest.clearAllMocks();
  mockSearch.mockResolvedValue({ data: { users: [alice, bob] } });
});

describe('UserSearchCombobox', () => {
  test('renders the placeholder', () => {
    render(<UserSearchCombobox projectId="p1" value={null} onChange={jest.fn()} placeholder="Find someone" />);
    expect(screen.getByPlaceholderText('Find someone')).toBeInTheDocument();
  });

  test('does not search for queries shorter than two characters', async () => {
    render(<UserSearchCombobox projectId="p1" value={null} onChange={jest.fn()} />);
    type('a');
    await new Promise((resolve) => setTimeout(resolve, 400));
    expect(mockSearch).not.toHaveBeenCalled();
  });

  test('debounces and renders matching results', async () => {
    render(<UserSearchCombobox projectId="p1" value={null} onChange={jest.fn()} />);

    type('al');

    expect(await screen.findByText('Alice')).toBeInTheDocument();
    expect(screen.getByText('Bob')).toBeInTheDocument();
    expect(mockSearch).toHaveBeenCalledWith('al', 'p1');
  });

  test('selecting a user invokes onChange and closes the dropdown', async () => {
    const onChange = jest.fn();
    render(<UserSearchCombobox projectId="p1" value={null} onChange={onChange} />);

    type('al');
    const option = await screen.findByText('Alice');
    fireEvent.mouseDown(option);

    expect(onChange).toHaveBeenCalledWith(alice);
    await waitFor(() => expect(screen.queryByText('Bob')).not.toBeInTheDocument());
  });

  test('shows the selected value formatted in the input', () => {
    render(<UserSearchCombobox projectId="p1" value={alice} onChange={jest.fn()} />);
    expect(screen.getByRole('textbox')).toHaveValue('Alice (alice@example.com)');
  });

  test('typing while a value is selected clears the selection', () => {
    const onChange = jest.fn();
    render(<UserSearchCombobox projectId="p1" value={alice} onChange={onChange} />);

    type('Alice (alice@example.com)x');
    expect(onChange).toHaveBeenCalledWith(null);
  });

  test('renders a no-results message when the search is empty', async () => {
    mockSearch.mockResolvedValue({ data: { users: [] } });
    render(<UserSearchCombobox projectId="p1" value={null} onChange={jest.fn()} />);

    type('zz');
    expect(await screen.findByText(/no users found/i)).toBeInTheDocument();
  });

  test('swallows API errors and shows no results', async () => {
    mockSearch.mockRejectedValue(new Error('boom'));
    render(<UserSearchCombobox projectId="p1" value={null} onChange={jest.fn()} />);

    type('zz');
    await waitFor(() => expect(mockSearch).toHaveBeenCalled());
    expect(screen.queryByText('Alice')).not.toBeInTheDocument();
  });

  test('re-focusing the input reopens the dropdown when results exist', async () => {
    render(<UserSearchCombobox projectId="p1" value={null} onChange={jest.fn()} />);
    const input = screen.getByRole('textbox');

    type('al');
    await screen.findByText('Alice');

    fireEvent.blur(input);
    await waitFor(() => expect(screen.queryByText('Alice')).not.toBeInTheDocument());

    fireEvent.focus(input);
    expect(await screen.findByText('Alice')).toBeInTheDocument();
  });

  test('blurring with no results keeps the dropdown closed', async () => {
    render(<UserSearchCombobox projectId="p1" value={null} onChange={jest.fn()} />);
    const input = screen.getByRole('textbox');

    fireEvent.focus(input);
    fireEvent.blur(input);
    await new Promise((resolve) => setTimeout(resolve, 200));
    expect(screen.queryByText('Alice')).not.toBeInTheDocument();
  });

  test('is disabled when the disabled prop is set', () => {
    render(<UserSearchCombobox projectId="p1" value={null} onChange={jest.fn()} disabled={true} />);
    expect(screen.getByRole('textbox')).toBeDisabled();
  });

  test('clearing the query below two characters closes the dropdown', async () => {
    render(<UserSearchCombobox projectId="p1" value={null} onChange={jest.fn()} />);

    type('al');
    await screen.findByText('Alice');

    type('');
    await waitFor(() => expect(screen.queryByText('Alice')).not.toBeInTheDocument());
  });
});

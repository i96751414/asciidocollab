import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { ProjectForm } from '@/components/project-form';

const mockCreate = jest.fn();
const mockPush = jest.fn();
const mockBack = jest.fn();

jest.mock('next/navigation', () => ({
  useRouter: () => ({ push: mockPush, back: mockBack }),
}));

jest.mock('@/lib/api', () => ({
  projectsApi: { create: (...arguments_: unknown[]) => mockCreate(...arguments_) },
}));

const noop = () => undefined;

const fillName = (value: string) => {
  fireEvent.change(screen.getByLabelText(/project name/i), { target: { value } });
};

beforeEach(() => {
  jest.clearAllMocks();
  mockCreate.mockResolvedValue({ data: { id: 'p1' } });
});

describe('ProjectForm', () => {
  test('renders the name, description, and tags fields', () => {
    render(<ProjectForm />);
    expect(screen.getByLabelText(/project name/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/description/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/tags/i)).toBeInTheDocument();
  });

  test('submits trimmed values and calls onSuccess when provided', async () => {
    const onSuccess = jest.fn();
    render(<ProjectForm onSuccess={onSuccess} />);

    fillName('My Project');
    fireEvent.change(screen.getByLabelText(/description/i), { target: { value: 'Some description' } });
    fireEvent.change(screen.getByLabelText(/tags/i), { target: { value: 'docs, api' } });
    fireEvent.click(screen.getByRole('button', { name: /create project/i }));

    await waitFor(() => {
      expect(mockCreate).toHaveBeenCalledWith({
        name: 'My Project',
        description: 'Some description',
        tags: ['docs', 'api'],
      });
    });
    expect(onSuccess).toHaveBeenCalledTimes(1);
    expect(mockPush).not.toHaveBeenCalled();
  });

  test('omits an empty description and redirects to the dashboard without onSuccess', async () => {
    render(<ProjectForm />);

    fillName('Solo Project');
    fireEvent.click(screen.getByRole('button', { name: /create project/i }));

    await waitFor(() => {
      expect(mockCreate).toHaveBeenCalledWith({
        name: 'Solo Project',
        description: undefined,
        tags: [],
      });
    });
    expect(mockPush).toHaveBeenCalledWith('/dashboard');
  });

  test('shows a loading label while submitting', async () => {
    let resolveCreate: (value: unknown) => void = noop;
    mockCreate.mockImplementation(() => new Promise((resolve) => { resolveCreate = resolve; }));
    render(<ProjectForm />);

    fillName('Pending');
    fireEvent.click(screen.getByRole('button', { name: /create project/i }));

    const submitButton = await screen.findByRole('button', { name: /creating/i });
    expect(submitButton).toBeDisabled();

    resolveCreate({ data: { id: 'p1' } });
    await waitFor(() => expect(mockPush).toHaveBeenCalled());
  });

  test('displays the error message when the API rejects with an Error', async () => {
    mockCreate.mockRejectedValue(new Error('Server exploded'));
    render(<ProjectForm />);

    fillName('Boom');
    fireEvent.click(screen.getByRole('button', { name: /create project/i }));

    expect(await screen.findByText('Server exploded')).toBeInTheDocument();
  });

  test('displays a fallback error when the rejection is not an Error', async () => {
    mockCreate.mockRejectedValue('plain string');
    render(<ProjectForm />);

    fillName('Boom');
    fireEvent.click(screen.getByRole('button', { name: /create project/i }));

    expect(await screen.findByText('Failed to create project')).toBeInTheDocument();
  });

  test('Cancel navigates back', () => {
    render(<ProjectForm />);
    fireEvent.click(screen.getByRole('button', { name: /cancel/i }));
    expect(mockBack).toHaveBeenCalledTimes(1);
  });
});

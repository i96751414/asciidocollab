import React from 'react';
import { render, screen } from '@testing-library/react';

jest.mock('@/components/project-form', () => ({
  ProjectForm: () => <div data-testid="project-form" />,
}));

import NewProjectPage from '@/app/(dashboard)/dashboard/projects/new/page';

describe('NewProjectPage', () => {
  test('renders the create-project heading and copy', () => {
    render(<NewProjectPage />);
    expect(screen.getByRole('heading', { name: /create new project/i })).toBeInTheDocument();
    expect(screen.getByText(/start a new collaborative documentation project/i)).toBeInTheDocument();
  });

  test('renders the project form', () => {
    render(<NewProjectPage />);
    expect(screen.getByTestId('project-form')).toBeInTheDocument();
  });
});

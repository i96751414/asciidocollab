import React from 'react';
import { render, screen } from '@testing-library/react';
import { EmptyState } from '@/components/empty-state';

jest.mock('next/link', () => {
  const MockLink = ({ children, href }: { children: React.ReactNode; href: string }) => (
    <a href={href}>{children}</a>
  );
  MockLink.displayName = 'MockLink';
  return MockLink;
});

describe('EmptyState', () => {
  test('renders the title and description', () => {
    render(<EmptyState title="Nothing here" description="No projects yet." />);
    expect(screen.getByRole('heading', { name: 'Nothing here' })).toBeInTheDocument();
    expect(screen.getByText('No projects yet.')).toBeInTheDocument();
  });

  test('does not render an action when only the label is provided', () => {
    render(<EmptyState title="T" description="D" actionLabel="Create" />);
    expect(screen.queryByRole('link')).not.toBeInTheDocument();
  });

  test('does not render an action when only the href is provided', () => {
    render(<EmptyState title="T" description="D" actionHref="/new" />);
    expect(screen.queryByRole('link')).not.toBeInTheDocument();
  });

  test('renders the action link when both label and href are provided', () => {
    render(
      <EmptyState title="T" description="D" actionLabel="Create project" actionHref="/new" />,
    );
    const link = screen.getByRole('link', { name: 'Create project' });
    expect(link).toHaveAttribute('href', '/new');
  });
});

import React from 'react';
import { render, screen } from '@testing-library/react';
import { ProjectCard } from '@/components/project-card';
import type { Project } from '@/lib/api';

const makeProject = (role: Project['role']): Project => ({
  id: '1',
  name: 'My Project',
  description: 'A description',
  ownerId: 'u1',
  ownerName: 'Owner',
  tags: [],
  rootFolderId: null,
  archivedAt: null,
  role,
  createdAt: new Date().toISOString(),
  updatedAt: new Date().toISOString(),
});

jest.mock('next/link', () => {
  const MockLink = ({ children, href }: { children: React.ReactNode; href: string }) => (
    <a href={href}>{children}</a>
  );
  MockLink.displayName = 'MockLink';
  return MockLink;
});

describe('ProjectCard', () => {
  test('shows settings link for owner role', () => {
    render(<ProjectCard project={makeProject('owner')} />);
    expect(screen.getByText('Settings')).toBeInTheDocument();
  });

  test('does not show settings link for viewer role', () => {
    render(<ProjectCard project={makeProject('viewer')} />);
    expect(screen.queryByText('Settings')).not.toBeInTheDocument();
  });

  test('does not show settings link for editor role', () => {
    render(<ProjectCard project={makeProject('editor')} />);
    expect(screen.queryByText('Settings')).not.toBeInTheDocument();
  });

  test('renders project name and description', () => {
    render(<ProjectCard project={makeProject('viewer')} />);
    expect(screen.getByText('My Project')).toBeInTheDocument();
    expect(screen.getByText('A description')).toBeInTheDocument();
  });
});

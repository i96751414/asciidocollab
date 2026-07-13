import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import { FolderTreeSelect } from '@/components/folder-tree-select';
import type { FolderNode } from '@/hooks/use-project-folders';

const TREE: FolderNode[] = [
  { path: 'assets', name: 'assets', children: [{ path: 'assets/fonts', name: 'fonts', children: [] }] },
  { path: 'branding', name: 'branding', children: [] },
];

describe('FolderTreeSelect', () => {
  it('shows the empty label when there are no folders', () => {
    render(
      <FolderTreeSelect tree={[]} selected={new Set()} onToggle={jest.fn()} multi ariaLabel="Fonts" emptyLabel="No folders" />,
    );
    expect(screen.getByText('No folders')).toBeInTheDocument();
  });

  it('hides nested folders until the parent is expanded', () => {
    render(
      <FolderTreeSelect tree={TREE} selected={new Set()} onToggle={jest.fn()} multi ariaLabel="Fonts" emptyLabel="—" />,
    );
    expect(screen.queryByLabelText('assets/fonts')).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Expand assets' }));
    expect(screen.getByLabelText('assets/fonts')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Collapse assets' }));
    expect(screen.queryByLabelText('assets/fonts')).not.toBeInTheDocument();
  });

  it('auto-expands the ancestors of a selected path', () => {
    render(
      <FolderTreeSelect tree={TREE} selected={new Set(['assets/fonts'])} onToggle={jest.fn()} multi ariaLabel="Fonts" emptyLabel="—" />,
    );
    expect(screen.getByLabelText('assets/fonts')).toBeChecked();
  });

  it('toggles a folder via its checkbox in multi mode', () => {
    const onToggle = jest.fn();
    render(
      <FolderTreeSelect tree={TREE} selected={new Set()} onToggle={onToggle} multi ariaLabel="Fonts" emptyLabel="—" />,
    );
    const input = screen.getByLabelText('branding');
    expect(input).toHaveAttribute('type', 'checkbox');
    fireEvent.click(input);
    expect(onToggle).toHaveBeenCalledWith('branding');
  });

  it('renders radios and reflects the selection in single mode', () => {
    render(
      <FolderTreeSelect tree={TREE} selected={new Set(['branding'])} onToggle={jest.fn()} multi={false} ariaLabel="Images" emptyLabel="—" />,
    );
    const input = screen.getByLabelText('branding');
    expect(input).toHaveAttribute('type', 'radio');
    expect(input).toBeChecked();
  });
});

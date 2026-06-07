import React from 'react';
import { render } from '@testing-library/react';
import { Skeleton, Spinner, PageSkeleton } from '@/components/ui/skeleton';

describe('Skeleton', () => {
  test('renders a div with animate-pulse class', () => {
    const { container } = render(<Skeleton />);
    expect(container.firstChild).toHaveClass('animate-pulse');
  });

  test('accepts additional className', () => {
    const { container } = render(<Skeleton className="h-8 w-48" />);
    expect(container.firstChild).toHaveClass('h-8');
  });
});

describe('Spinner', () => {
  test('renders a flex container with a spinning element', () => {
    const { container } = render(<Spinner />);
    expect(container.querySelector('.animate-spin')).toBeInTheDocument();
  });
});

describe('PageSkeleton', () => {
  test('renders multiple skeleton placeholders', () => {
    const { container } = render(<PageSkeleton />);
    const skeletons = container.querySelectorAll('.animate-pulse');
    expect(skeletons.length).toBeGreaterThanOrEqual(3);
  });
});

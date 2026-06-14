// AuthLayout tests.
// Requires: @testing-library/react, @testing-library/jest-dom, jest-environment-jsdom
import React from 'react';
import { render, screen } from '@testing-library/react';

jest.mock('next/link', () => ({
  __esModule: true,
  default: ({ href, children }: { href: string; children: React.ReactNode }) => <a href={href}>{children}</a>,
}));

const { default: AuthLayout } = require('@/app/(auth)/layout');

describe('AuthLayout', () => {
  test('renders the tagline and its children', () => {
    render(
      <AuthLayout>
        <div data-testid="child">inner content</div>
      </AuthLayout>,
    );
    expect(screen.getByText(/collaborative asciidoc editing for teams/i)).toBeInTheDocument();
    expect(screen.getByTestId('child')).toBeInTheDocument();
  });
});

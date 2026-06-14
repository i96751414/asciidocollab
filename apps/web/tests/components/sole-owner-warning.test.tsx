import React from 'react';
import { render, screen } from '@testing-library/react';
import { SoleOwnerWarning } from '@/components/sole-owner-warning';

describe('SoleOwnerWarning', () => {
  test('renders the warning when visible', () => {
    render(<SoleOwnerWarning visible={true} />);
    expect(screen.getByText(/sole owner of this project/i)).toBeInTheDocument();
    expect(screen.getByText(/cannot remove yourself/i)).toBeInTheDocument();
  });

  test('renders nothing when not visible', () => {
    const { container } = render(<SoleOwnerWarning visible={false} />);
    expect(container).toBeEmptyDOMElement();
    expect(screen.queryByText(/sole owner of this project/i)).not.toBeInTheDocument();
  });
});

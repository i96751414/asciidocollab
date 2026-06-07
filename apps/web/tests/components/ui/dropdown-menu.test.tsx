import React from 'react';
import { render, screen } from '@testing-library/react';

jest.mock('@radix-ui/react-dropdown-menu', () => ({
  Root: ({ children }: { children: React.ReactNode }) => <>{children}</>,
  Trigger: ({ children }: { children: React.ReactNode }) => <button>{children}</button>,
  Portal: ({ children }: { children: React.ReactNode }) => <>{children}</>,
  Content: React.forwardRef<HTMLDivElement, React.HTMLAttributes<HTMLDivElement>>(
    ({ children, ...props }, ref) => <div ref={ref} data-testid="cm-content" {...props}>{children}</div>
  ),
  Item: React.forwardRef<HTMLDivElement, React.HTMLAttributes<HTMLDivElement>>(
    ({ children, ...props }, ref) => <div ref={ref} {...props}>{children}</div>
  ),
  Separator: React.forwardRef<HTMLHRElement, React.HTMLAttributes<HTMLHRElement>>(
    (props, ref) => <hr ref={ref} data-testid="cm-separator" {...props} />
  ),
}));

import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
} from '@/components/ui/dropdown-menu';

describe('DropdownMenuContent', () => {
  test('renders children inside content wrapper', () => {
    render(
      <DropdownMenu>
        <DropdownMenuTrigger>Open</DropdownMenuTrigger>
        <DropdownMenuContent>
          <DropdownMenuItem>Item one</DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    );
    expect(screen.getByText('Item one')).toBeInTheDocument();
  });
});

describe('DropdownMenuSeparator', () => {
  test('renders a separator element', () => {
    render(
      <DropdownMenu>
        <DropdownMenuContent>
          <DropdownMenuItem>A</DropdownMenuItem>
          <DropdownMenuSeparator />
          <DropdownMenuItem>B</DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    );
    expect(screen.getByTestId('cm-separator')).toBeInTheDocument();
  });
});

describe('DropdownMenuItem inset prop', () => {
  test('applies pl-8 class when inset is true', () => {
    render(
      <DropdownMenu>
        <DropdownMenuContent>
          <DropdownMenuItem inset>Inset item</DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    );
    const item = screen.getByText('Inset item').closest('div');
    expect(item?.className).toContain('pl-8');
  });
});

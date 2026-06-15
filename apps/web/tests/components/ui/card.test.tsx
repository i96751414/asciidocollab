import React from 'react';
import { render, screen } from '@testing-library/react';
import {
  Card,
  CardHeader,
  CardFooter,
  CardTitle,
  CardDescription,
  CardContent,
} from '@/components/ui/card';

describe('Card primitives', () => {
  test('Card renders children and merges a className', () => {
    render(<Card className="custom">body</Card>);
    const card = screen.getByText('body');
    expect(card).toHaveClass('custom');
    expect(card).toHaveClass('rounded-lg');
  });

  test('CardHeader renders its content', () => {
    render(<CardHeader className="hdr">header</CardHeader>);
    expect(screen.getByText('header')).toHaveClass('hdr');
  });

  test('CardTitle renders as a heading', () => {
    render(<CardTitle>Title text</CardTitle>);
    const title = screen.getByText('Title text');
    expect(title.tagName).toBe('H3');
  });

  test('CardDescription renders as a paragraph', () => {
    render(<CardDescription>Desc text</CardDescription>);
    const description = screen.getByText('Desc text');
    expect(description.tagName).toBe('P');
  });

  test('CardContent renders its content', () => {
    render(<CardContent className="content">content</CardContent>);
    expect(screen.getByText('content')).toHaveClass('content');
  });

  test('CardFooter renders its content with footer styles', () => {
    render(<CardFooter className="ftr">footer</CardFooter>);
    const footer = screen.getByText('footer');
    expect(footer).toHaveClass('ftr');
    expect(footer).toHaveClass('items-center');
  });

  test('forwards a ref to the underlying element', () => {
    const ref = React.createRef<HTMLDivElement>();
    render(<Card ref={ref}>ref body</Card>);
    expect(ref.current).toBeInstanceOf(HTMLDivElement);
  });
});

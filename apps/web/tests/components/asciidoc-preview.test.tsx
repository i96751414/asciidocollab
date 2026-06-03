import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { AsciiDocPreview, isAsciiDocFile } from '@/components/asciidoc-preview';

// T027: Mock dynamic import('asciidoctor')
jest.mock('asciidoctor', () => {
  const mockProcessor = {
    convert: jest.fn().mockReturnValue('<p>Hello</p>'),
  };
  const MockAsciidoctor = jest.fn().mockReturnValue(mockProcessor);
  return MockAsciidoctor;
}, { virtual: true });

describe('AsciiDocPreview', () => {
  // T027 (a): isOpen=false → only toggle button rendered, no content
  it('renders only the toggle button when isOpen=false', () => {
    const onToggle = jest.fn();
    render(<AsciiDocPreview content="= Hello" isOpen={false} onToggle={onToggle} />);
    expect(screen.getByRole('button')).toBeInTheDocument();
    expect(screen.queryByText('<p>Hello</p>')).not.toBeInTheDocument();
  });

  // T027 (b): clicking toggle calls onToggle
  it('clicking toggle button calls onToggle', () => {
    const onToggle = jest.fn();
    render(<AsciiDocPreview content="= Hello" isOpen={false} onToggle={onToggle} />);
    fireEvent.click(screen.getByRole('button'));
    expect(onToggle).toHaveBeenCalledTimes(1);
  });

  // T027 (c): isOpen=true with mocked asciidoctor → HTML rendered
  it('renders HTML output from asciidoctor when isOpen=true', async () => {
    render(<AsciiDocPreview content="= Hello" isOpen={true} onToggle={jest.fn()} />);
    await waitFor(() => {
      const container = document.querySelector('[data-testid="asciidoc-output"]');
      expect(container).toBeInTheDocument();
      expect(container?.innerHTML).toContain('<p>Hello</p>');
    });
  });

  // T028: isAsciiDocFile helper
  describe('isAsciiDocFile', () => {
    it.each([
      ['doc.adoc', true],
      ['doc.asciidoc', true],
      ['doc.asc', true],
      ['DOC.ADOC', true],
      ['doc.txt', false],
      ['doc.json', false],
      ['noextension', false],
      ['', false],
      // C6: a dotfile like ".adoc" has no real name part — must not be treated as AsciiDoc
      ['.adoc', false],
      ['.asciidoc', false],
    ])('isAsciiDocFile(%s) === %s', (name, expected) => {
      expect(isAsciiDocFile(name)).toBe(expected);
    });
  });
});

import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import {
  PreviewStyleControl,
  isPreviewStyleValue,
  PREVIEW_STYLE_LABELS,
} from '@/components/preview-style-control';

describe('isPreviewStyleValue', () => {
  test('accepts known tokens', () => {
    expect(isPreviewStyleValue('asciidocollab')).toBe(true);
    expect(isPreviewStyleValue('asciidoctor')).toBe(true);
  });

  test('rejects unknown tokens', () => {
    expect(isPreviewStyleValue('markdown')).toBe(false);
    expect(isPreviewStyleValue('')).toBe(false);
  });
});

describe('PREVIEW_STYLE_LABELS', () => {
  test('maps each token to a display label', () => {
    expect(PREVIEW_STYLE_LABELS.asciidocollab).toBe('Asciidocollab');
    expect(PREVIEW_STYLE_LABELS.asciidoctor).toBe('Asciidoctor');
  });
});

describe('PreviewStyleControl', () => {
  test('renders both options with the default aria-label', () => {
    render(<PreviewStyleControl value="asciidocollab" onChange={jest.fn()} />);
    expect(screen.getByRole('group', { name: 'Preview style' })).toBeInTheDocument();
    expect(screen.getByTestId('preview-style-asciidocollab')).toBeInTheDocument();
    expect(screen.getByTestId('preview-style-asciidoctor')).toBeInTheDocument();
  });

  test('marks the active option with aria-pressed', () => {
    render(<PreviewStyleControl value="asciidoctor" onChange={jest.fn()} />);
    expect(screen.getByTestId('preview-style-asciidoctor')).toHaveAttribute('aria-pressed', 'true');
    expect(screen.getByTestId('preview-style-asciidocollab')).toHaveAttribute(
      'aria-pressed',
      'false',
    );
  });

  test('calls onChange with the picked option', () => {
    const onChange = jest.fn();
    render(<PreviewStyleControl value="asciidocollab" onChange={onChange} />);
    fireEvent.click(screen.getByTestId('preview-style-asciidoctor'));
    expect(onChange).toHaveBeenCalledWith('asciidoctor');
  });

  test('applies compact sizing when compact is set', () => {
    render(<PreviewStyleControl value="asciidocollab" onChange={jest.fn()} compact={true} />);
    expect(screen.getByRole('group')).toHaveClass('h-6');
    expect(screen.getByTestId('preview-style-asciidocollab')).toHaveClass('text-xs');
  });

  test('applies regular sizing when compact is not set', () => {
    render(<PreviewStyleControl value="asciidocollab" onChange={jest.fn()} />);
    expect(screen.getByRole('group')).toHaveClass('h-9');
    expect(screen.getByTestId('preview-style-asciidocollab')).toHaveClass('text-sm');
  });

  test('honours a custom aria-label', () => {
    render(
      <PreviewStyleControl value="asciidocollab" onChange={jest.fn()} ariaLabel="Render mode" />,
    );
    expect(screen.getByRole('group', { name: 'Render mode' })).toBeInTheDocument();
  });
});

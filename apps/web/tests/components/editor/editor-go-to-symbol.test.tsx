import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import { EditorGoToSymbol } from '@/components/editor/editor-go-to-symbol';
import type { ProjectSymbol } from '@asciidocollab/shared';

const SYMBOLS: ProjectSymbol[] = [
  { kind: 'section', name: 'overview', fileId: 'main', range: { from: 0, to: 5 } },
  { kind: 'section', name: 'installation', fileId: 'chapter1', range: { from: 10, to: 20 } },
  { kind: 'anchor', name: 'api-reference', fileId: 'chapter2', range: { from: 30, to: 40 } },
];
const pathOf = (id: string) => ({ main: 'main.adoc', chapter1: 'ch1.adoc', chapter2: 'ch2.adoc' }[id] ?? null);

function renderPalette(overrides: Partial<React.ComponentProps<typeof EditorGoToSymbol>> = {}) {
  const onSelect = jest.fn();
  const onClose = jest.fn();
  render(
    <EditorGoToSymbol open symbols={SYMBOLS} pathOf={pathOf} onSelect={onSelect} onClose={onClose} {...overrides} />,
  );
  return { onSelect, onClose };
}

describe('EditorGoToSymbol', () => {
  test('renders nothing when closed', () => {
    const { container } = render(
      <EditorGoToSymbol open={false} symbols={SYMBOLS} pathOf={pathOf} onSelect={jest.fn()} onClose={jest.fn()} />,
    );
    expect(container).toBeEmptyDOMElement();
  });

  test('lists every section and anchor symbol', () => {
    renderPalette();
    expect(screen.getByText('overview')).toBeInTheDocument();
    expect(screen.getByText('installation')).toBeInTheDocument();
    expect(screen.getByText('api-reference')).toBeInTheDocument();
  });

  test('filters the list by the typed query (name or path)', () => {
    renderPalette();
    fireEvent.change(screen.getByRole('textbox'), { target: { value: 'install' } });
    expect(screen.getByText('installation')).toBeInTheDocument();
    expect(screen.queryByText('overview')).not.toBeInTheDocument();
  });

  test('filters on the file path too', () => {
    renderPalette();
    fireEvent.change(screen.getByRole('textbox'), { target: { value: 'ch2' } });
    expect(screen.getByText('api-reference')).toBeInTheDocument();
    expect(screen.queryByText('installation')).not.toBeInTheDocument();
  });

  test('Enter selects the highlighted (first) symbol', () => {
    const { onSelect } = renderPalette();
    fireEvent.keyDown(screen.getByRole('textbox'), { key: 'Enter' });
    expect(onSelect).toHaveBeenCalledWith(SYMBOLS[0]);
  });

  test('ArrowDown moves the highlight before selecting', () => {
    const { onSelect } = renderPalette();
    const input = screen.getByRole('textbox');
    fireEvent.keyDown(input, { key: 'ArrowDown' });
    fireEvent.keyDown(input, { key: 'Enter' });
    expect(onSelect).toHaveBeenCalledWith(SYMBOLS[1]);
  });

  test('clicking a row selects that symbol', () => {
    const { onSelect } = renderPalette();
    fireEvent.click(screen.getByText('api-reference'));
    expect(onSelect).toHaveBeenCalledWith(SYMBOLS[2]);
  });

  test('Escape closes the palette', () => {
    const { onClose } = renderPalette();
    fireEvent.keyDown(screen.getByRole('textbox'), { key: 'Escape' });
    expect(onClose).toHaveBeenCalled();
  });

  test('shows an empty state when nothing matches', () => {
    renderPalette();
    fireEvent.change(screen.getByRole('textbox'), { target: { value: 'zzz-no-match' } });
    expect(screen.getByText(/no matching symbols/i)).toBeInTheDocument();
  });

  test('Enter is a no-op when the filtered list is empty', () => {
    const { onSelect } = renderPalette();
    fireEvent.change(screen.getByRole('textbox'), { target: { value: 'zzz-no-match' } });
    fireEvent.keyDown(screen.getByRole('textbox'), { key: 'Enter' });
    expect(onSelect).not.toHaveBeenCalled();
  });
});

import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import { AsciiDocPreview, isAsciiDocFile } from '@/components/asciidoc-preview';

// ── Mock useAsciidocPreview ──────────────────────────────────────────────────

jest.mock('@/hooks/use-asciidoc-preview', () => ({
  useAsciidocPreview: jest.fn(),
}));

import { useAsciidocPreview } from '@/hooks/use-asciidoc-preview';
const mockUsePreview = useAsciidocPreview as jest.Mock;

const fakeReference: React.RefObject<HTMLDivElement> = { current: null };

beforeEach(() => {
  mockUsePreview.mockReset();
  mockUsePreview.mockReturnValue({
    html: null,
    state: 'idle',
    error: null,
    previewRef: fakeReference,
  });
});

// ── Component tests ──────────────────────────────────────────────────────────

describe('AsciiDocPreview', () => {
  // (a) renders HTML inside .asciidoc-preview-content when html is non-null
  it('renders HTML output inside .asciidoc-preview-content when html is non-null', () => {
    mockUsePreview.mockReturnValue({
      html: '<h1>Hello</h1>',
      state: 'up-to-date',
      error: null,
      previewRef: fakeReference,
    });

    const { container } = render(
      <AsciiDocPreview content="= Hello" isEnabled={true} scrollToLine={null} />,
    );

    const wrapper = container.querySelector('.asciidoc-preview-content');
    expect(wrapper).toBeInTheDocument();
    expect(wrapper?.innerHTML).toContain('<h1>Hello</h1>');
  });

  // (b) shows rendering indicator when state is pending or rendering
  it('shows rendering indicator when state is pending', () => {
    mockUsePreview.mockReturnValue({ html: null, state: 'pending', error: null, previewRef: fakeReference });
    render(<AsciiDocPreview content="= Hello" isEnabled={true} scrollToLine={null} />);
    expect(screen.getByTestId('sync-indicator')).toBeInTheDocument();
    expect(screen.queryByText('✓')).not.toBeInTheDocument();
  });

  it('shows rendering indicator when state is rendering', () => {
    mockUsePreview.mockReturnValue({ html: '<h1>A</h1>', state: 'rendering', error: null, previewRef: fakeReference });
    render(<AsciiDocPreview content="= Hello" isEnabled={true} scrollToLine={null} />);
    expect(screen.getByTestId('sync-indicator')).toBeInTheDocument();
    expect(screen.queryByText('✓')).not.toBeInTheDocument();
  });

  // (c) shows "✓" indicator when state is up-to-date
  it('shows ✓ indicator when state is up-to-date', () => {
    mockUsePreview.mockReturnValue({ html: '<h1>A</h1>', state: 'up-to-date', error: null, previewRef: fakeReference });
    render(<AsciiDocPreview content="= Hello" isEnabled={true} scrollToLine={null} />);
    expect(screen.getByText('✓')).toBeInTheDocument();
  });

  // (d) shows "Preview not available" when isEnabled is false
  it('shows "Preview not available" message when isEnabled is false', () => {
    mockUsePreview.mockReturnValue({ html: null, state: 'idle', error: null, previewRef: fakeReference });
    render(<AsciiDocPreview content="" isEnabled={false} scrollToLine={null} />);
    expect(screen.getByText(/preview not available/i)).toBeInTheDocument();
  });

  // (e) data-testid="asciidoc-output" present when html is rendered
  it('renders data-testid="asciidoc-output" when HTML is present', () => {
    mockUsePreview.mockReturnValue({ html: '<p>Hello</p>', state: 'up-to-date', error: null, previewRef: fakeReference });
    render(<AsciiDocPreview content="= Hello" isEnabled={true} scrollToLine={null} />);
    expect(screen.getByTestId('asciidoc-output')).toBeInTheDocument();
  });

  // Phase 5 (US3): full sync indicator — error, idle file-type, recovery

  // (a) error state: shows "⚠ Preview error" and error message; previous html still visible
  it('shows error indicator and message when state is error', () => {
    mockUsePreview.mockReturnValue({
      html: '<h1>Previous</h1>',
      state: 'error',
      error: 'Asciidoctor parse error',
      previewRef: fakeReference,
    });
    render(<AsciiDocPreview content="bad" isEnabled={true} scrollToLine={null} />);
    expect(screen.getByText(/preview error/i)).toBeInTheDocument();
    expect(screen.getByText(/Asciidoctor parse error/)).toBeInTheDocument();
    // Previous HTML still rendered
    expect(screen.getByTestId('asciidoc-output')).toBeInTheDocument();
  });

  // (b) isEnabled=false: indicator shows "–" and content shows neutral message
  it('shows – indicator and file-type message when isEnabled is false', () => {
    mockUsePreview.mockReturnValue({ html: null, state: 'idle', error: null, previewRef: fakeReference });
    render(<AsciiDocPreview content="" isEnabled={false} scrollToLine={null} />);
    expect(screen.getByText('–')).toBeInTheDocument();
    expect(screen.getByText(/preview not available for this file type/i)).toBeInTheDocument();
  });

  // (c) error indicator hides when state transitions back to pending
  it('hides error indicator when state is pending', () => {
    mockUsePreview.mockReturnValue({ html: null, state: 'pending', error: null, previewRef: fakeReference });
    render(<AsciiDocPreview content="= Hello" isEnabled={true} scrollToLine={null} />);
    expect(screen.queryByText(/preview error/i)).not.toBeInTheDocument();
  });

  // scroll sync toggle
  it('renders scroll sync toggle when onToggleScrollSync is provided', () => {
    mockUsePreview.mockReturnValue({ html: null, state: 'idle', error: null, previewRef: fakeReference });
    render(
      <AsciiDocPreview
        content=""
        isEnabled={true}
        scrollToLine={null}
        scrollSyncEnabled={false}
        onToggleScrollSync={jest.fn()}
      />,
    );
    expect(screen.getByTestId('scroll-sync-toggle')).toBeInTheDocument();
  });

  it('does not render scroll sync toggle when onToggleScrollSync is not provided', () => {
    mockUsePreview.mockReturnValue({ html: null, state: 'idle', error: null, previewRef: fakeReference });
    render(<AsciiDocPreview content="" isEnabled={true} scrollToLine={null} />);
    expect(screen.queryByTestId('scroll-sync-toggle')).not.toBeInTheDocument();
  });

  it('scroll sync toggle has aria-pressed=false when scrollSyncEnabled is false', () => {
    mockUsePreview.mockReturnValue({ html: null, state: 'idle', error: null, previewRef: fakeReference });
    render(
      <AsciiDocPreview
        content=""
        isEnabled={true}
        scrollToLine={null}
        scrollSyncEnabled={false}
        onToggleScrollSync={jest.fn()}
      />,
    );
    expect(screen.getByTestId('scroll-sync-toggle')).toHaveAttribute('aria-pressed', 'false');
  });

  it('scroll sync toggle has aria-pressed=true when scrollSyncEnabled is true', () => {
    mockUsePreview.mockReturnValue({ html: null, state: 'idle', error: null, previewRef: fakeReference });
    render(
      <AsciiDocPreview
        content=""
        isEnabled={true}
        scrollToLine={null}
        scrollSyncEnabled={true}
        onToggleScrollSync={jest.fn()}
      />,
    );
    expect(screen.getByTestId('scroll-sync-toggle')).toHaveAttribute('aria-pressed', 'true');
  });

  it('calls onToggleScrollSync when scroll sync toggle is clicked', () => {
    const onToggle = jest.fn();
    mockUsePreview.mockReturnValue({ html: null, state: 'idle', error: null, previewRef: fakeReference });
    render(
      <AsciiDocPreview
        content=""
        isEnabled={true}
        scrollToLine={null}
        scrollSyncEnabled={false}
        onToggleScrollSync={onToggle}
      />,
    );
    fireEvent.click(screen.getByTestId('scroll-sync-toggle'));
    expect(onToggle).toHaveBeenCalledTimes(1);
  });

  // isAsciiDocFile helper
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
      ['.adoc', false],
      ['.asciidoc', false],
    ])('isAsciiDocFile(%s) === %s', (name, expected) => {
      expect(isAsciiDocFile(name)).toBe(expected);
    });
  });
});

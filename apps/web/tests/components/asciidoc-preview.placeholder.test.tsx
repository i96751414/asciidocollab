import React from 'react';
import { render, fireEvent } from '@testing-library/react';
import DOMPurify from 'dompurify';
import { AsciiDocPreview } from '@/components/asciidoc-preview';
import {
  INCLUDE_PLACEHOLDER_CLASS,
  INCLUDE_PLACEHOLDER_TARGET_ATTR,
} from '@/lib/asciidoc/include-placeholder';

// ── Mock useAsciidocPreview ──────────────────────────────────────────────────

jest.mock('@/hooks/use-asciidoc-preview', () => ({
  useAsciidocPreview: jest.fn(),
}));

// ── Mock the lazy-loaded math renderer (not under test here) ─────────────────
jest.mock('@/components/math/render-math', () => ({
  renderMath: jest.fn(() => Promise.resolve()),
}));

import { useAsciidocPreview } from '@/hooks/use-asciidoc-preview';
const mockUsePreview = useAsciidocPreview as jest.Mock;

const fakeReference: React.RefObject<HTMLDivElement> = { current: null };

const PLACEHOLDER_TARGET = 'parts/chapter1.adoc';
const PLACEHOLDER_HTML = `<div class="${INCLUDE_PLACEHOLDER_CLASS}" ${INCLUDE_PLACEHOLDER_TARGET_ATTR}="${PLACEHOLDER_TARGET}" role="button" tabindex="0">included: ${PLACEHOLDER_TARGET}</div>`;

function withPlaceholderHtml() {
  mockUsePreview.mockReturnValue({
    html: PLACEHOLDER_HTML,
    state: 'up-to-date',
    error: null,
    previewRef: fakeReference,
    mathPresent: false,
  });
}

beforeEach(() => {
  mockUsePreview.mockReset();
  mockUsePreview.mockReturnValue({
    html: null,
    state: 'idle',
    error: null,
    previewRef: fakeReference,
    mathPresent: false,
  });
});

// ── AsciiDocPreview placeholder interaction ────────────────────────────

describe('AsciiDocPreview placeholder click/interaction', () => {
  // Test 1: Click on placeholder calls onOpenInclude with target
  it('calls onOpenInclude with the include target when placeholder is clicked', () => {
    withPlaceholderHtml();
    const onOpenInclude = jest.fn();

    const { container } = render(
      <AsciiDocPreview
        content="= Doc"
        isEnabled={true}
        projectId="proj-1"
        scrollToLine={null}
        onOpenInclude={onOpenInclude}
      />,
    );

    const placeholder = container.querySelector(`.${INCLUDE_PLACEHOLDER_CLASS}`);
    expect(placeholder).toBeInTheDocument();

    fireEvent.click(placeholder!);

    expect(onOpenInclude).toHaveBeenCalledTimes(1);
    expect(onOpenInclude).toHaveBeenCalledWith(PLACEHOLDER_TARGET);
  });

  // Test 2: Enter key on focused placeholder calls onOpenInclude
  it('calls onOpenInclude with the include target when Enter is pressed on the placeholder', () => {
    withPlaceholderHtml();
    const onOpenInclude = jest.fn();

    const { container } = render(
      <AsciiDocPreview
        content="= Doc"
        isEnabled={true}
        projectId="proj-1"
        scrollToLine={null}
        onOpenInclude={onOpenInclude}
      />,
    );

    const placeholder = container.querySelector(`.${INCLUDE_PLACEHOLDER_CLASS}`);
    expect(placeholder).toBeInTheDocument();

    fireEvent.keyDown(placeholder!, { key: 'Enter' });

    expect(onOpenInclude).toHaveBeenCalledTimes(1);
    expect(onOpenInclude).toHaveBeenCalledWith(PLACEHOLDER_TARGET);
  });

  // Test 3: Space key on focused placeholder calls onOpenInclude
  it('calls onOpenInclude with the include target when Space is pressed on the placeholder', () => {
    withPlaceholderHtml();
    const onOpenInclude = jest.fn();

    const { container } = render(
      <AsciiDocPreview
        content="= Doc"
        isEnabled={true}
        projectId="proj-1"
        scrollToLine={null}
        onOpenInclude={onOpenInclude}
      />,
    );

    const placeholder = container.querySelector(`.${INCLUDE_PLACEHOLDER_CLASS}`);
    expect(placeholder).toBeInTheDocument();

    fireEvent.keyDown(placeholder!, { key: ' ' });

    expect(onOpenInclude).toHaveBeenCalledTimes(1);
    expect(onOpenInclude).toHaveBeenCalledWith(PLACEHOLDER_TARGET);
  });

  // Test 4: DOMPurify sanitization safety guard (Constitution VIII)
  // Uses the REAL DOMPurify — no React, no component — to confirm the placeholder
  // HTML survives the same sanitizer config used in useAsciidocPreview.
  it('placeholder element survives DOMPurify sanitization retaining class, data-include-target, role, and tabindex', () => {
    const clean = DOMPurify.sanitize(PLACEHOLDER_HTML, { USE_PROFILES: { html: true } });

    // class attribute (using the constant)
    expect(clean).toContain(`class="${INCLUDE_PLACEHOLDER_CLASS}"`);
    // data-include-target attribute with the target value
    expect(clean).toContain(`${INCLUDE_PLACEHOLDER_TARGET_ATTR}="${PLACEHOLDER_TARGET}"`);
    // role="button" — needed for a11y and delegated click handling
    expect(clean).toContain('role="button"');
    // tabindex="0" — needed for keyboard focus
    expect(clean).toContain('tabindex="0"');
  });

  // Test 5: onOpenInclude NOT called when clicking outside a placeholder
  it('does not call onOpenInclude when clicking on a non-placeholder element', () => {
    mockUsePreview.mockReturnValue({
      html: '<p id="regular-para">Some regular paragraph text</p>',
      state: 'up-to-date',
      error: null,
      previewRef: fakeReference,
      mathPresent: false,
    });
    const onOpenInclude = jest.fn();

    const { container } = render(
      <AsciiDocPreview
        content="= Doc"
        isEnabled={true}
        projectId="proj-1"
        scrollToLine={null}
        onOpenInclude={onOpenInclude}
      />,
    );

    const para = container.querySelector('#regular-para');
    expect(para).toBeInTheDocument();

    fireEvent.click(para!);

    expect(onOpenInclude).not.toHaveBeenCalled();
  });
});

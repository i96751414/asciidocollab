import React from 'react';
import { render, screen, within, fireEvent } from '@testing-library/react';
import type { RenderDiagnostic } from '@asciidocollab/asciidoc-pdf';
import { PdfDiagnostics } from '@/components/pdf-diagnostics';

const warning: RenderDiagnostic = {
  severity: 'warning',
  code: 'remote-skipped',
  resource: 'https://cdn.example.com/logo.png',
  message: 'Remote image was skipped because no network access is allowed.',
};

const errorWithLocation: RenderDiagnostic = {
  severity: 'error',
  code: 'unresolved-include',
  resource: 'chapters/missing.adoc',
  location: { path: 'book.adoc', line: 12 },
  message: 'Include target could not be resolved and was omitted.',
};

describe('PdfDiagnostics', () => {
  test('renders one row per diagnostic showing message and resource', () => {
    render(<PdfDiagnostics diagnostics={[warning, errorWithLocation]} />);

    const rows = screen.getAllByRole('listitem');
    expect(rows).toHaveLength(2);

    expect(
      screen.getByText(/remote image was skipped/i)
    ).toBeInTheDocument();
    expect(screen.getByText(warning.resource)).toBeInTheDocument();

    expect(
      screen.getByText(/include target could not be resolved/i)
    ).toBeInTheDocument();
    expect(screen.getByText(errorWithLocation.resource)).toBeInTheDocument();
  });

  test('sorts errors before warnings', () => {
    render(<PdfDiagnostics diagnostics={[warning, errorWithLocation]} />);

    const rows = screen.getAllByRole('listitem');
    expect(rows[0]).toHaveTextContent(/include target could not be resolved/i);
    expect(rows[1]).toHaveTextContent(/remote image was skipped/i);
  });

  test('exposes a locate affordance only when a location is present and invokes onSelectLocation on click', () => {
    const onSelectLocation = jest.fn();
    render(
      <PdfDiagnostics
        diagnostics={[warning, errorWithLocation]}
        onSelectLocation={onSelectLocation}
      />
    );

    // The warning has no location → no locate control in its row.
    const warningRow = screen.getByText(/remote image was skipped/i).closest('li');
    expect(warningRow).not.toBeNull();
    expect(
      within(warningRow as HTMLElement).queryByRole('button')
    ).not.toBeInTheDocument();

    // The error carries a location → a locate control is present.
    const errorRow = screen
      .getByText(/include target could not be resolved/i)
      .closest('li');
    expect(errorRow).not.toBeNull();
    const locate = within(errorRow as HTMLElement).getByRole('button');

    fireEvent.click(locate);

    expect(onSelectLocation).toHaveBeenCalledTimes(1);
    expect(onSelectLocation).toHaveBeenCalledWith(errorWithLocation.location);
  });

  test('summarises a location without a line number using its path alone', () => {
    const onSelectLocation = jest.fn();
    const errorWithoutLine: RenderDiagnostic = {
      severity: 'error',
      code: 'unresolved-include',
      resource: 'chapters/missing.adoc',
      location: { path: 'book.adoc' },
      message: 'Include target could not be resolved and was omitted.',
    };
    render(
      <PdfDiagnostics diagnostics={[errorWithoutLine]} onSelectLocation={onSelectLocation} />
    );

    const locate = screen.getByRole('button', { name: /go to book\.adoc$/i });
    expect(locate).toHaveTextContent('Go to book.adoc');
    expect(locate).not.toHaveTextContent(':');
  });

  test('renders nothing for an empty diagnostics list', () => {
    const { container } = render(<PdfDiagnostics diagnostics={[]} />);
    expect(container).toBeEmptyDOMElement();
    expect(screen.queryByRole('list')).not.toBeInTheDocument();
  });
});

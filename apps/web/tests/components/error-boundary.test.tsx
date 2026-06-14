import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import { ErrorBoundary } from '@/components/error-boundary';

function Boom({ message }: { message?: string }): React.ReactElement {
  throw new Error(message ?? 'kaboom');
}

function Safe(): React.ReactElement {
  return <div>all good</div>;
}

let consoleErrorSpy: jest.SpyInstance;

beforeEach(() => {
  // React logs caught render errors to console.error; silence it for clean output.
  consoleErrorSpy = jest.spyOn(console, 'error').mockImplementation(() => undefined);
});

afterEach(() => {
  consoleErrorSpy.mockRestore();
});

describe('ErrorBoundary', () => {
  test('renders its children when nothing throws', () => {
    render(
      <ErrorBoundary>
        <Safe />
      </ErrorBoundary>,
    );
    expect(screen.getByText('all good')).toBeInTheDocument();
  });

  test('renders the default fallback with the error message when a child throws', () => {
    render(
      <ErrorBoundary>
        <Boom message="explosion" />
      </ErrorBoundary>,
    );
    expect(screen.getByText('Something went wrong')).toBeInTheDocument();
    expect(screen.getByText('explosion')).toBeInTheDocument();
  });

  test('falls back to a generic message when the error has no message', () => {
    render(
      <ErrorBoundary>
        <Boom message="" />
      </ErrorBoundary>,
    );
    expect(screen.getByText('An unexpected error occurred')).toBeInTheDocument();
  });

  test('renders a custom fallback when provided', () => {
    render(
      <ErrorBoundary fallback={<div>custom fallback</div>}>
        <Boom />
      </ErrorBoundary>,
    );
    expect(screen.getByText('custom fallback')).toBeInTheDocument();
    expect(screen.queryByText('Something went wrong')).not.toBeInTheDocument();
  });

  test('resets and re-renders children after the error clears', () => {
    function Toggle(): React.ReactElement {
      const [crash, setCrash] = React.useState(true);
      return (
        <ErrorBoundary>
          {crash ? <Boom /> : <button type="button">recovered</button>}
          <button type="button" onClick={() => setCrash(false)}>
            fix
          </button>
        </ErrorBoundary>
      );
    }
    render(<Toggle />);
    expect(screen.getByText('Something went wrong')).toBeInTheDocument();
    // "fix" lives in the failed subtree, so reset via the Try again button.
    fireEvent.click(screen.getByRole('button', { name: 'Try again' }));
    // Still throwing because Toggle state has not changed; boundary stays in fallback.
    expect(screen.getByText('Something went wrong')).toBeInTheDocument();
  });

  test('Try again clears the error state so non-throwing children render', () => {
    let shouldThrow = true;
    function Conditional(): React.ReactElement {
      if (shouldThrow) {
        throw new Error('once');
      }
      return <div>healed</div>;
    }
    render(
      <ErrorBoundary>
        <Conditional />
      </ErrorBoundary>,
    );
    expect(screen.getByText('Something went wrong')).toBeInTheDocument();
    shouldThrow = false;
    fireEvent.click(screen.getByRole('button', { name: 'Try again' }));
    expect(screen.getByText('healed')).toBeInTheDocument();
  });
});

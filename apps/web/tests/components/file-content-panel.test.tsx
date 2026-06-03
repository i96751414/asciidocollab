import React from 'react';
import { render, screen } from '@testing-library/react';
import { FileContentPanel } from '@/components/file-content-panel';

const selectedFile = {
  nodeId: 'n1',
  nodeName: 'doc.adoc',
  nodeType: 'file' as const,
  path: '/doc.adoc',
};

const initialContentState = {
  content: null,
  isLoading: false,
  error: null,
  isBinary: false,
};

describe('FileContentPanel', () => {
  // T015 (a): no file selected → placeholder text
  it('shows placeholder when selectedFile is null', () => {
    render(<FileContentPanel selectedFile={null} contentState={initialContentState} />);
    expect(screen.getByText(/Select a file from the tree to view its content/i)).toBeInTheDocument();
  });

  // T015 (b): isLoading=true → loading skeleton
  it('shows loading state when isLoading=true', () => {
    render(
      <FileContentPanel
        selectedFile={selectedFile}
        contentState={{ ...initialContentState, isLoading: true }}
      />,
    );
    expect(screen.getByTestId('content-loading')).toBeInTheDocument();
  });

  // T015 (c): content present → rendered in <pre>
  it('renders file content inside a <pre> element', () => {
    render(
      <FileContentPanel
        selectedFile={selectedFile}
        contentState={{ ...initialContentState, content: 'Hello World', isLoading: false }}
      />,
    );
    const pre = screen.getByRole('code');
    expect(pre).toBeInTheDocument();
    expect(pre).toHaveTextContent('Hello World');
  });

  // T015 (d): isBinary=true → "Preview not available for binary files"
  it('shows binary placeholder when isBinary=true', () => {
    render(
      <FileContentPanel
        selectedFile={selectedFile}
        contentState={{ ...initialContentState, isBinary: true }}
      />,
    );
    expect(screen.getByText(/Preview not available for binary files/i)).toBeInTheDocument();
  });

  // T015 (e): error set → renders error message
  it('renders error message when error is set', () => {
    render(
      <FileContentPanel
        selectedFile={selectedFile}
        contentState={{ ...initialContentState, error: 'Network error' }}
      />,
    );
    expect(screen.getByText('Network error')).toBeInTheDocument();
  });
});

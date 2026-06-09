import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import { ImagePreview } from '@/components/image-preview';

// next/image needs a real layout/loader pipeline that jsdom lacks; render a
// plain <img> that forwards the onLoad/onError handlers the component relies on.
jest.mock('next/image', () => ({
  __esModule: true,
  default: ({
    alt,
    src,
    onLoad,
    onError,
  }: {
    alt: string;
    src: string;
    onLoad?: () => void;
    onError?: () => void;
  }) =>
    React.createElement('img', { alt, src, onLoad, onError }),
}));

jest.mock('@/lib/api/file-content', () => ({
  fileContentUrl: (projectId: string, fileNodeId: string) => `/files/${projectId}/${fileNodeId}`,
}));

describe('ImagePreview', () => {
  const properties = { projectId: 'p1', fileNodeId: 'f1', fileName: 'logo.png' };

  test('renders the image with the file-content URL and a loading skeleton', () => {
    render(<ImagePreview {...properties} />);
    const image = screen.getByAltText('logo.png');
    expect(image).toHaveAttribute('src', '/files/p1/f1');
  });

  test('hides the skeleton once the image reports it has loaded', () => {
    render(<ImagePreview {...properties} />);
    // onLoad handler flips the loaded state — no throw means the callback ran.
    fireEvent.load(screen.getByAltText('logo.png'));
    expect(screen.getByAltText('logo.png')).toBeInTheDocument();
  });

  test('shows an error message when the image fails to load', () => {
    render(<ImagePreview {...properties} />);
    fireEvent.error(screen.getByAltText('logo.png'));
    expect(screen.getByText('Failed to load image.')).toBeInTheDocument();
  });
});

import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { EditorMainFilePicker } from '@/components/editor/editor-main-file-picker';
import { setProjectMainFile } from '@/lib/api/projects';

jest.mock('@/lib/api/projects', () => ({ setProjectMainFile: jest.fn() }));

const mockSetMainFile = setProjectMainFile as jest.MockedFunction<typeof setProjectMainFile>;
const mockFetch = jest.fn();
globalThis.fetch = mockFetch;

// A project file tree: root → docs/ (guide.adoc, image.png) + readme.adoc.
const TREE = {
  id: 'root',
  name: '',
  type: 'folder',
  path: '',
  parentId: null,
  children: [
    {
      id: 'docs',
      name: 'docs',
      type: 'folder',
      path: 'docs',
      parentId: 'root',
      children: [
        { id: 'guide', name: 'guide.adoc', type: 'file', path: 'docs/guide.adoc', parentId: 'docs', children: [] },
        { id: 'img', name: 'image.png', type: 'file', path: 'docs/image.png', parentId: 'docs', children: [] },
      ],
    },
    { id: 'readme', name: 'readme.adoc', type: 'file', path: 'readme.adoc', parentId: 'root', children: [] },
  ],
};

beforeEach(() => {
  mockSetMainFile.mockReset();
  mockFetch.mockReset();
  mockFetch.mockResolvedValue({ ok: true, json: () => Promise.resolve(TREE) });
});

describe('EditorMainFilePicker', () => {
  test('renders nothing for a viewer (canEdit=false)', () => {
    const { container } = render(
      <EditorMainFilePicker projectId="p1" canEdit={false} currentMainFileNodeId={null} />,
    );
    expect(container).toBeEmptyDOMElement();
    expect(mockFetch).not.toHaveBeenCalled();
  });

  test('lists only .adoc files (no folders / non-adoc), with a clear option', async () => {
    render(<EditorMainFilePicker projectId="p1" canEdit currentMainFileNodeId={null} />);
    await screen.findByRole('option', { name: 'docs/guide.adoc' }); // wait for the async tree fetch
    const select = screen.getByLabelText(/main file/i);
    const options = [...select.querySelectorAll('option')].map((o) => (o as HTMLOptionElement).value);
    expect(options).toContain('guide');
    expect(options).toContain('readme');
    expect(options).not.toContain('img'); // image.png excluded
    expect(options).not.toContain('docs'); // folder excluded
    expect(options).toContain(''); // the "(none)" clear option
  });

  test('pre-selects the currently configured main file', async () => {
    render(<EditorMainFilePicker projectId="p1" canEdit currentMainFileNodeId="readme" />);
    await screen.findByRole('option', { name: 'readme.adoc' }); // wait for the async tree fetch
    const select = screen.getByLabelText(/main file/i) as HTMLSelectElement;
    expect(select.value).toBe('readme');
  });

  test('persists a selection via setProjectMainFile and reports success + onChange', async () => {
    mockSetMainFile.mockResolvedValueOnce({ id: 'p1', mainFileNodeId: 'guide' } as never);
    const onChange = jest.fn();
    render(<EditorMainFilePicker projectId="p1" canEdit currentMainFileNodeId={null} onChange={onChange} />);
    await screen.findByRole('option', { name: 'docs/guide.adoc' });
    const select = screen.getByLabelText(/main file/i) as HTMLSelectElement;
    fireEvent.change(select, { target: { value: 'guide' } });
    await waitFor(() => expect(mockSetMainFile).toHaveBeenCalledWith('p1', 'guide'));
    expect(onChange).toHaveBeenCalledWith('guide');
    expect(await screen.findByText(/saved/i)).toBeInTheDocument();
  });

  test('clearing the main file sends null', async () => {
    mockSetMainFile.mockResolvedValueOnce({ id: 'p1', mainFileNodeId: null } as never);
    render(<EditorMainFilePicker projectId="p1" canEdit currentMainFileNodeId="guide" />);
    await screen.findByRole('option', { name: 'docs/guide.adoc' });
    const select = screen.getByLabelText(/main file/i) as HTMLSelectElement;
    fireEvent.change(select, { target: { value: '' } });
    await waitFor(() => expect(mockSetMainFile).toHaveBeenCalledWith('p1', null));
  });

  test('surfaces an API error and restores the previous selection', async () => {
    const error: Error & { code?: string } = new Error('Permission denied');
    error.code = 'FORBIDDEN';
    mockSetMainFile.mockRejectedValueOnce(error);
    render(<EditorMainFilePicker projectId="p1" canEdit currentMainFileNodeId="readme" />);
    await screen.findByRole('option', { name: 'docs/guide.adoc' });
    const select = screen.getByLabelText(/main file/i) as HTMLSelectElement;
    fireEvent.change(select, { target: { value: 'guide' } });
    expect(await screen.findByText(/permission denied/i)).toBeInTheDocument();
    await waitFor(() => expect(select.value).toBe('readme')); // reverted on failure
  });
});

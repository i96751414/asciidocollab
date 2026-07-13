import React from 'react';
import { render, screen, fireEvent, waitFor, within } from '@testing-library/react';
import { RenderConfigSettings } from '@/components/render-config-settings';
import { useProjectRenderConfig } from '@/hooks/use-project-render-config';
import { useProjectFolders, type FolderNode } from '@/hooks/use-project-folders';

jest.mock('@/hooks/use-project-render-config', () => ({ useProjectRenderConfig: jest.fn() }));
jest.mock('@/hooks/use-project-folders', () => ({ useProjectFolders: jest.fn() }));

const mockHook = useProjectRenderConfig as jest.MockedFunction<typeof useProjectRenderConfig>;
const mockFolders = useProjectFolders as jest.MockedFunction<typeof useProjectFolders>;

const TREE: FolderNode[] = [
  { path: 'assets', name: 'assets', children: [{ path: 'assets/fonts', name: 'fonts', children: [] }] },
  { path: 'branding', name: 'branding', children: [] },
  { path: 'images', name: 'images', children: [] },
  { path: 'img', name: 'img', children: [] },
];
const FLAT_FOLDERS = ['assets', 'assets/fonts', 'branding', 'images', 'img'];

function stub(overrides: Partial<ReturnType<typeof useProjectRenderConfig>> = {}) {
  const save = overrides.save ?? jest.fn(async () => true);
  mockHook.mockReturnValue({
    config: overrides.config ?? {},
    loading: overrides.loading ?? false,
    saving: overrides.saving ?? false,
    error: overrides.error ?? null,
    save,
  });
  return save;
}

function imagesTree(): HTMLElement {
  // Single-select tree renders as a radiogroup (multi-select as a plain group).
  return screen.getByRole('radiogroup', { name: 'Images directory' });
}
function fontTree(): HTMLElement {
  return screen.getByRole('group', { name: 'Custom font directories' });
}

describe('RenderConfigSettings', () => {
  beforeEach(() => {
    mockHook.mockReset();
    mockFolders.mockReset();
    mockFolders.mockReturnValue({ tree: TREE, folders: FLAT_FOLDERS, loading: false, error: null });
  });

  it('shows a loading state', () => {
    stub({ loading: true });
    render(<RenderConfigSettings projectId="p1" canEdit />);
    expect(screen.getByText('Loading render options…')).toBeInTheDocument();
  });

  it('seeds the controls from the stored config', () => {
    stub({ config: { doctype: 'book', toc: true, imagesdir: 'images', extraFontDirs: ['assets/fonts'] } });
    render(<RenderConfigSettings projectId="p1" canEdit />);
    expect(screen.getByLabelText('Document type')).toHaveValue('book');
    expect(screen.getByLabelText('Table of contents')).toBeChecked();
    // Selected image dir reflected in its tree (top-level folder).
    expect(within(imagesTree()).getByLabelText('images')).toBeChecked();
    // Selected font dir auto-reveals its ancestor and is checked.
    expect(within(fontTree()).getByLabelText('assets/fonts')).toBeChecked();
  });

  it('saves a payload assembled from every edited control', async () => {
    const save = stub({ config: {} });
    render(<RenderConfigSettings projectId="p1" canEdit />);

    fireEvent.change(screen.getByLabelText('Document type'), { target: { value: 'book' } });
    fireEvent.change(screen.getByLabelText('Admonition icons'), { target: { value: 'font' } });
    // Images directory — pick an existing folder in its tree.
    fireEvent.click(within(imagesTree()).getByLabelText('img'));
    fireEvent.click(screen.getByLabelText('Table of contents'));
    fireEvent.click(screen.getByLabelText('Number sections'));
    fireEvent.click(screen.getByLabelText('Experimental macros'));
    fireEvent.click(screen.getByLabelText('Hard line breaks'));
    fireEvent.change(screen.getByLabelText('PDF theme name'), { target: { value: 'acme' } });
    fireEvent.change(screen.getByLabelText('Output target'), { target: { value: 'print' } });
    fireEvent.change(screen.getByLabelText('Page size'), { target: { value: 'A4' } });
    fireEvent.change(screen.getByLabelText('Orientation'), { target: { value: 'landscape' } });
    fireEvent.click(screen.getByLabelText('Hyphenation'));
    fireEvent.click(screen.getByLabelText('Auto-fit wide blocks'));
    // Font directories — expand a folder, then check a nested one and a top-level one.
    fireEvent.click(within(fontTree()).getByRole('button', { name: 'Expand assets' }));
    fireEvent.click(within(fontTree()).getByLabelText('assets/fonts'));
    fireEvent.click(within(fontTree()).getByLabelText('branding'));
    fireEvent.change(screen.getByLabelText('Attribute name 1'), { target: { value: 'company' } });
    fireEvent.change(screen.getByLabelText('Attribute value 1'), { target: { value: 'Acme' } });
    fireEvent.click(screen.getByRole('button', { name: 'Add attribute' }));
    fireEvent.change(screen.getByLabelText('Attribute value 2'), { target: { value: 'orphan' } });

    fireEvent.click(screen.getByRole('button', { name: 'Save render options' }));

    await waitFor(() => expect(save).toHaveBeenCalledTimes(1));
    expect(save).toHaveBeenCalledWith({
      doctype: 'book',
      icons: 'font',
      imagesdir: 'img',
      toc: true,
      sectnums: true,
      experimental: true,
      hardbreaks: true,
      pdfTheme: 'acme',
      media: 'print',
      pdfPageSize: 'A4',
      pdfPageLayout: 'landscape',
      hyphens: true,
      autofit: true,
      extraFontDirs: ['assets/fonts', 'branding'],
      customAttributes: { company: 'Acme' },
    });
    await screen.findByText('Render options saved.');
  });

  it('resets the images directory to the project root', async () => {
    const save = stub({ config: { imagesdir: 'images' } });
    render(<RenderConfigSettings projectId="p1" canEdit />);
    fireEvent.click(screen.getByLabelText('Project root (no images directory)'));
    fireEvent.click(screen.getByRole('button', { name: 'Save render options' }));
    await waitFor(() => expect(save).toHaveBeenCalledWith({}));
  });

  it('unchecking a font directory in the tree drops it from the payload', async () => {
    const save = stub({ config: { extraFontDirs: ['branding', 'images'] } });
    render(<RenderConfigSettings projectId="p1" canEdit />);
    fireEvent.click(within(fontTree()).getByLabelText('branding'));
    fireEvent.click(screen.getByRole('button', { name: 'Save render options' }));
    await waitFor(() => expect(save).toHaveBeenCalledWith({ extraFontDirs: ['images'] }));
  });

  it('preserves and can remove a stored font directory whose folder no longer exists', async () => {
    const save = stub({ config: { extraFontDirs: ['legacy/fonts'] } });
    render(<RenderConfigSettings projectId="p1" canEdit />);
    expect(screen.getByText('legacy/fonts')).toBeInTheDocument();
    // Without touching it, it is preserved on save.
    fireEvent.click(screen.getByRole('button', { name: 'Save render options' }));
    await waitFor(() => expect(save).toHaveBeenCalledWith({ extraFontDirs: ['legacy/fonts'] }));
    // Removing it drops it.
    fireEvent.click(screen.getByRole('button', { name: 'Remove font directory legacy/fonts' }));
    fireEvent.click(screen.getByRole('button', { name: 'Save render options' }));
    await waitFor(() => expect(save).toHaveBeenLastCalledWith({}));
  });

  it('deletes a custom attribute row so it is dropped from the payload', async () => {
    const save = stub({ config: { customAttributes: { company: 'Acme', region: 'EU' } } });
    render(<RenderConfigSettings projectId="p1" canEdit />);
    fireEvent.click(screen.getByRole('button', { name: 'Remove attribute 1' }));
    fireEvent.click(screen.getByRole('button', { name: 'Save render options' }));
    await waitFor(() => expect(save).toHaveBeenCalledWith({ customAttributes: { region: 'EU' } }));
  });

  it('does not render its own language control (the project Language setting drives render lang)', () => {
    stub({ config: {} });
    render(<RenderConfigSettings projectId="p1" canEdit />);
    expect(screen.queryByLabelText('Language')).not.toBeInTheDocument();
  });

  it('unchecking a box removes the flag from the draft', async () => {
    const save = stub({ config: { toc: true } });
    render(<RenderConfigSettings projectId="p1" canEdit />);
    fireEvent.click(screen.getByLabelText('Table of contents'));
    fireEvent.click(screen.getByRole('button', { name: 'Save render options' }));
    await waitFor(() => expect(save).toHaveBeenCalledWith({}));
  });

  it('omits empty font dirs and custom attributes from the payload', async () => {
    const save = stub({ config: { doctype: 'article' } });
    render(<RenderConfigSettings projectId="p1" canEdit />);
    fireEvent.click(screen.getByRole('button', { name: 'Save render options' }));
    await waitFor(() => expect(save).toHaveBeenCalledWith({ doctype: 'article' }));
  });

  it('clearing a select removes the option from the draft', async () => {
    const save = stub({ config: { doctype: 'book' } });
    render(<RenderConfigSettings projectId="p1" canEdit />);
    fireEvent.change(screen.getByLabelText('Document type'), { target: { value: '' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save render options' }));
    await waitFor(() => expect(save).toHaveBeenCalledWith({}));
  });

  it('hides the save button and disables inputs when canEdit is false', () => {
    stub({ config: {} });
    render(<RenderConfigSettings projectId="p1" canEdit={false} />);
    expect(screen.queryByRole('button', { name: 'Save render options' })).not.toBeInTheDocument();
    expect(screen.getByLabelText('Document type')).toBeDisabled();
  });

  it('shows a loading state for the folder pickers while folders load', () => {
    stub({ config: {} });
    mockFolders.mockReturnValue({ tree: [], folders: [], loading: true, error: null });
    render(<RenderConfigSettings projectId="p1" canEdit />);
    expect(screen.getAllByText('Loading folders…').length).toBeGreaterThanOrEqual(1);
  });

  it('notes a stored images directory whose folder no longer exists', () => {
    stub({ config: { imagesdir: 'gone' } });
    render(<RenderConfigSettings projectId="p1" canEdit />);
    expect(screen.getByText(/folder not found/i)).toBeInTheDocument();
  });

  it('surfaces a hook error', () => {
    stub({ config: {}, error: 'boom' });
    render(<RenderConfigSettings projectId="p1" canEdit />);
    expect(screen.getByText('boom')).toBeInTheDocument();
  });
});

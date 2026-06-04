import React, { useRef } from 'react';
import { render, fireEvent } from '@testing-library/react';
import { useFileTreeKeyHandler, type FileTreeKeyCallbacks } from '@/hooks/use-file-tree-key-handler';

function TestComponent({ bindings, callbacks }: {
  bindings: Map<string, string>;
  callbacks: FileTreeKeyCallbacks;
}) {
  const ref = useRef<HTMLDivElement>(null);
  useFileTreeKeyHandler(ref, bindings, callbacks);
  return <div ref={ref} tabIndex={0} data-testid="container" />;
}

const defaultBindings = new Map([
  ['file-tree:rename', 'F2'],
  ['file-tree:delete', 'Delete'],
  ['file-tree:new-file', 'Ctrl+N'],
  ['file-tree:new-folder', 'Ctrl+Shift+N'],
]);

describe('useFileTreeKeyHandler', () => {
  it('F2 fires the rename callback', () => {
    const onRename = jest.fn();
    const { getByTestId } = render(
      <TestComponent bindings={defaultBindings} callbacks={{ 'file-tree:rename': onRename, 'file-tree:delete': jest.fn(), 'file-tree:new-file': jest.fn(), 'file-tree:new-folder': jest.fn() }} />,
    );
    fireEvent.keyDown(getByTestId('container'), { key: 'F2' });
    expect(onRename).toHaveBeenCalledTimes(1);
  });

  it('Delete fires the delete callback', () => {
    const onDelete = jest.fn();
    const { getByTestId } = render(
      <TestComponent bindings={defaultBindings} callbacks={{ 'file-tree:rename': jest.fn(), 'file-tree:delete': onDelete, 'file-tree:new-file': jest.fn(), 'file-tree:new-folder': jest.fn() }} />,
    );
    fireEvent.keyDown(getByTestId('container'), { key: 'Delete' });
    expect(onDelete).toHaveBeenCalledTimes(1);
  });

  it('Ctrl+N fires the new-file callback', () => {
    const onNewFile = jest.fn();
    const { getByTestId } = render(
      <TestComponent bindings={defaultBindings} callbacks={{ 'file-tree:rename': jest.fn(), 'file-tree:delete': jest.fn(), 'file-tree:new-file': onNewFile, 'file-tree:new-folder': jest.fn() }} />,
    );
    fireEvent.keyDown(getByTestId('container'), { key: 'n', ctrlKey: true });
    expect(onNewFile).toHaveBeenCalledTimes(1);
  });

  it('Ctrl+Shift+N fires the new-folder callback', () => {
    const onNewFolder = jest.fn();
    const { getByTestId } = render(
      <TestComponent bindings={defaultBindings} callbacks={{ 'file-tree:rename': jest.fn(), 'file-tree:delete': jest.fn(), 'file-tree:new-file': jest.fn(), 'file-tree:new-folder': onNewFolder }} />,
    );
    fireEvent.keyDown(getByTestId('container'), { key: 'N', ctrlKey: true, shiftKey: true });
    expect(onNewFolder).toHaveBeenCalledTimes(1);
  });

  it('bound key does not fire when its callback is undefined', () => {
    const onDelete = jest.fn();
    const { getByTestId } = render(
      <TestComponent bindings={defaultBindings} callbacks={{ 'file-tree:rename': undefined, 'file-tree:delete': onDelete, 'file-tree:new-file': jest.fn(), 'file-tree:new-folder': jest.fn() }} />,
    );
    // F2 (rename) has no callback — must not crash or fire anything
    fireEvent.keyDown(getByTestId('container'), { key: 'F2' });
    expect(onDelete).not.toHaveBeenCalled();
  });

  it('Ctrl+F fires the find callback', () => {
    const onFind = jest.fn();
    const findBindings = new Map([...defaultBindings, ['file-tree:find', 'Ctrl+F']]);
    const { getByTestId } = render(
      <TestComponent bindings={findBindings} callbacks={{ 'file-tree:rename': jest.fn(), 'file-tree:delete': jest.fn(), 'file-tree:new-file': jest.fn(), 'file-tree:new-folder': jest.fn(), 'file-tree:find': onFind }} />,
    );
    fireEvent.keyDown(getByTestId('container'), { key: 'f', ctrlKey: true });
    expect(onFind).toHaveBeenCalledTimes(1);
  });

  it('remapped binding fires correct callback after bindings prop changes', () => {
    const onRename = jest.fn();
    const newBindings = new Map([...defaultBindings, ['file-tree:rename', 'F3']]);

    const { getByTestId, rerender } = render(
      <TestComponent bindings={defaultBindings} callbacks={{ 'file-tree:rename': onRename, 'file-tree:delete': jest.fn(), 'file-tree:new-file': jest.fn(), 'file-tree:new-folder': jest.fn() }} />,
    );

    // F2 should fire rename with default bindings
    fireEvent.keyDown(getByTestId('container'), { key: 'F2' });
    expect(onRename).toHaveBeenCalledTimes(1);

    rerender(<TestComponent bindings={newBindings} callbacks={{ 'file-tree:rename': onRename, 'file-tree:delete': jest.fn(), 'file-tree:new-file': jest.fn(), 'file-tree:new-folder': jest.fn() }} />);

    // After remap, F3 fires rename
    fireEvent.keyDown(getByTestId('container'), { key: 'F3' });
    expect(onRename).toHaveBeenCalledTimes(2);

    // Old binding no longer fires
    const beforeCount = onRename.mock.calls.length;
    fireEvent.keyDown(getByTestId('container'), { key: 'F2' });
    expect(onRename.mock.calls.length).toBe(beforeCount);
  });

  it('pressing a lone modifier key does not fire any callback', () => {
    const onRename = jest.fn();
    const { getByTestId } = render(
      <TestComponent bindings={defaultBindings} callbacks={{ 'file-tree:rename': onRename, 'file-tree:delete': jest.fn(), 'file-tree:new-file': jest.fn(), 'file-tree:new-folder': jest.fn() }} />,
    );
    fireEvent.keyDown(getByTestId('container'), { key: 'Shift' });
    fireEvent.keyDown(getByTestId('container'), { key: 'Control' });
    fireEvent.keyDown(getByTestId('container'), { key: 'Alt' });
    fireEvent.keyDown(getByTestId('container'), { key: 'Meta' });
    expect(onRename).not.toHaveBeenCalled();
  });
});

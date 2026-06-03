import React, { useRef } from 'react';
import { render, fireEvent } from '@testing-library/react';
import { useFileTreeKeyHandler } from '@/hooks/use-file-tree-key-handler';

function TestComponent({ bindings, callbacks, selectedNodeId }: {
  bindings: Map<string, string>;
  callbacks: Parameters<typeof useFileTreeKeyHandler>[3];
  selectedNodeId: string | null;
}) {
  const ref = useRef<HTMLDivElement>(null);
  useFileTreeKeyHandler(ref, selectedNodeId, bindings, callbacks);
  return <div ref={ref} tabIndex={0} data-testid="container" />;
}

const defaultBindings = new Map([
  ['file-tree:rename', 'F2'],
  ['file-tree:delete', 'Delete'],
  ['file-tree:new-file', 'Ctrl+N'],
  ['file-tree:new-folder', 'Ctrl+Shift+N'],
]);

describe('useFileTreeKeyHandler', () => {
  it('F2 fires onRename when selectedNodeId non-null', () => {
    const onRename = jest.fn();
    const { getByTestId } = render(
      <TestComponent bindings={defaultBindings} selectedNodeId="node-1" callbacks={{ onRename, onDelete: jest.fn(), onNewFile: jest.fn(), onNewFolder: jest.fn() }} />,
    );
    fireEvent.keyDown(getByTestId('container'), { key: 'F2' });
    expect(onRename).toHaveBeenCalledTimes(1);
  });

  it('Delete fires onDelete', () => {
    const onDelete = jest.fn();
    const { getByTestId } = render(
      <TestComponent bindings={defaultBindings} selectedNodeId="node-1" callbacks={{ onRename: jest.fn(), onDelete, onNewFile: jest.fn(), onNewFolder: jest.fn() }} />,
    );
    fireEvent.keyDown(getByTestId('container'), { key: 'Delete' });
    expect(onDelete).toHaveBeenCalledTimes(1);
  });

  it('Ctrl+N fires onNewFile', () => {
    const onNewFile = jest.fn();
    const { getByTestId } = render(
      <TestComponent bindings={defaultBindings} selectedNodeId="node-1" callbacks={{ onRename: jest.fn(), onDelete: jest.fn(), onNewFile, onNewFolder: jest.fn() }} />,
    );
    fireEvent.keyDown(getByTestId('container'), { key: 'n', ctrlKey: true });
    expect(onNewFile).toHaveBeenCalledTimes(1);
  });

  it('Ctrl+Shift+N fires onNewFolder', () => {
    const onNewFolder = jest.fn();
    const { getByTestId } = render(
      <TestComponent bindings={defaultBindings} selectedNodeId="node-1" callbacks={{ onRename: jest.fn(), onDelete: jest.fn(), onNewFile: jest.fn(), onNewFolder }} />,
    );
    fireEvent.keyDown(getByTestId('container'), { key: 'N', ctrlKey: true, shiftKey: true });
    expect(onNewFolder).toHaveBeenCalledTimes(1);
  });

  it('no callback fires when selectedNodeId is null', () => {
    const onRename = jest.fn();
    const { getByTestId } = render(
      <TestComponent bindings={defaultBindings} selectedNodeId={null} callbacks={{ onRename, onDelete: jest.fn(), onNewFile: jest.fn(), onNewFolder: jest.fn() }} />,
    );
    fireEvent.keyDown(getByTestId('container'), { key: 'F2' });
    expect(onRename).not.toHaveBeenCalled();
  });

  it('remapped binding fires correct callback after bindings prop changes', () => {
    const onRename = jest.fn();
    const newBindings = new Map([...defaultBindings, ['file-tree:rename', 'F3']]);

    const { getByTestId, rerender } = render(
      <TestComponent bindings={defaultBindings} selectedNodeId="node-1" callbacks={{ onRename, onDelete: jest.fn(), onNewFile: jest.fn(), onNewFolder: jest.fn() }} />,
    );

    // F2 should fire rename with default bindings
    fireEvent.keyDown(getByTestId('container'), { key: 'F2' });
    expect(onRename).toHaveBeenCalledTimes(1);

    rerender(<TestComponent bindings={newBindings} selectedNodeId="node-1" callbacks={{ onRename, onDelete: jest.fn(), onNewFile: jest.fn(), onNewFolder: jest.fn() }} />);

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
      <TestComponent bindings={defaultBindings} selectedNodeId="node-1" callbacks={{ onRename, onDelete: jest.fn(), onNewFile: jest.fn(), onNewFolder: jest.fn() }} />,
    );
    fireEvent.keyDown(getByTestId('container'), { key: 'Shift' });
    fireEvent.keyDown(getByTestId('container'), { key: 'Control' });
    fireEvent.keyDown(getByTestId('container'), { key: 'Alt' });
    fireEvent.keyDown(getByTestId('container'), { key: 'Meta' });
    expect(onRename).not.toHaveBeenCalled();
  });
});

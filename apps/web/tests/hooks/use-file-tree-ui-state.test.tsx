import React from 'react';
import { renderHook, act } from '@testing-library/react';
import { useFileTreeUIState } from '@/hooks/use-file-tree-ui-state';

function makeKeyEvent(key: string, mods: Partial<Record<'ctrlKey' | 'metaKey' | 'shiftKey' | 'altKey', boolean>> = {}): React.KeyboardEvent {
  return {
    key, ctrlKey: false, metaKey: false, shiftKey: false, altKey: false, preventDefault: jest.fn(), ...mods,
  } as unknown as React.KeyboardEvent;
}
import type { FileTreeNode } from '@/components/file-tree/types';

jest.mock('@/hooks/use-file-tree-events', () => ({ useFileTreeEvents: jest.fn() }));

const file = (id: string, name: string, parentId = 'root'): FileTreeNode => ({
  id, name, type: 'file', path: `/${name}`, parentId, children: [],
});

const tree: FileTreeNode = {
  id: 'root', name: 'root', type: 'folder', path: '/', parentId: null,
  children: [
    file('f1', 'alpha.adoc'),
    file('f2', 'beta.adoc'),
    file('f3', 'gamma.adoc'),
  ],
};

describe('useFileTreeUIState', () => {
  it('toggleExpand flips a node expand state', () => {
    const onSelectFile = jest.fn();
    const { result } = renderHook(() => useFileTreeUIState(tree, onSelectFile));

    expect(result.current.expandedState.get('f1')).toBeUndefined();
    act(() => { result.current.toggleExpand('f1'); });
    expect(result.current.expandedState.get('f1')).toBe(true);
    act(() => { result.current.toggleExpand('f1'); });
    expect(result.current.expandedState.get('f1')).toBe(false);
  });

  it('handleKeyDown Ctrl+F sets findOpen=true', () => {
    const onSelectFile = jest.fn();
    const { result } = renderHook(() => useFileTreeUIState(tree, onSelectFile));

    expect(result.current.findOpen).toBe(false);
    act(() => {
      result.current.handleKeyDown({
        ctrlKey: true, metaKey: false, key: 'f', preventDefault: jest.fn(),
      } as unknown as React.KeyboardEvent);
    });
    expect(result.current.findOpen).toBe(true);
  });

  it('openFind sets findOpen=true', () => {
    const { result } = renderHook(() => useFileTreeUIState(tree, jest.fn()));

    expect(result.current.findOpen).toBe(false);
    act(() => { result.current.openFind(); });
    expect(result.current.findOpen).toBe(true);
  });

  it('handleKeyDown uses configured binding for file-tree:find when provided', () => {
    const bindings = new Map([['file-tree:find', 'Ctrl+G']]);
    const { result } = renderHook(() => useFileTreeUIState(tree, jest.fn(), bindings));

    // Ctrl+F should NOT open find when binding is remapped to Ctrl+G
    act(() => { result.current.handleKeyDown(makeKeyEvent('f', { ctrlKey: true })); });
    expect(result.current.findOpen).toBe(false);

    // Ctrl+G should open find
    act(() => { result.current.handleKeyDown(makeKeyEvent('g', { ctrlKey: true })); });
    expect(result.current.findOpen).toBe(true);
  });

  it('handleDismissFind closes find panel', () => {
    const onSelectFile = jest.fn();
    const { result } = renderHook(() => useFileTreeUIState(tree, onSelectFile));

    act(() => {
      result.current.handleKeyDown({
        ctrlKey: true, metaKey: false, key: 'f', preventDefault: jest.fn(),
      } as unknown as React.KeyboardEvent);
    });
    expect(result.current.findOpen).toBe(true);

    act(() => { result.current.handleDismissFind(); });
    expect(result.current.findOpen).toBe(false);
  });

  it('handleNext calls onSelectFile with the node AFTER navigation (not the pre-call node)', () => {
    const onSelectFile = jest.fn();
    const { result } = renderHook(() => useFileTreeUIState(tree, onSelectFile));

    act(() => { result.current.find.setQuery('a'); }); // matches alpha + beta + gamma
    const firstMatchId = result.current.find.currentMatch?.id;

    act(() => { result.current.handleNext(); });

    // onSelectFile should be called with the NEW match (index 1), not the old one (index 0)
    expect(onSelectFile).toHaveBeenCalledTimes(1);
    const calledId = onSelectFile.mock.calls[0][0];
    expect(calledId).not.toBe(firstMatchId);
    expect(calledId).toBe(result.current.find.currentMatch?.id);
  });

  it('handlePrevious calls onSelectFile with the node AFTER navigation', () => {
    const onSelectFile = jest.fn();
    const { result } = renderHook(() => useFileTreeUIState(tree, onSelectFile));

    act(() => { result.current.find.setQuery('a'); });
    act(() => { result.current.handleNext(); }); // advance to index 1
    const indexOneId = result.current.find.currentMatch?.id;
    onSelectFile.mockClear();

    act(() => { result.current.handlePrevious(); });

    expect(onSelectFile).toHaveBeenCalledTimes(1);
    const calledId = onSelectFile.mock.calls[0][0];
    expect(calledId).not.toBe(indexOneId);
    expect(calledId).toBe(result.current.find.currentMatch?.id);
  });

  it('handleQueryChange updates query without calling onSelectFile', () => {
    const onSelectFile = jest.fn();
    const { result } = renderHook(() => useFileTreeUIState(tree, onSelectFile));

    act(() => { result.current.handleQueryChange('alpha'); });

    expect(result.current.find.query).toBe('alpha');
    expect(onSelectFile).not.toHaveBeenCalled();
  });

  it('collapseAll resets all expanded nodes', () => {
    const { result } = renderHook(() => useFileTreeUIState(tree, jest.fn()));

    act(() => { result.current.toggleExpand('f1'); });
    expect(result.current.expandedState.get('f1')).toBe(true);

    act(() => { result.current.collapseAll(); });
    expect(result.current.expandedState.size).toBe(0);
  });

  it('expandAll expands every folder in the tree', () => {
    const nestedTree: FileTreeNode = {
      id: 'root', name: 'root', type: 'folder', path: '/', parentId: null,
      children: [
        {
          id: 'dir1', name: 'src', type: 'folder', path: '/src', parentId: 'root',
          children: [
            { id: 'dir2', name: 'components', type: 'folder', path: '/src/components', parentId: 'dir1', children: [] },
          ],
        },
      ],
    };
    const { result } = renderHook(() => useFileTreeUIState(nestedTree, jest.fn()));

    act(() => { result.current.expandAll(); });
    expect(result.current.expandedState.get('dir1')).toBe(true);
    expect(result.current.expandedState.get('dir2')).toBe(true);
  });

  it('revealSelected expands all ancestor folders of the target file', () => {
    const nestedTree: FileTreeNode = {
      id: 'root', name: 'root', type: 'folder', path: '/', parentId: null,
      children: [
        {
          id: 'dir1', name: 'src', type: 'folder', path: '/src', parentId: 'root',
          children: [
            { id: 'file1', name: 'index.ts', type: 'file', path: '/src/index.ts', parentId: 'dir1', children: [] },
          ],
        },
      ],
    };
    const { result } = renderHook(() => useFileTreeUIState(nestedTree, jest.fn()));

    act(() => { result.current.revealSelected('file1'); });
    expect(result.current.expandedState.get('dir1')).toBe(true);
  });

  it('operationError state is managed correctly', () => {
    const { result } = renderHook(() => useFileTreeUIState(tree, jest.fn()));

    expect(result.current.operationError).toBeNull();
    act(() => { result.current.setOperationError('Something went wrong'); });
    expect(result.current.operationError).toBe('Something went wrong');
    act(() => { result.current.setOperationError(null); });
    expect(result.current.operationError).toBeNull();
  });
});

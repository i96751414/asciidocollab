import { renderHook, act } from '@testing-library/react';
import { useFileTreeEvents } from '@/hooks/use-file-tree-events';
import type { FileTreeEventDto } from '@asciidocollab/shared';

// Mock SharedWorker port using addEventListener/removeEventListener
let capturedMessageHandler: ((event: MessageEvent) => void) | null = null;

const mockPort = {
  postMessage: jest.fn(),
  start: jest.fn(),
  close: jest.fn(),
  addEventListener: jest.fn((type: string, handler: (event: MessageEvent) => void) => {
    if (type === 'message') capturedMessageHandler = handler;
  }),
  removeEventListener: jest.fn((type: string) => {
    if (type === 'message') capturedMessageHandler = null;
  }),
};

const mockWorker = { port: mockPort };

globalThis.SharedWorker = jest.fn().mockImplementation(() => mockWorker) as unknown as typeof SharedWorker;

const API_BASE = 'http://localhost:4000';

function triggerMessage(data: unknown) {
  capturedMessageHandler?.({ data } as MessageEvent);
}

describe('useFileTreeEvents', () => {
  const projectId = 'project-123';
  const onEvent = jest.fn();
  const onReconnect = jest.fn();

  beforeEach(() => {
    jest.clearAllMocks();
    capturedMessageHandler = null;
  });

  it('posts subscribe message on mount with correct projectId and apiBase', () => {
    renderHook(() => useFileTreeEvents(projectId, onEvent, onReconnect));
    expect(mockPort.postMessage).toHaveBeenCalledWith({
      type: 'subscribe',
      projectId,
      apiBase: API_BASE,
    });
  });

  it('calls onEvent callback when file-tree-change message received', () => {
    renderHook(() => useFileTreeEvents(projectId, onEvent, onReconnect));

    const event: FileTreeEventDto = {
      type: 'created',
      fileNodeId: 'node-1',
      nodeType: 'file',
      name: 'test.txt',
      path: '/test.txt',
      parentId: null,
    };

    act(() => triggerMessage({ type: 'file-tree-change', event }));
    expect(onEvent).toHaveBeenCalledWith(event);
  });

  it('calls onReconnect when reconnect message received', () => {
    renderHook(() => useFileTreeEvents(projectId, onEvent, onReconnect));
    act(() => triggerMessage({ type: 'reconnect' }));
    expect(onReconnect).toHaveBeenCalledTimes(1);
  });

  it('removes message listener on unmount', () => {
    const { unmount } = renderHook(() => useFileTreeEvents(projectId, onEvent, onReconnect));
    unmount();
    // After unmount, messages should not trigger callbacks
    act(() => triggerMessage({ type: 'reconnect' }));
    expect(onReconnect).not.toHaveBeenCalled();
  });
});

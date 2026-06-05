import { createLinkHandler } from '@/lib/codemirror/asciidoc-link-handler';
import type { EditorView } from '@codemirror/view';

type MockView = Pick<EditorView, 'state' | 'posAtCoords'>;

function createMockView(content: string, clickPosition: number): MockView {
  return {
    state: {
      doc: {
        toString: () => content,
        lineAt: (position: number) => {
          const lines = content.split('\n');
          let offset = 0;
          for (const line of lines) {
            if (offset + line.length >= position) {
              return { from: offset, to: offset + line.length, number: 1, text: line };
            }
            offset += line.length + 1;
          }
          return { from: 0, to: content.length, number: 1, text: content };
        },
      },
    } as EditorView['state'],
    posAtCoords: (_coords: { x: number; y: number }) => clickPosition,
  };
}

describe('createLinkHandler', () => {
  test('Ctrl+click on include:: path calls onNavigateToFile', () => {
    const onNavigateToFile = jest.fn();
    const handler = createLinkHandler({ onNavigateToFile });
    const content = 'include::chapters/intro.adoc[]\nSome text';

    handler.handleMousedown(
      { ctrlKey: true, clientX: 0, clientY: 0, preventDefault: jest.fn() } as unknown as MouseEvent,
      createMockView(content, 10),
    );

    expect(onNavigateToFile).toHaveBeenCalledWith('chapters/intro.adoc');
  });

  test('Ctrl+click on link: URL calls onOpenUrl', () => {
    const onOpenUrl = jest.fn();
    const handler = createLinkHandler({ onOpenUrl });
    const content = 'Visit link:https://example.com[text]';

    handler.handleMousedown(
      { ctrlKey: true, clientX: 0, clientY: 0, preventDefault: jest.fn() } as unknown as MouseEvent,
      createMockView(content, 10),
    );

    expect(onOpenUrl).toHaveBeenCalledWith('https://example.com');
  });

  test('Ctrl+click on bare URL calls onOpenUrl', () => {
    const onOpenUrl = jest.fn();
    const handler = createLinkHandler({ onOpenUrl });
    const content = 'Go to https://example.com for info';

    handler.handleMousedown(
      { ctrlKey: true, clientX: 0, clientY: 0, preventDefault: jest.fn() } as unknown as MouseEvent,
      createMockView(content, 15),
    );

    expect(onOpenUrl).toHaveBeenCalledWith('https://example.com');
  });

  test('Ctrl+click on include:: path with .. does not call either callback', () => {
    const onNavigateToFile = jest.fn();
    const onOpenUrl = jest.fn();
    const handler = createLinkHandler({ onNavigateToFile, onOpenUrl });
    const content = 'include::../secret.adoc[]\nSome text';

    handler.handleMousedown(
      { ctrlKey: true, clientX: 0, clientY: 0, preventDefault: jest.fn() } as unknown as MouseEvent,
      createMockView(content, 10),
    );

    expect(onNavigateToFile).not.toHaveBeenCalled();
    expect(onOpenUrl).not.toHaveBeenCalled();
  });

  test('Ctrl+click on absolute include path does not call either callback', () => {
    const onNavigateToFile = jest.fn();
    const onOpenUrl = jest.fn();
    const handler = createLinkHandler({ onNavigateToFile, onOpenUrl });
    const content = 'include::/etc/passwd[]\nSome text';

    handler.handleMousedown(
      { ctrlKey: true, clientX: 0, clientY: 0, preventDefault: jest.fn() } as unknown as MouseEvent,
      createMockView(content, 10),
    );

    expect(onNavigateToFile).not.toHaveBeenCalled();
  });

  test('plain click (no Ctrl) does not trigger navigation', () => {
    const onNavigateToFile = jest.fn();
    const handler = createLinkHandler({ onNavigateToFile });
    const content = 'include::chapters/intro.adoc[]';

    handler.handleMousedown(
      { ctrlKey: false, clientX: 0, clientY: 0, preventDefault: jest.fn() } as unknown as MouseEvent,
      createMockView(content, 10),
    );

    expect(onNavigateToFile).not.toHaveBeenCalled();
  });

  test('Ctrl+click on non-navigable content does not call either callback', () => {
    const onNavigateToFile = jest.fn();
    const onOpenUrl = jest.fn();
    const handler = createLinkHandler({ onNavigateToFile, onOpenUrl });
    const content = 'Hello world this is plain text';

    handler.handleMousedown(
      { ctrlKey: true, clientX: 0, clientY: 0, preventDefault: jest.fn() } as unknown as MouseEvent,
      createMockView(content, 5),
    );

    expect(onNavigateToFile).not.toHaveBeenCalled();
    expect(onOpenUrl).not.toHaveBeenCalled();
  });

  test('unresolvable include:: path calls onUnresolvedPath', () => {
    const onNavigateToFile = jest.fn();
    const onUnresolvedPath = jest.fn();
    const availablePaths = ['chapters/intro.adoc'];
    const handler = createLinkHandler({ onNavigateToFile, onUnresolvedPath }, availablePaths);
    const content = 'include::missing/file.adoc[]';

    handler.handleMousedown(
      { ctrlKey: true, clientX: 0, clientY: 0, preventDefault: jest.fn() } as unknown as MouseEvent,
      createMockView(content, 10),
    );

    expect(onNavigateToFile).not.toHaveBeenCalled();
    expect(onUnresolvedPath).toHaveBeenCalledWith('missing/file.adoc');
  });

  // Issue 8: the `extension()` factory was dead code — the editor wires the
  // handler via addEventListener; exposing extension() created a double-handler
  // risk. It must not appear on the returned object.
  test('createLinkHandler does not expose an extension() factory', () => {
    const handler = createLinkHandler({});
    expect('extension' in handler).toBe(false);
  });
});

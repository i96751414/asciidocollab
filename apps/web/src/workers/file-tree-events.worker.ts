/// <reference lib="webworker" />

// SharedWorker: holds one EventSource per project, fans out events to all connected tabs.

interface SubscribeMessage {
  type: 'subscribe';
  projectId: string;
  apiBase: string;
}

interface UnsubscribeMessage {
  type: 'unsubscribe';
  projectId: string;
}

type WorkerMessage = SubscribeMessage | UnsubscribeMessage;

interface WorkerMessageEvent {
  data: WorkerMessage;
}

const sources = new Map<string, EventSource>();
const ports = new Map<string, MessagePort[]>();

function getOrOpenSource(projectId: string, apiBase: string): EventSource {
  if (sources.has(projectId)) return sources.get(projectId)!;

  const url = `${apiBase}/projects/${projectId}/events`;
  const source = new EventSource(url, { withCredentials: true });

  source.addEventListener('message', (event) => {
    const projectPorts = ports.get(projectId) ?? [];
    // Forward the full ProjectEventDto union (file-tree, content-changed, main-file-changed)
    // verbatim; the subscribing hook discriminates on the event's own `type`.
    for (const port of projectPorts) {
      port.postMessage({ type: 'project-event', event: JSON.parse(event.data) });
    }
  });

  // 'open' fires when the SSE connection is (re)established; 'error' when it drops (and on each failed
  // retry). Forward both as connection-status edges so subscribers can reflect true live/offline state,
  // and keep the 'reconnect' resync signal on 'error' so consumers refetch once the stream is back.
  source.addEventListener('open', () => {
    const projectPorts = ports.get(projectId) ?? [];
    for (const port of projectPorts) {
      port.postMessage({ type: 'sse-connected' });
    }
  });

  source.addEventListener('error', () => {
    const projectPorts = ports.get(projectId) ?? [];
    for (const port of projectPorts) {
      port.postMessage({ type: 'reconnect' });
    }
  });

  sources.set(projectId, source);
  return source;
}

function removePort(projectId: string, port: MessagePort): void {
  const projectPorts = ports.get(projectId);
  if (!projectPorts) return;
  const index = projectPorts.indexOf(port);
  if (index !== -1) projectPorts.splice(index, 1);
  if (projectPorts.length === 0) {
    ports.delete(projectId);
    sources.get(projectId)?.close();
    sources.delete(projectId);
  }
}

if (globalThis instanceof SharedWorkerGlobalScope) {
  globalThis.addEventListener('connect', (connectEvent) => {
    if (!(connectEvent instanceof MessageEvent)) return;
    const port: MessagePort = connectEvent.ports[0];

    port.addEventListener('message', (event: WorkerMessageEvent) => {
      const message = event.data;

      if (message.type === 'subscribe') {
        const { projectId, apiBase } = message;
        if (!ports.has(projectId)) ports.set(projectId, []);
        const projectPorts = ports.get(projectId)!;
        // Guard against duplicate subscriptions (e.g. React Strict Mode double-invoke)
        if (!projectPorts.includes(port)) {
          projectPorts.push(port);
        }
        getOrOpenSource(projectId, apiBase);
      } else {
        const { projectId } = message;
        removePort(projectId, port);
      }
    });

    port.addEventListener('close', () => {
      for (const projectId of ports.keys()) {
        removePort(projectId, port);
      }
    });

    port.start();
  });
}

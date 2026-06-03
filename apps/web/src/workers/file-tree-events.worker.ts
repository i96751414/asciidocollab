/// <reference lib="webworker" />

// SharedWorker: holds one EventSource per project, fans out events to all tabs

interface SubscribeMessage {
  type: 'subscribe';
  projectId: string;
  apiBase: string;
}

interface WorkerMessage {
  data: SubscribeMessage;
}

const sources = new Map<string, EventSource>();
const ports = new Map<string, MessagePort[]>();

function getOrOpenSource(projectId: string, apiBase: string): EventSource {
  if (sources.has(projectId)) return sources.get(projectId)!;

  const url = `${apiBase}/projects/${projectId}/events`;
  const source = new EventSource(url, { withCredentials: true });

  source.addEventListener('message', (event) => {
    const projectPorts = ports.get(projectId) ?? [];
    for (const port of projectPorts) {
      port.postMessage({ type: 'file-tree-change', event: JSON.parse(event.data) });
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

declare const self: SharedWorkerGlobalScope;
self.addEventListener('connect', (connectEvent: MessageEvent) => {
  const port: MessagePort = connectEvent.ports[0];

  port.addEventListener('message', (event: WorkerMessage) => {
    const { type, projectId, apiBase } = event.data;

    if (type === 'subscribe') {
      if (!ports.has(projectId)) ports.set(projectId, []);
      ports.get(projectId)!.push(port);

      getOrOpenSource(projectId, apiBase);

      port.addEventListener('close', () => {
        const projectPorts = ports.get(projectId);
        if (!projectPorts) return;
        const index = projectPorts.indexOf(port);
        if (index !== -1) projectPorts.splice(index, 1);
        if (projectPorts.length === 0) {
          ports.delete(projectId);
          sources.get(projectId)?.close();
          sources.delete(projectId);
        }
      });
    }
  });

  port.start();
});

import { buildChangeItem } from './diff';
import type {
  FileDocument,
  FileRequest,
  FileSaveRequest,
  FileService,
  FileServiceBridgeStatus,
  ListProjectsOptions,
  ProjectTreeRequest,
} from './types';

interface BridgeErrorPayload {
  error?: string;
}

const BRIDGE_BASE = '/api/file-bridge';
const BRIDGE_HEADER = 'x-openclaw-file-bridge';
const BRIDGE_RUNTIME_HEADER = 'x-openclaw-file-bridge-runtime';

const createBridgeUnavailableStatus = (detail: string): FileServiceBridgeStatus => ({
  kind: 'bridge-unavailable',
  label: 'Bridge unavailable',
  detail,
});

const createLocalBridgeStatus = (runtime: string | null): FileServiceBridgeStatus => ({
  kind: 'local-dev-bridge',
  label: 'Local dev bridge active',
  detail: runtime
    ? `Filesystem access is served by the local Vite bridge runtime (${runtime}).`
    : 'Filesystem access is served by the local Vite bridge runtime.',
});

const createRuntimeError = (status: FileServiceBridgeStatus) => new Error(status.detail);

const parseBridgeStatus = (response: Response): FileServiceBridgeStatus => {
  const bridgeMode = response.headers.get(BRIDGE_HEADER);
  const runtime = response.headers.get(BRIDGE_RUNTIME_HEADER);

  if (bridgeMode === 'local-dev-bridge') {
    return createLocalBridgeStatus(runtime);
  }

  return createBridgeUnavailableStatus('The response did not come from the local Vite file bridge runtime.');
};

const requestJson = async <TResponse>(input: RequestInfo, init?: RequestInit) => {
  const response = await fetch(input, {
    ...init,
    headers: {
      'Content-Type': 'application/json',
      ...(init?.headers ?? {}),
    },
  });

  const bridgeStatus = parseBridgeStatus(response);
  const payload = (await response.json()) as TResponse | BridgeErrorPayload;
  if (bridgeStatus.kind !== 'local-dev-bridge') {
    throw createRuntimeError(bridgeStatus);
  }
  if (!response.ok) {
    throw new Error((payload as BridgeErrorPayload).error ?? 'File bridge request failed.');
  }

  return {
    bridgeStatus,
    payload: payload as TResponse,
  };
};

const postJson = <TResponse>(path: string, body: unknown) => requestJson<TResponse>(`${BRIDGE_BASE}${path}`, {
  method: 'POST',
  body: JSON.stringify(body),
});

class HttpFileService implements FileService {
  private status: FileServiceBridgeStatus = createBridgeUnavailableStatus('Bridge probe has not run yet.');

  getStatus() {
    return this.status;
  }

  private updateStatus(next: FileServiceBridgeStatus) {
    this.status = next;
  }

  async initializeRuntime() {
    try {
      const response = await fetch(`${BRIDGE_BASE}/status`, {
        method: 'GET',
        headers: {
          Accept: 'application/json',
        },
      });
      const nextStatus = parseBridgeStatus(response);
      if (nextStatus.kind !== 'local-dev-bridge') {
        this.updateStatus(nextStatus);
        return nextStatus;
      }

      if (!response.ok) {
        const payload = (await response.json()) as BridgeErrorPayload;
        const unavailable = createBridgeUnavailableStatus(payload.error ?? 'The local Vite bridge status probe failed.');
        this.updateStatus(unavailable);
        return unavailable;
      }

      this.updateStatus(nextStatus);
      return nextStatus;
    } catch (error) {
      const unavailable = createBridgeUnavailableStatus(
        error instanceof Error
          ? `Could not reach /api/file-bridge/status on the local Vite dev server: ${error.message}`
          : 'Could not reach /api/file-bridge/status on the local Vite dev server.',
      );
      this.updateStatus(unavailable);
      return unavailable;
    }
  }

  async listProjects(options: ListProjectsOptions) {
    const response = await postJson<{ projects: Awaited<ReturnType<FileService['listProjects']>> }>('/projects', options);
    this.updateStatus(response.bridgeStatus);
    return response.payload.projects;
  }

  async listProjectTree(request: ProjectTreeRequest) {
    const response = await postJson<{ files: Awaited<ReturnType<FileService['listProjectTree']>> }>('/tree', request);
    this.updateStatus(response.bridgeStatus);
    return response.payload.files;
  }

  async openFile(request: FileRequest) {
    const response = await postJson<{ file: FileDocument }>('/read', request);
    this.updateStatus(response.bridgeStatus);
    return response.payload.file;
  }

  async saveFile(request: FileSaveRequest) {
    const response = await postJson<{ file: FileDocument }>('/write', request);
    this.updateStatus(response.bridgeStatus);
    return response.payload.file;
  }

  buildDiff(request: Parameters<typeof buildChangeItem>[0]) {
    return buildChangeItem(request);
  }

  async sendFileToSession() {
    // Session wiring stays in the client stores; the bridge is filesystem-only.
  }
}

export const httpFileService = new HttpFileService();

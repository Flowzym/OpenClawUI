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
const FALLBACK_HEADER = 'x-openclaw-file-bridge';

const parseBridgeStatus = (response: Response): FileServiceBridgeStatus => {
  const value = response.headers.get(FALLBACK_HEADER);
  if (value === 'active') return { kind: 'bridge' };
  return {
    kind: 'mock-fallback',
    reason: 'HTTP file bridge header missing from local Vite server response.',
  };
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
  private status: FileServiceBridgeStatus = { kind: 'bridge' };

  getStatus() {
    return this.status;
  }

  private updateStatus(next: FileServiceBridgeStatus) {
    this.status = next;
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

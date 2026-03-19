import { httpFileService } from './httpFileService';
import { mockFileService } from './mockFileService';
import type {
  BuildDiffRequest,
  FileRequest,
  FileSaveRequest,
  FileService,
  FileServiceBridgeStatus,
  ListProjectsOptions,
  ProjectTreeRequest,
} from './types';

const canProbeLocalBridge = typeof window !== 'undefined' && typeof window.fetch === 'function';

const browserUnavailableStatus: FileServiceBridgeStatus = {
  kind: 'bridge-unavailable',
  label: 'Bridge unavailable',
  detail: 'Browser runtime detected, but the local Vite bridge has not confirmed availability yet.',
};

const nonBrowserMockStatus: FileServiceBridgeStatus = {
  kind: 'mock-fallback',
  label: 'Mock fallback active',
  detail: 'Non-browser runtime detected; filesystem access falls back to in-memory mock data.',
};

class RuntimeAwareFileService implements FileService {
  private activeService: FileService = canProbeLocalBridge ? httpFileService : mockFileService;

  private status: FileServiceBridgeStatus = canProbeLocalBridge ? browserUnavailableStatus : nonBrowserMockStatus;

  getStatus() {
    return this.status;
  }

  private setActiveService(service: FileService, status: FileServiceBridgeStatus) {
    this.activeService = service;
    this.status = status;
  }

  async initializeRuntime() {
    if (!canProbeLocalBridge) {
      const mockStatus = await mockFileService.initializeRuntime();
      this.setActiveService(mockFileService, mockStatus);
      return this.status;
    }

    const bridgeStatus = await httpFileService.initializeRuntime();
    if (bridgeStatus.kind === 'local-dev-bridge') {
      this.setActiveService(httpFileService, bridgeStatus);
      return this.status;
    }

    const mockStatus: FileServiceBridgeStatus = {
      kind: 'mock-fallback',
      label: 'Mock fallback active',
      detail: `${bridgeStatus.detail} Mock project data is active instead of real filesystem access.`,
    };
    this.setActiveService(mockFileService, mockStatus);
    return this.status;
  }

  private async resolveService() {
    if (canProbeLocalBridge && this.status.kind !== 'local-dev-bridge') {
      await this.initializeRuntime();
    }

    return this.activeService;
  }

  async listProjects(options: ListProjectsOptions) {
    const service = await this.resolveService();
    const projects = await service.listProjects(options);
    this.status = service === mockFileService ? this.status : service.getStatus();
    return projects;
  }

  async listProjectTree(request: ProjectTreeRequest) {
    const service = await this.resolveService();
    const files = await service.listProjectTree(request);
    this.status = service === mockFileService ? this.status : service.getStatus();
    return files;
  }

  async openFile(request: FileRequest) {
    const service = await this.resolveService();
    const file = await service.openFile(request);
    this.status = service === mockFileService ? this.status : service.getStatus();
    return file;
  }

  async saveFile(request: FileSaveRequest) {
    const service = await this.resolveService();
    const file = await service.saveFile(request);
    this.status = service === mockFileService ? this.status : service.getStatus();
    return file;
  }

  buildDiff(request: BuildDiffRequest) {
    return this.activeService.buildDiff(request);
  }

  async sendFileToSession(input: { filePath: string; content: string; sessionId: string }) {
    const service = await this.resolveService();
    await service.sendFileToSession(input);
    this.status = service === mockFileService ? this.status : service.getStatus();
  }
}

export const fileService: FileService = new RuntimeAwareFileService();

import { httpFileService } from './httpFileService';
import { mockFileService } from './mockFileService';
import type { FileService } from './types';

const canUseBridge = typeof window !== 'undefined' && typeof window.fetch === 'function';

const service: FileService = canUseBridge ? httpFileService : mockFileService;

export const fileService = service;

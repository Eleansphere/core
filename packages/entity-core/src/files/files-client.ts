import { HttpTransport } from '../http/http-transport';
import type { FileDto } from './file-dto';

export interface FilesListParams {
  refType?: string;
  refId?: string;
  role?: string;
  ownerId?: string;
}

export interface FileUploadFields extends FilesListParams {
  file: File;
  /** Position among files sharing the same `refType`/`refId`/`role`. */
  sortOrder?: number;
}

/**
 * Client for be-core's detached file service (`GET/POST/DELETE /api/files`) — an S3-compatible
 * bucket, independent of any specific entity. Not part of the generated-service inheritance chain
 * (files aren't a CRUD resource: no `getById`, no `update`) — construct one with the same
 * `baseUrl`/`tokenProvider` an entity service uses, or go through `withImages` for the common
 * `role: 'image'` case.
 */
export class FilesClient extends HttpTransport {
  private static readonly BASE_PATH = '/api/files';

  async list(params: FilesListParams = {}): Promise<FileDto[]> {
    const { data } = await this.getJson<{ data: FileDto[] }, FilesListParams>(
      FilesClient.BASE_PATH,
      params
    );
    return data;
  }

  upload(fields: FileUploadFields): Promise<FileDto> {
    return this.postMultipart<FileDto, FileUploadFields>(FilesClient.BASE_PATH, fields);
  }

  remove(fileId: string): Promise<void> {
    return this.deleteRequest(`${FilesClient.BASE_PATH}/${fileId}`);
  }
}

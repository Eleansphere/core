import { HttpTransport } from '../http/http-transport';
import type { FileDto, FileVisibility } from './file-dto';

export interface FilesListParams {
  refType?: string;
  refId?: string;
  role?: string;
}

export interface FileUploadFields extends FilesListParams {
  /** A `File` keeps its name; a bare `Blob` (e.g. a resized image) is uploaded without one. */
  file: Blob;
  /** Position among files sharing the same `refType`/`refId`/`role`. */
  sortOrder?: number;
  /** Default `public`. Private files are served only to whoever the server's authorizer allows. */
  visibility?: FileVisibility;
}

/**
 * Client for be-core's detached file service (`GET/POST/DELETE /api/files`) — an S3-compatible
 * bucket, independent of any specific entity. Not part of the generated-service inheritance chain
 * (files aren't a CRUD resource) — construct one with the same `baseUrl` and token source an
 * entity service uses, or go through `withFiles`.
 */
export class FilesClient extends HttpTransport {
  private static readonly BASE_PATH = '/api/files';

  /** Files the caller may read, ordered by `sortOrder`. */
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

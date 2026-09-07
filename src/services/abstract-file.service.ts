import { ApiClient } from '../api-client';

export abstract class AbstractFileService<TDto, TCreate> extends ApiClient {
  protected abstract readonly basePath: string;
  protected abstract readonly uploadField: string;

  getAll(): Promise<TDto[]> {
    return this.get<TDto[]>(this.basePath);
  }

  getById(id: string): Promise<TDto> {
    return this.get<TDto>(`${this.basePath}/${id}`);
  }

  create(data: TCreate): Promise<TDto> {
    return this.post<TDto>(this.basePath, data);
  }

  delete(id: string): Promise<void> {
    return this.httpDelete(`${this.basePath}/${id}`);
  }

  upload(id: string, file: File): Promise<void> {
    return this.uploadFile(`${this.basePath}/${id}/${this.uploadField}`, this.uploadField, file);
  }

  getFileUrl(id: string): string {
    return `${this.baseUrl}${this.basePath}/${id}/${this.uploadField}`;
  }
}

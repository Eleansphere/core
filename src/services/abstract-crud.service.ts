import { ApiClient } from '../api-client';

export interface PaginationParams {
  page?: number;
  limit?: number;
}

export interface PaginatedResponse<T> {
  data: T[];
  total: number;
  page?: number;
  limit?: number;
}

export abstract class AbstractCrudService<
  TDto,
  TCreate,
  TUpdate,
> extends ApiClient {
  protected abstract readonly basePath: string;

  getAll(params?: PaginationParams): Promise<PaginatedResponse<TDto>> {
    return this.get<PaginatedResponse<TDto>, PaginationParams>(this.basePath, params);
  }

  getById(id: string): Promise<TDto> {
    return this.get<TDto>(`${this.basePath}/${id}`);
  }

  create(data: TCreate): Promise<TDto> {
    return this.post<TDto>(this.basePath, data);
  }

  update(id: string, data: TUpdate): Promise<TDto> {
    return this.put<TDto>(`${this.basePath}/${id}`, data);
  }

  delete(id: string): Promise<void> {
    return this.httpDelete(`${this.basePath}/${id}`);
  }
}

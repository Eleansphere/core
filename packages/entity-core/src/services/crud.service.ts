import { ApiClient } from '../http/api-client';

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

/** Base for a hand-written CRUD service. `defineEntity`'s generated services extend this too. */
export abstract class CrudServiceBase<Dto, Create, Update> extends ApiClient {
  protected abstract readonly basePath: string;

  getAll(params?: PaginationParams): Promise<PaginatedResponse<Dto>> {
    return this.get<PaginatedResponse<Dto>, PaginationParams>(this.basePath, params);
  }

  getById(id: string): Promise<Dto> {
    return this.get<Dto>(`${this.basePath}/${id}`);
  }

  create(data: Create): Promise<Dto> {
    return this.post<Dto>(this.basePath, data);
  }

  update(id: string, data: Update): Promise<Dto> {
    return this.put<Dto>(`${this.basePath}/${id}`, data);
  }

  delete(id: string): Promise<void> {
    return this.httpDelete(`${this.basePath}/${id}`);
  }
}

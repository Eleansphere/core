import { ApiClient } from '../http/api-client';
import { toListQueryParams } from './list-request';
import type { ListRequest, PaginatedResponse } from './list-request';

/** Base for a hand-written CRUD service. `defineEntity`'s generated services extend this too. */
export abstract class CrudServiceBase<
  Dto,
  Create,
  Update,
  List extends ListRequest = ListRequest,
> extends ApiClient {
  protected abstract readonly basePath: string;

  getAll(params?: List): Promise<PaginatedResponse<Dto>> {
    return this.get<PaginatedResponse<Dto>, Record<string, string>>(
      this.basePath,
      toListQueryParams(params)
    );
  }

  getById(id: string): Promise<Dto> {
    return this.get<Dto>(`${this.basePath}/${id}`);
  }

  create(data: Create): Promise<Dto> {
    return this.post<Dto>(this.basePath, data);
  }

  /** Partial update (PATCH): only the fields sent change. */
  update(id: string, data: Update): Promise<Dto> {
    return this.patch<Dto>(`${this.basePath}/${id}`, data);
  }

  delete(id: string): Promise<void> {
    return this.httpDelete(`${this.basePath}/${id}`);
  }
}

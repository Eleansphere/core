import { AbstractCrudService } from '@eleansphere/service-core';

export abstract class AbstractUserScopedCrudService<
  TDto,
  TCreate,
  TUpdate,
> extends AbstractCrudService<TDto, TCreate, TUpdate> {
  protected abstract readonly basePath: string;
}

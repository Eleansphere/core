// ── Entity toolkit ───────────────────────────────────────────────────────────
export { defineEntity } from './entity-factory';
export type {
  FieldDef,
  Fields,
  InferDto,
  InferCreateDto,
  InferUpdateDto,
  DtoClass,
  EntityResult,
  CrudServiceInstance,
  ExtendableService,
} from './entity-factory';
// Re-exported from be-core so entity definitions can reference the field-type union directly
// instead of scattering `'STRING' as const` literals.
export type { FieldType } from '@eleansphere/be-core';

// ── Wiring helpers ───────────────────────────────────────────────────────────
export { createServiceContainer } from './service-container';
export type { ServiceRegistry, ServiceContainer } from './service-container';
export { toModelConfigs } from './model-configs';
export type { ToModelConfigsOptions } from './model-configs';

// ── HTTP / service layer (was @eleansphere/service-core, merged in at 2.0.0) ──
export { ApiClient } from './api-client';
export { AbstractCrudService } from './services/abstract-crud.service';
export type { PaginationParams, PaginatedResponse } from './services/abstract-crud.service';
export { AbstractFileService } from './services/abstract-file.service';
export { AbstractAuthService } from './services/abstract-auth.service';
export { AuthService } from './services/auth.service';
export type { LoginRequest, LoginResponse, AuthUser } from './services/auth.service';
export { AbstractServiceContainer } from './abstract-service-container';
export type { FileDto, FileVisibility } from './file-dto';

/**
 * @deprecated `userScoped` is a backend concern (be-core stamps/enforces `ownerId`); this alias
 * added nothing over `AbstractCrudService`. Import that instead. Kept for one major.
 */
export { AbstractCrudService as AbstractUserScopedCrudService } from './services/abstract-crud.service';

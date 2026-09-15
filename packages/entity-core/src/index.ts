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
export { createServiceContainer } from './wiring/service-container';
export type { ServiceRegistry, ServiceContainer } from './wiring/service-container';
export { toModelConfigs } from './wiring/model-configs';
export type { ToModelConfigsOptions } from './wiring/model-configs';

// ── HTTP / service layer (was @eleansphere/service-core, merged in at 2.0.0) ──
export { HttpTransport } from './http/http-transport';
export { ApiError } from './http/api-error';
export { ApiClient } from './http/api-client';
export { CrudServiceBase } from './services/crud.service';
export type { PaginationParams, PaginatedResponse } from './services/crud.service';
export { AuthServiceBase } from './services/auth-base.service';
export { AuthService } from './services/auth.service';
export type { LoginRequest, LoginResponse, AuthUser } from './services/auth.service';

// ── Files (be-core's detached file service) ───────────────────────────────────
export { FilesClient } from './files/files-client';
export type { FilesListParams, FileUploadFields } from './files/files-client';
export { withImages } from './services/images.service';
export type { FileDto, FileVisibility } from './files/file-dto';

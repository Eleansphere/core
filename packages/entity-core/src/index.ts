// ── Entity toolkit ───────────────────────────────────────────────────────────
export { defineEntity } from './entity-factory';
export type {
  DtoClass,
  EntityResult,
  CrudServiceInstance,
  ExtendableService,
} from './entity-factory';
export type {
  FieldDef,
  Fields,
  FieldValue,
  InferDto,
  EntityDto,
  InferCreateDto,
  InferUpdateDto,
  SystemDtoFields,
  OwnerDtoField,
  SystemColumn,
  EntityQuery,
  EntityIndex,
  NoQuery,
  ListFilters,
  ListParams,
  SortTerm,
  RangeFilter,
  NullFilter,
} from './entity-types';
// The field vocabulary is owned by @eleansphere/schema; re-exported for entity definitions and forms.
export type {
  FieldType,
  AccessPolicy,
  FilterOperator,
  ValidationIssue,
  ValidationIssueCode,
  ValidationMode,
} from '@eleansphere/schema';

// ── Forms ────────────────────────────────────────────────────────────────────
export { toStandardSchema } from './validation/standard-schema';
export type {
  StandardSchemaV1,
  FormIssue,
  FormOutput,
  ToStandardSchemaOptions,
} from './validation/standard-schema';

// ── Wiring helpers ───────────────────────────────────────────────────────────
export { createServiceContainer } from './wiring/service-container';
export type { ServiceRegistry, ServiceContainer } from './wiring/service-container';
export { toModelConfigs } from './wiring/model-configs';
export type { ToModelConfigsOptions } from './wiring/model-configs';

// ── HTTP / service layer ─────────────────────────────────────────────────────
export { HttpTransport } from './http/http-transport';
export { ApiError } from './http/api-error';
export { ApiClient } from './http/api-client';
export { CrudServiceBase } from './services/crud.service';
export { toListQueryParams } from './services/list-request';
export type { PaginationParams, PaginatedResponse, ListRequest } from './services/list-request';
export { AuthServiceBase } from './services/auth-base.service';
export { AuthService } from './services/auth.service';
export type { LoginRequest, LoginResponse, AuthUser } from './services/auth.service';

// ── Files (be-core's detached file service) ───────────────────────────────────
export { FilesClient } from './files/files-client';
export type { FilesListParams, FileUploadFields } from './files/files-client';
export { withImages } from './services/images.service';
export type { FileDto, FileVisibility } from './files/file-dto';

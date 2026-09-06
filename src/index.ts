export { defineEntity } from './entity-factory';
export type { FieldDef, Fields, InferDto, InferCreateDto, InferUpdateDto, DtoClass } from './entity-factory';
// Re-exported from be-core so entity definitions can reference the field-type union directly
// instead of scattering `'STRING' as const` literals.
export type { FieldType } from '@eleansphere/be-core';
export { AbstractUserScopedCrudService } from './services/abstract-user-scoped-crud.service';

// ── Wiring helpers ────────────────────────────────────────────────────────────
export { createServiceContainer } from './service-container';
export type { ServiceRegistry, ServiceContainer } from './service-container';
export { toModelConfigs } from './model-configs';
export type { ToModelConfigsOptions } from './model-configs';

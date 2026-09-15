import { ApiClient } from '../http/api-client';

/**
 * Base for a hand-written auth service — `login`/`me` only, no assumption about the request/
 * response shape. `AuthService` (in `auth.service.ts`) is the concrete one built on this, matching
 * be-core's `createAuthRouter`; extend `AuthServiceBase` directly only for a backend that doesn't.
 */
export abstract class AuthServiceBase<LoginRequest, LoginResponse, Me> extends ApiClient {
  abstract login(credentials: LoginRequest): Promise<LoginResponse>;
  abstract me(): Promise<Me>;
}

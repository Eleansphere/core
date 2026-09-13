import { AuthServiceBase } from './auth-base.service';

/** Body of `POST /api/auth/login`. */
export interface LoginRequest {
  email: string;
  password: string;
}

/** Response of `POST /api/auth/login` from be-core's `createAuthRouter`. */
export interface LoginResponse {
  token: string;
  email: string;
  role: string;
}

/** Response of `GET /api/auth/me` from be-core's `createAuthRouter`. */
export interface AuthUser {
  id: string;
  email: string;
}

/**
 * Concrete auth service matching the endpoints be-core's `createAuthRouter` actually mounts —
 * `login`, `me`, and (when `AppConfig.auth.passwordReset` is set) `forgotPassword` /
 * `resetPassword`. Use it directly, or extend it for project-specific auth routes:
 *
 * ```ts
 * export class AppAuthService extends AuthService {
 *   register(dto: RegisterRequest) { return this.post('/api/auth/register', dto); }
 * }
 * ```
 *
 * The generics let a project widen the `me` / login shapes without reimplementing the calls
 * (e.g. `AuthService<{ id: string; email: string; name: string }>`).
 */
export class AuthService<
  TMe extends AuthUser = AuthUser,
  TLoginResponse extends LoginResponse = LoginResponse,
> extends AuthServiceBase<LoginRequest, TLoginResponse, TMe> {
  login(credentials: LoginRequest): Promise<TLoginResponse> {
    return this.post<TLoginResponse>('/api/auth/login', credentials);
  }

  me(): Promise<TMe> {
    return this.get<TMe>('/api/auth/me');
  }

  /** Requires `AppConfig.auth.passwordReset` on the backend. Always resolves (no email enumeration). */
  forgotPassword(email: string): Promise<{ message: string }> {
    return this.post<{ message: string }>('/api/auth/forgot-password', { email });
  }

  resetPassword(token: string, newPassword: string): Promise<{ message: string }> {
    return this.post<{ message: string }>('/api/auth/reset-password', { token, newPassword });
  }
}

import { AuthServiceBase } from './auth-base.service';

/** Body of `POST /api/auth/login`. */
export interface LoginRequest {
  email: string;
  password: string;
}

/** The user as `GET /api/auth/me` returns it. Widen it with your user model's columns. */
export interface AuthUser {
  id: string;
  email: string;
  role?: string;
}

/** Body of `POST /api/auth/register`; add the columns listed in the server's `register.fields`. */
export interface RegisterRequest {
  email: string;
  password: string;
}

/** A started session: login, registration and password change all answer with one. */
export interface LoginResponse<TUser extends AuthUser = AuthUser> {
  token: string;
  /** Present when the server has refresh tokens enabled. */
  refreshToken?: string;
  id: string;
  email: string;
  role?: string;
  user: TUser;
}

export interface RefreshResponse {
  token: string;
  refreshToken: string;
}

export interface MessageResponse {
  message: string;
}

const AUTH_PATH = '/api/auth';

/**
 * Client for be-core's `/api/auth` routes. Which endpoints exist depends on the server's
 * `AppConfig.auth` (`register`, `changePassword`, `profileFields`, `deleteAccount`,
 * `refreshTokens`, `passwordReset`). Store the tokens of a returned session with
 * `AuthSession.start(response)`.
 *
 * ```ts
 * class AppAuthService extends AuthService<AppUser, AppRegisterRequest, AppProfileChanges> {}
 * ```
 */
export class AuthService<
  TUser extends AuthUser = AuthUser,
  TRegister extends RegisterRequest = RegisterRequest,
  TProfile extends object = Partial<Omit<TUser, 'id' | 'email' | 'role'>>,
> extends AuthServiceBase<LoginRequest, LoginResponse<TUser>, TUser> {
  login(credentials: LoginRequest): Promise<LoginResponse<TUser>> {
    return this.post<LoginResponse<TUser>>(`${AUTH_PATH}/login`, credentials);
  }

  register(data: TRegister): Promise<LoginResponse<TUser>> {
    return this.post<LoginResponse<TUser>>(`${AUTH_PATH}/register`, data);
  }

  me(): Promise<TUser> {
    return this.get<TUser>(`${AUTH_PATH}/me`);
  }

  updateMe(changes: TProfile): Promise<TUser> {
    return this.patch<TUser>(`${AUTH_PATH}/me`, changes);
  }

  /** Deletes the account and everything it owns; the password confirms it. */
  deleteMe(password: string): Promise<void> {
    return this.httpDelete(`${AUTH_PATH}/me`, { password });
  }

  /** Logs every other session out and answers with a new session for this one. */
  changePassword(currentPassword: string, newPassword: string): Promise<LoginResponse<TUser>> {
    return this.post<LoginResponse<TUser>>(`${AUTH_PATH}/change-password`, {
      currentPassword,
      newPassword,
    });
  }

  /** Usually not called directly: an `AuthSession` renews tokens on its own. */
  refresh(refreshToken: string): Promise<RefreshResponse> {
    return this.post<RefreshResponse>(`${AUTH_PATH}/refresh`, { refreshToken });
  }

  /** Revokes the refresh token on the server; end the local `AuthSession` afterwards. */
  logout(refreshToken: string): Promise<void> {
    return this.post<void>(`${AUTH_PATH}/logout`, { refreshToken });
  }

  /** Always resolves, whether or not the email exists. */
  forgotPassword(email: string): Promise<MessageResponse> {
    return this.post<MessageResponse>(`${AUTH_PATH}/forgot-password`, { email });
  }

  resetPassword(token: string, newPassword: string): Promise<MessageResponse> {
    return this.post<MessageResponse>(`${AUTH_PATH}/reset-password`, { token, newPassword });
  }
}

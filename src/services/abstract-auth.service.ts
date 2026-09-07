import { ApiClient } from '../api-client';

export abstract class AbstractAuthService<
  TLoginRequest,
  TLoginResponse,
  TMe,
> extends ApiClient {
  abstract login(credentials: TLoginRequest): Promise<TLoginResponse>;
  abstract me(): Promise<TMe>;
}

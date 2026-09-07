export abstract class AbstractServiceContainer {
  protected readonly baseUrl: string;
  protected readonly tokenProvider: () => string | null;

  constructor(baseUrl: string, tokenProvider: () => string | null) {
    this.baseUrl = baseUrl;
    this.tokenProvider = tokenProvider;
  }

  protected args(): [string, () => string | null] {
    return [this.baseUrl, this.tokenProvider];
  }
}

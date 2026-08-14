export class VindicateError extends Error {
  constructor(
    message: string,
    public readonly code: string,
    public override readonly cause?: unknown
  ) {
    super(message);
    this.name = "VindicateError";
  }
}

export class ConfigWriteError extends VindicateError {
  constructor(filePath: string, cause?: unknown) {
    super(`Failed to write config at ${filePath}`, "CONFIG_WRITE_ERROR", cause);
    this.name = "ConfigWriteError";
  }
}

export class AuthError extends VindicateError {
  constructor(message: string, cause?: unknown) {
    super(message, "AUTH_ERROR", cause);
    this.name = "AuthError";
  }
}

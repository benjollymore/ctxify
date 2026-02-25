export class CtxifyError extends Error {
  constructor(message: string, public readonly cause?: Error) {
    super(message);
    this.name = 'CtxifyError';
  }
}

export class ConfigError extends CtxifyError {
  constructor(message: string, cause?: Error) {
    super(message, cause);
    this.name = 'ConfigError';
  }
}

export class PassError extends CtxifyError {
  constructor(
    message: string,
    public readonly passName: string,
    cause?: Error,
  ) {
    super(message, cause);
    this.name = 'PassError';
  }
}

export class GitError extends CtxifyError {
  constructor(message: string, cause?: Error) {
    super(message, cause);
    this.name = 'GitError';
  }
}

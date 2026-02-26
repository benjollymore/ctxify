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

export class GitError extends CtxifyError {
  constructor(message: string, cause?: Error) {
    super(message, cause);
    this.name = 'GitError';
  }
}

import chalk from 'chalk';

export type LogLevel = 'silent' | 'error' | 'warn' | 'info' | 'debug';

const LOG_PRIORITY: Record<LogLevel, number> = {
  silent: 0,
  error: 1,
  warn: 2,
  info: 3,
  debug: 4,
};

export interface Logger {
  error(msg: string, ...args: unknown[]): void;
  warn(msg: string, ...args: unknown[]): void;
  info(msg: string, ...args: unknown[]): void;
  debug(msg: string, ...args: unknown[]): void;
  child(prefix: string): Logger;
}

export function createLogger(level: LogLevel = 'info', prefix = ''): Logger {
  const threshold = LOG_PRIORITY[level];
  const tag = prefix ? `[${prefix}] ` : '';

  function shouldLog(msgLevel: LogLevel): boolean {
    return LOG_PRIORITY[msgLevel] <= threshold;
  }

  return {
    error(msg: string, ...args: unknown[]) {
      if (shouldLog('error')) {
        console.error(chalk.red(`${tag}ERROR: ${msg}`), ...args);
      }
    },
    warn(msg: string, ...args: unknown[]) {
      if (shouldLog('warn')) {
        console.error(chalk.yellow(`${tag}WARN: ${msg}`), ...args);
      }
    },
    info(msg: string, ...args: unknown[]) {
      if (shouldLog('info')) {
        console.error(chalk.blue(`${tag}${msg}`), ...args);
      }
    },
    debug(msg: string, ...args: unknown[]) {
      if (shouldLog('debug')) {
        console.error(chalk.gray(`${tag}DEBUG: ${msg}`), ...args);
      }
    },
    child(childPrefix: string): Logger {
      const combined = prefix ? `${prefix}:${childPrefix}` : childPrefix;
      return createLogger(level, combined);
    },
  };
}

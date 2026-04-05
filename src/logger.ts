/** Tiny log-level aware logger to replace raw console.log noise. */

type LogLevel = "debug" | "info" | "warn" | "error";

const LEVEL_PRIORITY: Record<LogLevel, number> = {
  debug: 0,
  info: 1,
  warn: 2,
  error: 3,
};

class Logger {
  private prefix: string;
  private level: LogLevel;

  constructor(prefix: string, level: LogLevel = "info") {
    this.prefix = prefix;
    this.level = level;
  }

  private shouldLog(level: LogLevel): boolean {
    return LEVEL_PRIORITY[level] >= LEVEL_PRIORITY[this.level];
  }

  private fmt(msg: string): string {
    return `[FillIt:${this.prefix}] ${msg}`;
  }

  debug(msg: string, ...args: unknown[]): void {
    if (this.shouldLog("debug")) console.debug(this.fmt(msg), ...args);
  }

  info(msg: string, ...args: unknown[]): void {
    if (this.shouldLog("info")) console.info(this.fmt(msg), ...args);
  }

  warn(msg: string, ...args: unknown[]): void {
    if (this.shouldLog("warn")) console.warn(this.fmt(msg), ...args);
  }

  error(msg: string, ...args: unknown[]): void {
    if (this.shouldLog("error")) console.error(this.fmt(msg), ...args);
  }

  setLevel(level: LogLevel): void {
    this.level = level;
  }
}

export function createLogger(prefix: string, level: LogLevel = "info"): Logger {
  return new Logger(prefix, level);
}

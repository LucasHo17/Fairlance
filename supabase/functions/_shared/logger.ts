type LogLevel = "debug" | "info" | "warn" | "error";

interface LogPayload {
  message: string;
  level: LogLevel;
  timestamp: string;
  context?: Record<string, unknown>;
}

class StructuredLogger {
  private context: Record<string, unknown> = {};

  constructor(defaultContext: Record<string, unknown> = {}) {
    this.context = defaultContext;
  }

  private log(level: LogLevel, message: string, extra?: Record<string, unknown>) {
    const payload: LogPayload = {
      message,
      level,
      timestamp: new Date().toISOString(),
      context: { ...this.context, ...extra },
    };
    
    const formatted = JSON.stringify(payload);
    switch (level) {
      case "error":
        console.error(formatted);
        break;
      case "warn":
        console.warn(formatted);
        break;
      case "info":
        console.log(formatted);
        break;
      case "debug":
        console.debug(formatted);
        break;
    }
  }

  info(message: string, extra?: Record<string, unknown>) {
    this.log("info", message, extra);
  }

  warn(message: string, extra?: Record<string, unknown>) {
    this.log("warn", message, extra);
  }

  error(message: string, extra?: Record<string, unknown>) {
    this.log("error", message, extra);
  }

  debug(message: string, extra?: Record<string, unknown>) {
    this.log("debug", message, extra);
  }
}

export const logger = new StructuredLogger();
export { StructuredLogger };

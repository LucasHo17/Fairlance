import os
import sys
import logging
import json

class JSONFormatter(logging.Formatter):
    def format(self, record):
        log_entry = {
            "timestamp": self.formatTime(record, "%Y-%m-%dT%H:%M:%S%z"),
            "level": record.levelname,
            "message": record.getMessage(),
            "logger": record.name,
            "filename": record.filename,
            "lineno": record.lineno,
        }
        if record.exc_info:
            log_entry["exception"] = self.formatException(record.exc_info)
        
        # Capture any custom fields passed via extra={...}
        for key, value in record.__dict__.items():
            if key not in {
                "name", "msg", "args", "levelname", "levelno", "pathname", 
                "filename", "module", "exc_info", "exc_text", "stack_info", 
                "lineno", "funcName", "created", "msecs", "relativeCreated", 
                "thread", "threadName", "processName", "process"
            }:
                # Ensure values are JSON serializable
                try:
                    json.dumps(value)
                    log_entry[key] = value
                except (TypeError, OverflowError):
                    log_entry[key] = str(value)
                    
        return json.dumps(log_entry)

def setup_logging():
    env = os.getenv("ENV", "development").lower()
    log_level_str = os.getenv("LOG_LEVEL", "INFO").upper()
    log_level = getattr(logging, log_level_str, logging.INFO)

    root_logger = logging.getLogger()
    root_logger.setLevel(log_level)

    # Clear existing handlers
    for handler in root_logger.handlers[:]:
        root_logger.removeHandler(handler)

    handler = logging.StreamHandler(sys.stdout)
    
    if env == "production" or os.getenv("LOG_FORMAT", "").lower() == "json":
        formatter = JSONFormatter()
    else:
        # Clean human-readable format for development
        formatter = logging.Formatter(
            fmt="%(asctime)s [%(levelname)s] %(name)s (%(filename)s:%(lineno)d) - %(message)s",
            datefmt="%Y-%m-%d %H:%M:%S"
        )
        
    handler.setFormatter(formatter)
    root_logger.addHandler(handler)

    # Reduce noise from dependency loggers unless we're in DEBUG
    if log_level != logging.DEBUG:
        logging.getLogger("uvicorn.access").setLevel(logging.WARNING)
        logging.getLogger("supabase").setLevel(logging.WARNING)
        logging.getLogger("httpx").setLevel(logging.WARNING)
        logging.getLogger("gotrue").setLevel(logging.WARNING)
    
    logger = logging.getLogger("app")
    logger.info(f"Logging initialized in {env} mode (level: {log_level_str})")

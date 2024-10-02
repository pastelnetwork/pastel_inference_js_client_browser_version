// browser_logger.js

class BrowserLogger {
  constructor() {
    this.logBuffer = [];
    this.MAX_LOG_ENTRIES = 100;
    this.listeners = new Map();
  }

  log(level, msg, meta) {
    const logEntry = { level, msg, meta, timestamp: new Date().toISOString() };
    this.logBuffer.push(this.safeStringify(logEntry));
    if (this.logBuffer.length > this.MAX_LOG_ENTRIES) {
      this.logBuffer.shift();
    }
    this.emit('newLog', this.safeStringify(logEntry));

    // Use console methods based on log level
    switch (level) {
      case 'error':
        console.error(msg, meta);
        break;
      case 'warn':
        console.warn(msg, meta);
        break;
      case 'info':
        console.info(msg, meta);
        break;
      default:
        console.log(msg, meta);
    }
  }

  error(msg, meta) {
    this.log('error', msg, meta);
  }

  warn(msg, meta) {
    this.log('warn', msg, meta);
  }

  info(msg, meta) {
    this.log('info', msg, meta);
  }

  debug(msg, meta) {
    this.log('debug', msg, meta);
  }

  on(eventName, listener) {
    if (!this.listeners.has(eventName)) {
      this.listeners.set(eventName, new Set());
    }
    this.listeners.get(eventName).add(listener);
  }

  off(eventName, listener) {
    if (this.listeners.has(eventName)) {
      this.listeners.get(eventName).delete(listener);
    }
  }

  emit(eventName, data) {
    if (this.listeners.has(eventName)) {
      for (const listener of this.listeners.get(eventName)) {
        listener(data);
      }
    }
  }
function safeStringify(obj, space = 2) {
  const seen = new WeakSet();

  const replacer = (key, value) => {
    if (typeof value === "object" && value !== null) {
      if (seen.has(value)) {
        return "[Circular]";
      }
      seen.add(value);

      if (isSequelizeModel(value)) {
        return value.get({ plain: true });
      }
      if (value.isJoi) {
        return `Joi Schema for ${value.type}`;
      }
      if (value instanceof Map) {
        return Array.from(value.entries());
      }
      if (value instanceof Set) {
        return Array.from(value);
      }
      if (value instanceof Date) {
        return value.toISOString();
      }
      if (value instanceof Error) {
        const errorDetails = {};
        Object.getOwnPropertyNames(value).forEach((prop) => {
          errorDetails[prop] = value[prop];
        });
        return errorDetails;
      }
      if (value.constructor === Object) {
        const sortedObj = {};
        Object.keys(value)
          .sort()
          .forEach((key) => {
            sortedObj[key] = value[key];
          });
        return sortedObj;
      }
    } else if (typeof value === "bigint") {
      return value.toString();
    }
    return value;
  };

  return JSON.stringify(obj, replacer, space);
}

const sendLoggerMessages = (message, level = 'info') => {
  const logMessage = {
    message,
    timestamp: new Date().toISOString(),
    level,
  }
  logMessageToTerminal(term, logMessage);

  if (displayInferenceRequestLoggerMessages) {
    logStatusMessage(logMessage.message);
  }

  if (displayCreateTicketLoggerMessages) {
    const statusContent =
      document.getElementById("createTicketStatus");
    if (logMessage.message) {
      logCreateTicketStatusMessage(
        logMessage.message,
        statusContent
      );
    }
  }
}

class InferenceLogger {
  error(str) {
    console.error(str);
    sendLoggerMessages(str, 'error');
  }
  info(str) {
    console.log(str);
    sendLoggerMessages(str);
  }
  warn(str) {
    console.warn(str);
    sendLoggerMessages(str, 'warn');
  }
  debug(str) {
    console.debug(str);
    sendLoggerMessages(str, 'debug');
  }
}

const logger = new InferenceLogger();

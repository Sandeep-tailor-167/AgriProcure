'use strict';

// Step 1 deliberately avoids logging request bodies or credentials.
const logger = Object.freeze({
  info: (...values) => console.info(...values),
  warn: (...values) => console.warn(...values),
  error: (...values) => console.error(...values)
});

module.exports = { logger };

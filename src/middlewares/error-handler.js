'use strict';

function notFoundHandler(request, response) {
  response.status(404).json({ success: false, error: { code: 'NOT_FOUND', message: 'API endpoint not found.' } });
}

function errorHandler(error, _request, response, _next) {
  const status = Number.isInteger(error.status) ? error.status : 500;
  if (status >= 500) console.error(error);
  response.status(status).json({
    success: false,
    error: {
      code: error.code || 'INTERNAL_ERROR',
      message: status >= 500 ? 'An unexpected error occurred.' : error.message
    }
  });
}

module.exports = { notFoundHandler, errorHandler };

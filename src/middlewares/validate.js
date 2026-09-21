'use strict';

function validate(schema, source = 'body') {
  return (request, response, next) => {
    const result = schema.safeParse(request[source]);
    if (!result.success) {
      return response.status(400).json({
        success: false,
        error: { code: 'VALIDATION_ERROR', message: 'Please correct the highlighted information.', details: result.error.issues.map((issue) => ({ path: issue.path.join('.'), message: issue.message })) }
      });
    }
    if (source === 'query') request.validatedQuery = result.data;
    else request[source] = result.data;
    next();
  };
}

module.exports = { validate };

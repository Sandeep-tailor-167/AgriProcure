'use strict';

function authorize(...roles) {
  const allowed = new Set(roles);
  return (request, response, next) => {
    if (!request.auth) return response.status(401).json({ success: false, error: { code: 'UNAUTHENTICATED', message: 'Sign in to continue.' } });
    if (!allowed.has(request.auth.role)) return response.status(403).json({ success: false, error: { code: 'FORBIDDEN', message: 'You do not have permission for this operation.' } });
    next();
  };
}

module.exports = { authorize };

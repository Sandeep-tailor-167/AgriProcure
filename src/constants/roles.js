'use strict';

const ROLES = Object.freeze({ FARMER: 'farmer', OFFICER: 'officer', ADMIN: 'admin' });
const ROLE_VALUES = Object.freeze(Object.values(ROLES));

module.exports = { ROLES, ROLE_VALUES };

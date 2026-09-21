'use strict';

const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const requiredPaths = [
  '.env.example', '.gitignore', 'README.md', 'Plan.md', 'package.json', 'requirements.txt',
  'docs/PRD.md', 'docs/architecture.md', 'docs/database.md', 'docs/api.md', 'docs/ai-models.md', 'docs/testing.md',
  'database/migrations/001_core_schema.sql', 'database/seeds/development.sql', 'database/diagrams/er-diagram.mmd',
  'src/index.html', 'src/app.js', 'src/config/environment.js', 'src/config/database.js', 'src/config/socket.js',
  'src/constants/roles.js', 'src/constants/states.js', 'src/controllers/auth.controller.js', 'src/controllers/centre.controller.js',
  'src/controllers/appointment.controller.js', 'src/controllers/queue.controller.js', 'src/controllers/transaction.controller.js',
  'src/controllers/notification.controller.js', 'src/controllers/analytics.controller.js', 'src/controllers/prediction.controller.js',
  'src/controllers/recommendation.controller.js', 'src/services/auth.service.js', 'src/services/centre.service.js',
  'src/services/appointment.service.js', 'src/services/queue.service.js', 'src/services/transaction.service.js',
  'src/services/notification.service.js', 'src/services/analytics.service.js', 'src/services/prediction.service.js',
  'src/services/recommendation.service.js', 'src/repositories/user.repository.js', 'src/repositories/centre.repository.js',
  'src/repositories/appointment.repository.js', 'src/repositories/queue.repository.js', 'src/repositories/transaction.repository.js',
  'src/repositories/notification.repository.js', 'src/repositories/analytics.repository.js', 'src/repositories/prediction.repository.js',
  'src/repositories/recommendation.repository.js', 'src/repositories/audit.repository.js', 'src/routes/index.js',
  'src/routes/auth.routes.js', 'src/routes/centre.routes.js', 'src/routes/appointment.routes.js', 'src/routes/queue.routes.js',
  'src/routes/transaction.routes.js', 'src/routes/notification.routes.js', 'src/routes/analytics.routes.js',
  'src/routes/prediction.routes.js', 'src/routes/recommendation.routes.js', 'src/middlewares/authenticate.js',
  'src/middlewares/authorize.js', 'src/middlewares/rate-limit.js', 'src/middlewares/validate.js',
  'src/middlewares/error-handler.js', 'src/validators/auth.schema.js', 'src/validators/centre.schema.js',
  'src/validators/appointment.schema.js', 'src/validators/queue.schema.js', 'src/validators/transaction.schema.js',
  'src/validators/analytics.schema.js', 'src/validators/prediction.schema.js', 'src/utils/async-handler.js', 'src/utils/logger.js',
  'src/sockets/queue.socket.js', 'src/sockets/notification.socket.js', 'src/jobs/notification-retry.job.js',
  'src/providers/otp.provider.js', 'src/providers/sms.provider.js',
  'src/jobs/operational-metrics.job.js', 'src/jobs/prediction-monitor.job.js', 'src/frontend/css/tokens.css',
  'src/frontend/css/main.css', 'src/frontend/js/main.js', 'src/frontend/js/api-client.js', 'src/frontend/js/i18n.js',
  'src/frontend/components/navigation.js', 'src/frontend/components/status-badge.js', 'src/frontend/components/data-state.js',
  'src/frontend/pages/auth.page.js', 'src/frontend/pages/farmer-dashboard.page.js', 'src/frontend/pages/officer-dashboard.page.js',
  'src/frontend/pages/admin-dashboard.page.js', 'src/frontend/pages/centres.page.js', 'src/frontend/pages/appointments.page.js',
  'src/frontend/pages/queue.page.js', 'src/frontend/pages/analytics.page.js', 'src/frontend/pages/intelligence.page.js',
  'src/frontend/locales/en.js', 'src/frontend/locales/hi.js', 'ai/app.py', 'ai/config/settings.py', 'ai/api/schemas.py',
  'ai/api/routes.py', 'ai/preprocessing/pipeline.py', 'ai/training/generate_synthetic.py', 'ai/training/train_demand.py',
  'ai/training/train_waiting_time.py', 'ai/evaluation/metrics.py', 'ai/evaluation/evaluate.py', 'ai/prediction/demand.py',
  'ai/prediction/waiting_time.py', 'ai/recommendations/capacity.py', 'ai/tests/test_foundation.py',
  'scripts/migrate.js', 'scripts/seed.js', 'tests/unit/foundation.test.js', 'tests/integration/database.test.js',
  'tests/concurrency/booking.test.js', 'tests/security/authorisation.test.js'
];

const missing = requiredPaths.filter((relativePath) => !fs.existsSync(path.join(root, relativePath)));
if (missing.length) {
  console.error(`Missing required paths:\n${missing.map((item) => `- ${item}`).join('\n')}`);
  process.exitCode = 1;
  return;
}

const packageJson = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8'));
const requiredScripts = ['start', 'dev', 'validate', 'test', 'db:migrate', 'db:seed', 'ai:dev', 'ai:test'];
const missingScripts = requiredScripts.filter((name) => !packageJson.scripts?.[name]);
if (missingScripts.length) throw new Error(`Missing package scripts: ${missingScripts.join(', ')}`);

const gitignore = fs.readFileSync(path.join(root, '.gitignore'), 'utf8').split(/\r?\n/);
if (!gitignore.includes('.env')) throw new Error('.env must be ignored');

const envText = fs.readFileSync(path.join(root, '.env.example'), 'utf8');
const sensitive = ['DB_PASSWORD', 'AUTH_ACCESS_TOKEN_SECRET', 'AUTH_REFRESH_TOKEN_SECRET', 'OTP_PROVIDER_API_KEY', 'SMS_PROVIDER_API_KEY', 'AI_SERVICE_API_KEY'];
for (const key of sensitive) {
  const value = envText.match(new RegExp(`^${key}=(.*)$`, 'm'))?.[1] || '';
  if (value.trim()) throw new Error(`${key} must remain unset in the committed environment template`);
}

console.info(`Structure validation passed: ${requiredPaths.length} required files found, configuration parsed, committed secret placeholders unset.`);

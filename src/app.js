'use strict';

const path = require('node:path');
const http = require('node:http');
const express = require('express');
const helmet = require('helmet');
const cors = require('cors');
const { environment } = require('./config/environment');
const { getDatabaseHealth } = require('./config/database');
const { asyncHandler } = require('./utils/async-handler');
const apiRoutes = require('./routes');
const { notFoundHandler, errorHandler } = require('./middlewares/error-handler');

function createApp() {
  const app = express();

  app.disable('x-powered-by');
  if (environment.trustProxy) app.set('trust proxy', environment.trustProxy);
  app.use(helmet({ contentSecurityPolicy: false }));
  app.use(cors({ origin: environment.appBaseUrl, credentials: true }));
  app.use(express.json({ limit: '100kb' }));
  app.use(express.urlencoded({ extended: false, limit: '100kb' }));
  app.use('/frontend', express.static(path.join(__dirname, 'frontend')));
  app.use('/vendor/chart.js', express.static(path.resolve(__dirname, '../node_modules/chart.js/dist')));

  app.get('/api/v1/health', asyncHandler(async (_request, response) => {
    const database = await getDatabaseHealth();
    response.json({
      success: true,
      message: 'AgriProcure foundation is healthy',
      data: {
        application: 'agriprocure',
        developmentStep: 14,
        status: database.status === 'healthy' ? 'healthy' : 'degraded',
        database,
        timestamp: new Date().toISOString()
      }
    });
  }));

  app.get('/api/v1/health/database', asyncHandler(async (_request, response) => {
    const database = await getDatabaseHealth();
    const status = database.status === 'healthy' ? 200 : 503;
    response.status(status).json({ success: status === 200, data: database });
  }));

  app.use('/api/v1', apiRoutes);

  app.get('/', (_request, response) => response.sendFile(path.join(__dirname, 'index.html')));
  app.use('/api', notFoundHandler);
  app.use(errorHandler);
  return app;
}

function startServer() {
  const app = createApp();
  const server = http.createServer(app);
  require('./config/socket').initialiseSocket(server);
  server.listen(environment.port, () => {
    console.info(`AgriProcure listening on http://localhost:${environment.port}`);
  });
  return server;
}

if (require.main === module) startServer();

module.exports = { createApp, startServer };

# AgriProcure

AgriProcure is a production-minded agricultural procurement and operational intelligence platform for farmers, procurement officers, and administrators. Its completed 14-step implementation journal is in [Plan.md](Plan.md).

> AgriProcure is not an official government service. Payment execution is not performed; the platform records only authorised, evidence-backed payment status.

## Architecture

- Responsive HTML/CSS/vanilla JavaScript client
- Node.js, Express, and Socket.IO application API
- MySQL as the sole persistent application database
- Separate Python/FastAPI service for trained scikit-learn models
- Provider adapters for OTP and SMS delivery

See [docs/architecture.md](docs/architecture.md) for the component boundaries and deployment model.

## Prerequisites

- Node.js 20+ and npm 10+
- Python 3.11+
- MySQL 8+ (required beginning in Step 2)

## Local setup

```powershell
npm install
python -m venv .venv
.\.venv\Scripts\python.exe -m pip install -r requirements.txt
Copy-Item .env.example .env
npm run validate
npm test
npm run db:migrate
npm run db:seed
npm start
```

In a second terminal:

```powershell
.\.venv\Scripts\python.exe -m ai.training.generate_synthetic --seed 42
.\.venv\Scripts\python.exe -m ai.evaluation.evaluate
npm run ai:dev
```

Set matching `AI_SERVICE_API_KEY` values for the Node and FastAPI processes, then open `http://localhost:3000`. Configure real MySQL, OTP, and SMS credentials in the ignored `.env`; disabled providers fail closed.

## Implemented workflow

Mobile registration and OTP verification → centre/schedule discovery → capacity-safe booking and token → live queue/check-in → inspection → purchase record → verified payment status.

The same application provides durable in-app/SMS notifications, filtered analytics, CSV/PDF reporting, versioned demand forecasts, waiting-time predictions/fallbacks, and administrator-reviewed capacity recommendations. The canonical entry points are `src/index.html`, `src/app.js`, and `ai/app.py`. Root `server.js` and `public/` are retained only as the original prototype reference and are not used by `npm start`.

## Configuration

Required for operational use: `DB_*`, 32+ character access/refresh secrets, genuine OTP provider settings, and an internal AI service key. SMS is optional but never simulated. `NOTIFICATION_WEBHOOK_SECRET` authenticates delivery receipts. See `.env.example` for every variable.

MySQL migrations are checksum-protected and applied in order. Generated datasets and model artifacts are intentionally ignored by Git and must be trained or provisioned per environment.

## Validation

```powershell
npm run validate
npm test
.\.venv\Scripts\python.exe -m pytest ai/tests
```

Live database integration and concurrency checks are opt-in with `RUN_MYSQL_TESTS=1` and require an isolated authorised database. Never commit `.env`, generated datasets, model artifacts, logs, or credentials.

## Demonstration guide

1. Apply migrations and seed the labelled centre/crop reference data.
2. Provision an administrator through a controlled database/bootstrap process and use the administrator API to create officers and assignments.
3. Configure the OTP provider, register a farmer by mobile number, and publish a schedule.
4. Book the final available slot from concurrent clients to demonstrate guarded capacity.
5. Check in, call/start/inspect the token, record the purchase, and add payment evidence.
6. Show the private notification feed, operational chart and exports.
7. Start the trained FastAPI service, create a demand prediction, generate a capacity recommendation, and review it as an administrator.

Deployment, trust boundaries, data design, endpoints, ML limitations, and test status are documented under `docs/`.

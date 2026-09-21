# REST and Socket API

Base path: `/api/v1`. JSON responses use `{ success, message?, data? }`; failures use `{ success: false, error: { code, message, details? } }`.

## Authentication — Step 3

Authentication is mobile-only. No email credential or email verification endpoint exists.

| Method | Endpoint | Access | Purpose |
|---|---|---|---|
| POST | `/auth/register/request-otp` | Public, OTP-limited | Validate a farmer registration and submit a mobile OTP to a configured genuine provider |
| POST | `/auth/register/verify-otp` | Public, auth-limited | Consume an unexpired OTP challenge, activate the account, and issue a session |
| POST | `/auth/login` | Public, auth-limited | Sign in with mobile number and password |
| POST | `/auth/refresh` | Public, auth-limited | Rotate an opaque refresh token and issue a new access token |
| POST | `/auth/logout` | Session token | Revoke the refresh session idempotently |
| GET | `/auth/me` | Authenticated | Read the current profile |
| PATCH | `/auth/me` | Farmer | Update permitted farmer fields |
| POST | `/auth/admin/officers` | Administrator | Provision an officer and assigned centres |

Access JWTs use HS256 with issuer `agriprocure-api`, audience `agriprocure-web`, short expiry, role and session claims. Refresh tokens are opaque random values stored only as keyed SHA-256 hashes and rotated on use.

OTP provider submission returns `submitted`, never `delivered`. Delivery receipts are stored only when supported by the provider. When no provider or token secrets are configured, authentication fails with HTTP 503 rather than simulating success.

## Operational endpoints

| Area | Endpoints | Access |
|---|---|---|
| Discovery | `GET /centres`, `/centres/:id`, `/crops`, `/schedules` | Public |
| Scheduling | `POST /centres`, `/crops`, `/schedules`; `PATCH /centres/:id/status`, `/schedules/:id`; schedule history | Officer assignment/admin as applicable |
| Appointments | create, personal history, token, cancel, reschedule under `/appointments` | Farmer owner |
| Queue | check-in, personal queue, centre queue, next token, token transition, control, interruption under `/queue` | Farmer owner or assigned officer/admin |
| Transactions | inspection, purchase, payment, correction, personal/centre history under `/transactions` | Farmer read or assigned officer/admin write |
| Notifications | history/read/preferences and authenticated provider receipts | Authenticated owner/provider |
| Analytics | `GET /analytics`, `/analytics/export.csv`, `/analytics/export.pdf` | Assigned officer/admin |
| Predictions | demand, token waiting time, history under `/predictions` | Farmer token owner or assigned officer/admin |
| Recommendations | list/generate/review under `/recommendations` | Assigned officer/admin; review is admin-only |

All mutation bodies are schema validated. Farmer resources are ownership-filtered in SQL; officer resources are centre-assignment-filtered. Business conflicts use HTTP 409 and external/unconfigured dependencies use HTTP 503/502.

## Socket.IO

Clients authenticate with the same access JWT in `handshake.auth.token`. Every connection receives only its `user:{id}` room. `queue:subscribe` accepts `{ centreId, date }`; the server verifies farmer token ownership or officer assignment before joining `queue:{centreId}:{date}`. Committed changes emit `queue:update`; private durable notifications emit `notification:new`.

## Private ML API

FastAPI exposes `POST /v1/predict/demand` and `/v1/predict/waiting-time`, protected by `x-internal-api-key`. It is intended only for the Node service. Outputs include method, value/range, model version where applicable, generation time, and synthetic-model provenance.

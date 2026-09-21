# System Architecture

## Status

The 14-step application is implemented. External MySQL, OTP, SMS, and hosting integrations remain environment-configured trust boundaries.

## Runtime components

```text
Farmer / Officer / Administrator browser
                 |
        HTTPS REST + Socket.IO
                 |
        Node.js / Express API
          |              |
      MySQL 8       Internal HTTP
                         |
               Python / FastAPI ML service
```

The Node application is the only public application API. It owns authentication, authorisation, validation, business workflows, database transactions, notification orchestration, audit logging, and authorised Socket.IO rooms. The Python service is private and accepts authenticated internal prediction requests only.

## Code boundaries

- `controllers/`: HTTP adaptation only.
- `services/`: business rules and transaction orchestration.
- `repositories/`: parameterised MySQL access only.
- `validators/`: request and domain input schemas.
- `middlewares/`: authentication, authorisation, errors, and request controls.
- `sockets/`: authorised real-time subscriptions and event delivery.
- `jobs/`: retryable background work and metric aggregation.
- `frontend/`: modular browser UI, central localisation, and API client.
- `ai/`: reproducible preprocessing, training, evaluation, prediction, and recommendations.

Dependencies flow from controllers to services to repositories. Repositories never call controllers, and the ML service never writes operational state directly.

## Data and consistency

MySQL is the sole persistent application store. Booking capacity, queue claims, purchase recording, recommendation implementation, and audited corrections use database transactions and row-level locking or guarded conditional updates. Socket.IO events are emitted only after successful commits.

## Deployment

Deploy the Node API behind TLS with a trusted reverse proxy and run the FastAPI service on a private network address. Restrict MySQL to the application/service network. Use separate least-privilege database and provider credentials, persistent secret management, process supervision, central logs, and regular backups. Run migrations once during release under a database account with DDL permission; the application runtime account should not require DDL.

Scale Socket.IO with sticky sessions and a supported shared adapter before running multiple Node instances. Run notification retries, metric materialisation, and prediction reconciliation from a single scheduler/worker. Train artifacts in a controlled job, evaluate chronologically, approve the version, then deploy the immutable bundle to each FastAPI instance.

Model artifacts, generated datasets, logs, caches, and secrets are excluded from Git. Model metadata and prediction history are persisted in MySQL, with artifacts stored in a controlled deployment location.

## Security baseline

- Secrets come from environment variables and remain server-side.
- Public input is validated before services run.
- Authentication and role/ownership checks are enforced in the API.
- Officer access is centre-scoped.
- Internal ML calls use a separate credential and timeout.
- OTP and SMS providers are disabled until genuine credentials are configured.
- Identity and login are mobile-number based; email login and email verification are outside the product contract.
- Payment execution is out of scope; only authorised payment-status records are tracked.

## Availability and degradation

The procurement API remains usable when the ML service is unavailable. Prediction endpoints return a clearly labelled statistical fallback only where one is valid. Failed notification submissions remain failed or queued; submission is never presented as delivery.

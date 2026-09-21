# Database Architecture

## Source of truth

MySQL 8 is the sole persistent store. Ordered, immutable migration files under `database/migrations/` are the schema source of truth. The older root `database/schema.sql` file is retained as prototype reference only.

Run:

```powershell
npm run db:migrate
npm run db:seed
```

The migration runner uses a MySQL named lock, SHA-256 checksums, an application-owned `schema_migrations` table, and refuses to continue if an applied migration changes. Multiple statements are enabled only on the local migration/seed connection; the application pool disables them.

## Core model

Migration `001_core_schema.sql` implements users, farmers, centres, crops, centre assignments, schedules and revisions, appointments, queue tokens/events/control, interruptions, transactions, inspection history, amendments, verified payment-status records, and append-only audit records.

Migration `002_authentication.sql` adds OTP challenges, refresh sessions, and authentication events. Migration `003_notifications_analytics.sql` adds notification preferences/history/delivery attempts and operational metrics. Migration `004_ai_intelligence.sql` adds model versions, traceable predictions, observed values, and capacity recommendations.

## Consistency rules

- InnoDB foreign keys define ownership and prevent orphaned operational records.
- Money uses `DECIMAL`; quantities use `DECIMAL(12,3)`.
- UTC `DATETIME(3)` values preserve operational ordering.
- A generated unique active-booking key blocks duplicate active reservations for the same farmer and schedule.
- Schedule `booked_count` cannot exceed capacity.
- Booking services must lock the schedule with `SELECT ... FOR UPDATE` before checking and incrementing capacity.
- Rescheduling must lock both schedules in ascending ID order, reserve the new capacity, create the replacement, and only then cancel/release the old appointment in the same transaction.
- Queue service claims use row locks and an incrementing claim version so two officers cannot serve one token.
- Purchase recording uses a unique idempotency key.
- Completed payment records require a verification source, provider reference, and verification timestamp.
- Audit and history repositories expose inserts and reads only; amendments create new history records rather than mutating history.

## Connection management

`src/config/database.js` exposes a lazy `mysql2/promise` pool, an honest health check, a rollback-safe `withTransaction` helper, and controlled shutdown. Database credentials are read only from ignored environment configuration.

## Local validation status

The MySQL 8 Windows service was detected, but no application credential is configured. Passwordless root access was rejected as expected. Static schema, transaction-helper, migration-order, checksum, and parameterisation tests can run without credentials; live migration and rollback integration tests require `DB_USER` and `DB_PASSWORD` and must not be reported as executed until supplied.

## Backup and retention

Back up transactional and audit data together using a consistent MySQL snapshot. Test restore procedures before deployment. Retain audit logs, payment evidence, notification attempts, model metadata, and prediction history according to the organisation's legal policy. Delete expired authentication challenges/sessions with a scheduled retention job, never by weakening relational ownership constraints.

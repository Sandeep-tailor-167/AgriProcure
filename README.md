# AgriProcure

A farmer-first agricultural procurement management MVP built from the supplied Product Requirements Document. Farmers can discover centres, reserve capacity, receive a digital token, monitor a live queue, and follow procurement status. Officers operate centre queues and inspections; administrators monitor the pilot network and audit trail.

> This repository ships with synthetic demo data. It is not an official government service and does not process payments.

## Run locally

Requires Node.js 20 or newer.

```bash
npm install
npm start
```

Open [http://localhost:3000](http://localhost:3000).

### Demo accounts

All accounts use password `demo123`.

| Role | Mobile |
|---|---|
| Farmer | `9876543210` |
| Procurement officer | `9876500001` |
| Administrator | `9876500002` |

Use the profile menu to switch among the three demo experiences.

## Verify

```bash
npm test
```

Tests cover public discovery, authentication, private-data protection, successful booking and token generation, duplicate-booking rejection, role permissions, officer check-in, and queue state validation.

## Architecture

```text
Browser UI (HTML/CSS/JS)
       │ REST + Socket.IO
Node.js / Express server
       │
Demo: in-memory seed data
Production contract: MySQL 8 schema
```

- `public/` — responsive farmer, officer, and administrator interfaces
- `server.js` — REST API, role/ownership checks, booking logic, audit events, and live queue events
- `database/schema.sql` — normalized MySQL schema, constraints, indexes, and booking transaction guidance
- `tests/api.test.js` — reproducible API acceptance tests

The demo keeps data in memory so it starts without infrastructure; restarting restores seed data. For production, replace the repository with `mysql2/promise`, use database transactions with `SELECT ... FOR UPDATE` for final-slot booking, use durable sessions, and configure real OTP/SMS services.

## Implemented PRD coverage

- Farmer login, centre discovery, crop/district filters
- Capacity-aware booking and unique booking/token references
- Booking history, digital token, checklist, and cancellation API
- Live queue with last-update time and range-based estimates
- Officer dashboard with check-in, serve, and inspection actions
- Inspection and purchase API with state validation
- Administrator network metrics and audit activity
- Role and ownership enforcement on protected resources
- Hindi/English toggle for the primary farmer experience
- Responsive, status-labelled, keyboard-friendly controls
- MySQL schema and automated acceptance tests

Production MySQL wiring, real OTP/SMS delivery, durable Socket.IO scaling, authorised payment-status feeds, jurisdiction-specific rules, monitoring, backups, and a formal WCAG audit remain deployment work requiring configured services and operational approval.

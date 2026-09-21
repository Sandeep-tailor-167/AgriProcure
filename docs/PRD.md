# Product Requirements

AgriProcure addresses long centre waiting times, unreliable access to crop-specific procurement schedules, and limited farmer visibility into procurement and verified payment status.

The authoritative product requirements are the supplied AgriProcure PRD and master build brief. Implementation is sequenced in the append-only `Plan.md` journal.

## Delivery priorities

- P0: permissioned procurement workflow from discovery to verified payment tracking.
- P1: genuine notifications, operational analytics, and exports.
- P2: trained demand and waiting-time models plus explainable capacity recommendations.

No component may claim official-government status, successful external delivery, completed payment, or ML accuracy without authorised evidence.

## Authentication scope decision

Authentication is mobile-first. Farmers register and sign in with a verified mobile number; officers and administrators use authorised mobile-linked accounts. Mobile OTP must use a genuine configured provider before production.

Email login and email verification are explicitly excluded. Authentication forms, validation schemas, API routes, and account records must not require or offer an email credential or email verification flow.

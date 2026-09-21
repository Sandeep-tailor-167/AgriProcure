# Testing Strategy

The final suite covers structure, API contracts, authentication and provider failure semantics, RBAC, booking locking, queue claiming, state machines, decimal calculations, analytics, prediction fallbacks, capacity rules, Python preprocessing/training/artifact loading, and FastAPI authentication/prediction output.

Tests must report executed results. Synthetic-data model metrics will be labelled and never presented as evidence of real-world performance.

Run `npm test`, `npm run validate`, and `.\.venv\Scripts\python.exe -m pytest ai/tests`. Browser ES modules are syntax-checked with Node VM modules. Enable the live isolated MySQL checks only with `RUN_MYSQL_TESTS=1` and valid test credentials; never target a production database.

The final credential-enabled local run discovered 44 Node tests and all 44 passed, including live MySQL health and a real two-farmer final-slot concurrency test with isolated fixtures and cleanup. Seven Python tests passed. External OTP/SMS provider delivery was not executed because authorised provider credentials were unavailable.

# Sallim: Spark + Vercel security rollout (NOT DEPLOYED)

This branch contains a **read-only backup utility**, not a finished authentication system.
Never merge a deny-all rule into production before the protected API and frontend are ready.

## Current threat
The deployed Firestore rule allows any client to read/write any document until 2027-12-31.
The existing website downloads plaintext team passwords and the administrator PIN;
checking passwords in the browser cannot secure Firestore.

## First: backup and recovery
1. Create a separate Google Cloud service account with Firestore read access.
2. Download its JSON key locally. Do NOT commit, paste or expose it to the browser.
3. Locally: `npm install`.
4. Set `GOOGLE_APPLICATION_CREDENTIALS` to the local credential file, and `FIREBASE_PROJECT_ID=salim-schedule`.
5. Run `npm run backup:firestore`. This creates a private `backups/*.json` file.
6. Verify document counts, randomly sample data, and implement and test a corresponding typed restore against a **separate Firebase project** before touching production.

This export serializes Firestore timestamps, references, geopoints and bytes with explicit type markers. It does not export Security Rules, indexes, Firebase Auth users or server secrets, and has not yet been tested against live data. Firestore writes may occur while the export is running; for a consistent final migration, pause writes or perform a final sync.

## Target architecture
- Retain the existing team PIN UI, but validate PINs using a server-only Vercel Function.
- Enable Firebase Authentication anonymous sign-in for browser identity. It is not a user-visible login screen.
- Keep hashes (salted and slow KDF) and administrator credentials server-only; no plaintext PIN in client-readable documents.
- Protect every private document via per-team authorization grants based on Firebase UID. Do not equate an anonymous Firebase UID with membership before server-side PIN validation.
- Use Firestore Security Rules for client read authorization; keep sensitive writes and reservation transactions behind authenticated Vercel endpoints. Server endpoints must independently verify an ID token, membership and operation permissions.
- Protect admin operations with a distinct strong credential and rate limiting.
- Use separate public team directory data and public aggregate booking data.
- Review XSS sinks (`innerHTML`) using untrusted team names and other entered fields.
- Test concurrent schedule writes. Whole-document `set()` from stale client state may lose data.
- Set Firebase App Check, CORS/Origin checking (as defense in depth, not authentication), request limits and logging.

## Safe deployment ordering
1. Verify backups and restore in a separate project.
2. Prepare and test the backend and migration with non-production Firebase, including failed-password behavior and permissions.
3. Remove plaintext PINs from all client-readable documents and rotate the legacy PINs.
4. Migrate the web app to the new protected API. Ensure no direct unrestricted writes remain.
5. In a coordinated maintenance window switch deployed frontend and Firestore Rules.
6. Verify denied unauthenticated reads/writes, team isolation, admin isolation, normal scheduling, 10-person teams, mobile mode, booking conflicts, and rollback plan.

## Billing
Firebase Spark can stay in place when Vercel Functions invoke Firestore via the Firebase Admin SDK,
subject to applicable quotas and Vercel plan restrictions. Google's managed Firestore export/import
requires billing; this script is not Google's managed export.

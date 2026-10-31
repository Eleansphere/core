---
'@eleansphere/be-core': major
'@eleansphere/entity-core': major
---

Security hardening.

- **Breaking:** `GET /api/files` answers only signed-in users and needs both `refType` and `refId` (at most 100 files); listing every file at once handed out what all users uploaded.
- **Breaking:** a `FileDto` no longer carries `storageKey` (be-core and entity-core): a bucket with a public address serves any key, private files included.
- **Breaking:** e-mail addresses are stored trimmed and in lower case on registration and found whatever their case on login, registration and password reset (accounts stored in mixed case keep working). Normalize stored addresses with a migration when you can.
- **Breaking:** a new password longer than 72 bytes (what bcrypt reads) is a `maxLength` issue; new hashes use cost 12 (`auth.passwordHashRounds`).
- **Breaking:** errors from the database answer with the status's name as `message` instead of Sequelize's text (which named tables and columns); `issues` are unchanged.
- The auth rate limiter counts a route however its path is spelled (`/API/auth/LOGIN/` used to get a budget of its own), and failed logins and reset e-mails are also limited per account from any client (`auth.accountRateLimit`, default 10 per 15 minutes). `createRateLimiter` takes `skipSuccessfulRequests`; `routeKey(req)` is exported.
- Access tokens carry `typ: 'access'`; a password-reset or verification token is never accepted as one.
- An unknown e-mail takes as long to refuse at login as a wrong password.
- Password-reset e-mails go to the stored address, and the template also gets `user`.
- `auth.emailVerification` e-mails new accounts a link to confirm their address (`POST /api/auth/verify-email`, `POST /api/auth/verification-email`); entity-core's `AuthService` gets `verifyEmail(token)` and `sendVerificationEmail()`.
- `storage.privateRoles`: roles whose files are always stored `private`.
- Every answer carries security headers (`Content-Security-Policy`, `X-Frame-Options`, `nosniff`, HSTS, `Referrer-Policy`) and no `X-Powered-By`; `securityHeaders: false` turns them off.
- Dependencies: Express 4.22, multer 2.5, nodemailer 10, Sequelize 6.37.8; `body-parser` is no longer a direct dependency.

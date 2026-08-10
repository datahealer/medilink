# scripts/ — repo automation (db type-gen, migration helpers). Populated as needed.

| Script | What it does |
|---|---|
| `smtp-check.mjs` | Verifies the Microsoft 365 SMTP mailbox used for transactional email. `node scripts/smtp-check.mjs` connects and authenticates only; pass a recipient address to also send one test message. Reads `backend/.env.local`; never prints the password. |

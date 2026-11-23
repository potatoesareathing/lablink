# Security

## Design

- Secrets (`GEMINI_API_KEY`, `SESSION_SECRET`) come only from the environment and are never sent to the browser.
- Sessions are HMAC-SHA256 signed cookies (`HttpOnly`, `SameSite=Strict`, `Secure` in production), verified in constant time.
- Every request body, query and path parameter is validated with zod; JSON bodies are capped at 20 KB.
- Role checks run on the server for every faculty-only route; students can only read and pay for their own records.
- `helmet` sets a strict Content-Security-Policy (`default-src 'self'`, no inline scripts, `frame-ancestors 'none'`), HSTS and related headers.
- API and AI endpoints are rate limited; the error handler never returns stack traces or internal messages.
- Model output is schema-validated, ids are checked against real data, and text is rendered as plain text. User input is passed to the model as delimited data to resist prompt injection.
- The container runs as the unprivileged `node` user; `npm audit --omit=dev` reports no known vulnerabilities.

## Reporting a vulnerability

Please open a private security advisory on the GitHub repository rather than a public issue.

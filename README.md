# LabLink â€” GenAI-powered campus lab resource sharing

> **PromptWars x Cynergy Coding Club Â· PS1 â€” "LabLink: Making College Laboratories More Accessible"**

LabLink helps students **discover** specialised equipment, development kits and workstations across every
department, **book** time without collisions, **request project-based access**, and get **fair allocations**
when demand spikes before deadlines. Faculty approve with AI summaries and deterministic risk flags, and a
utilisation dashboard steers demand toward idle equipment.

**Live demo:** _Cloud Run URL added after deployment_ Â· Sign in with any demo persona (no password needed).

---

## Problem â†’ feature mapping

| Problem statement requirement                                                                              | How LabLink delivers it                                                                                                            |
| ---------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------- |
| Discover specialised equipment, dev kits, workstations **across departments**                              | Campus-wide catalogue (30 units, 7 labs, 5 departments) with department/category/availability filters                              |
| **GenAI-powered**                                                                                          | Gemini powers natural-language discovery, request drafting, faculty summaries and allocation explanations                          |
| **Equipment discovery**                                                                                    | "I need to measure signal noise on my IoT sensor" â†’ ranked matches with a one-line reason each                                     |
| **Intelligent slot booking**                                                                               | Conflict-free hourly booking; on conflict it suggests the next free windows **and** identical units in other labs at the same time |
| **Project-based access requests**                                                                          | Students submit project, deadline, hours and equipment; AI drafts the request from a rough idea                                    |
| **Faculty approvals**                                                                                      | Urgency-sorted queue, AI summary + deterministic risk flags, approve (auto-schedules) or reject with a reason                      |
| **Optimising resource utilisation**                                                                        | Utilisation dashboard (per unit and department) + rebalancing suggestions toward idle equivalents                                  |
| **Resolve scheduling conflicts fairly and feasibly** based on **deadlines, availability and requirements** | Deterministic fair-allocation engine (below) + plain-language explanations                                                         |

## The fair allocation engine

The language model **never** makes scheduling decisions. LLMs are unreliable at hard constraints, so allocation
is deterministic, unit-tested code in [`server/src/services/allocation.ts`](server/src/services/allocation.ts):

```
priority    = 0.5 * urgency + 0.3 * fairness + 0.2 * feasibility
urgency     = 1 / (1 + daysUntilDeadline)
fairness    = 1 - min(1, hoursThisWeek / 10) + 0.1 * recentDenials      (clamped to 0..1)
feasibility = min(1, freeHoursBeforeDeadline / hoursNeeded)
```

1. Score every competing request; sort by priority (ties: earliest submission).
2. Greedily assign the earliest free hours **before the deadline** on the requested unit, then on
   **equivalent units in other labs**.
3. Outcome is `allocated`, `partial` or `waitlisted`, with machine-readable reason codes.
4. Guarantees (covered by tests): no unit is double-booked, no student is booked in two places at once,
   nothing is scheduled after a deadline, and identical input gives an identical plan.
5. Gemini turns the reason codes into friendly explanations; template sentences are used if AI is unavailable.

Previews never commit. **Apply** recomputes against current bookings, so a stale preview can't create overlaps.

## Architecture

```
React + Vite SPA  â”€â”€HTTPS/JSONâ”€â”€â–¶  Express API (TypeScript)  â”€â”€â–¶  Gemini API (server-side only)
                                    â”œâ”€ routes/      zod validation, roles, rate limits
                                    â”œâ”€ services/    allocation, availability, booking, requests, stats
                                    â”œâ”€ ai/          Gemini client, prompts, TTL cache, fallbacks
                                    â””â”€ data/        seeded in-memory store (id-indexed maps)
             one container on Google Cloud Run (API + static client)
```

| Layer      | Choice                                          | Why                                                                           |
| ---------- | ----------------------------------------------- | ----------------------------------------------------------------------------- |
| Language   | TypeScript (strict) everywhere                  | Shared domain types in `shared/`, fewer runtime bugs                          |
| Frontend   | React 19 + Vite                                 | Fast, small bundle; lazy-loaded views (~75 KB gzipped initial JS)             |
| Styling    | Plain CSS with tokens                           | Zero dependencies; full control of contrast, focus and dark mode              |
| Backend    | Express 5                                       | Minimal and readable; serves API and static client from one Cloud Run service |
| Validation | zod                                             | One schema per input; rejects bad data at the edge with field-level errors    |
| AI         | Gemini (`@google/genai`, newest Flash model auto-selected) | Fast, low cost, structured JSON output validated by zod                       |
| Data       | Seeded in-memory store                          | No database to provision; deterministic demo; swap-in point for Firestore     |
| Hosting    | Google Cloud Run                                | HTTPS URL, scales to zero, secrets via env / Secret Manager                   |

Runtime dependencies are intentionally few: `express`, `helmet`, `express-rate-limit`, `compression`, `zod`, `@google/genai`.

## GenAI usage and safeguards

| Feature                    | Model output (validated)                                                    | Fallback without AI               |
| -------------------------- | --------------------------------------------------------------------------- | --------------------------------- |
| Natural-language discovery | `{ matches: [{ equipmentId, reason }] }`, ids checked against the catalogue | Weighted keyword search           |
| Request drafting           | `{ projectTitle, description, equipmentId, hoursNeeded, rationale }`        | Keyword match + editable template |
| Faculty summary            | `{ summary }` (risks are always computed deterministically)                 | Template summary                  |
| Allocation explanation     | `{ summary, explanations[] }` for the already-decided plan                  | Reason-code templates             |

- Structured output (`responseJsonSchema`) + zod validation on every response; unknown ids are dropped.
- User text is wrapped in `<user_input>` tags, angle brackets are stripped, and the system prompt tells the model to treat it as data (prompt-injection hygiene).
- 10 s timeout, TTL/LRU response cache, rate limit of 20 AI calls/min per IP.
- The app is fully functional with no API key.

## Security

- Gemini key lives only on the server (`GEMINI_API_KEY` env var); `.env` is git-ignored; `.env.example` documents settings.
- Sessions: HMAC-SHA256 signed, `HttpOnly`, `SameSite=Strict`, `Secure` in production; constant-time signature check.
- Role-based access: faculty-only routes for approvals, conflict resolution and utilisation; students see only their own requests.
- `helmet` with a strict Content-Security-Policy (`default-src 'self'`, no inline scripts, `frame-ancestors 'none'`).
- zod validation on every body, query and path parameter; 20 KB body limit; API and AI rate limiting.
- Central error handler never leaks stack traces; the container runs as the non-root `node` user.

## Accessibility

- Semantic landmarks, skip link, logical heading order, and focus moved to the page heading on navigation.
- Every control is labelled and keyboard operable, with visible `:focus-visible` outlines and 44 px touch targets.
- WCAG AA contrast in light **and** dark themes; status is shown with text + icon, never colour alone.
- `aria-live` regions announce AI results, booking outcomes and errors; `prefers-reduced-motion` respected.
- Automated axe-core WCAG 2.1 AA checks run in the test suite.

## Testing

```bash
npm test            # 56 tests: allocation engine, availability, booking, API, AI fallbacks, UI + axe
npm run test:coverage
npm run lint && npm run typecheck
```

| Suite                            | Covers                                                                                                             |
| -------------------------------- | ------------------------------------------------------------------------------------------------------------------ |
| `server/test/allocation.test.ts` | Scoring, urgency ordering, fairness, equivalent-lab overflow, deadlines, partial/waitlist, determinism             |
| `server/test/booking.test.ts`    | Time helpers, overlap detection, alternatives, maintenance/past/double-booking guards, seed integrity, utilisation |
| `server/test/api.test.ts`        | Security headers, forged cookies, roles, validation, payload limits, full approval and conflict-resolution flows   |
| `server/test/assistant.test.ts`  | AI fallbacks, malformed output, hallucinated ids, prompt-injection wrapping, caching                               |
| `client/test/ui.test.tsx`        | Sign-in, discovery search, plan rendering, error states, axe accessibility checks                                  |

## Run locally

```bash
npm install
cp .env.example .env        # optionally add GEMINI_API_KEY
npm run build
node --env-file=.env dist/server/server/src/index.js     # http://localhost:8080
```

For development with hot reload, run `npm run dev:server` and `npm run dev:client` (Vite proxies `/api`).

## Deploy

The app is a single Docker container listening on `$PORT`, so it runs on any container host.

### Render (free, used for the live demo)

`render.yaml` is a Render Blueprint: **New â†’ Blueprint â†’ select this repo**, then paste `GEMINI_API_KEY`
when prompted. `SESSION_SECRET` is generated automatically.

### Google Cloud Run

```bash
gcloud run deploy lablink --source . --region asia-south1 --allow-unauthenticated \
  --set-env-vars GEMINI_API_KEY=YOUR_KEY,SESSION_SECRET=$(openssl rand -hex 32) \
  --min-instances 0 --max-instances 1
```

The multi-stage `Dockerfile` builds the client and server, then ships only production dependencies and compiled output.

## Demo script (2 minutes)

1. **Student (Aarav):** search "I need to measure signal noise on my IoT sensor" â†’ AI-ranked equipment across departments.
2. Open a unit, click a **Booked** slot â†’ instant alternatives: next free windows and identical units in other labs.
3. **Project requests:** describe an idea â†’ "Draft request for me" â†’ submit.
4. **Faculty (Dr. Rao):** Approvals â†’ AI summary + risk flags â†’ approve and schedule.
5. **Resolve conflicts:** 3D printers (30 h demanded, about 29 h free) â†’ fair plan with explanations â†’ apply.
6. **Utilisation:** campus usage and rebalancing suggestions.

## Project structure

```
shared/            domain types and constants used by client and server
server/src/        app.ts, config, routes/, services/, ai/, data/, middleware/, lib/
server/test/       Vitest + Supertest suites
client/src/        React app: components/, api.ts, format.ts, styles.css
client/test/       React Testing Library + axe-core
Dockerfile         multi-stage build for Cloud Run
```

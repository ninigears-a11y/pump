# Pump Username Checker

Find your next identity on Pump.fun. Check one username, check hundreds in bulk, generate ideas, and get smart variations when a name is taken.

The checker is built around one rule: **it never reports a name as available unless the evidence supports it.** Blocked, rate-limited, ambiguous or failed checks come back as **UNKNOWN**.

## Features

- **Single checker**: one large input that accepts `mrnom`, `@mrnom` or a full `https://pump.fun/profile/mrnom` URL. The result shows its confidence, when it was verified, and the evidence behind it.
- **Bulk checker**: one name per line, de-duplicated automatically. You can set concurrency and the delay between requests, and pause, resume or stop a run. Results update live with a progress bar. You can filter by Available, Taken or Unknown, export to CSV, and copy all available names.
- **Username generator** with 8 categories: Mr + Word, The + Word, crypto personalities, mysterious, developer, whale, community/goodwill, and short one-word names. It produces 10, 50, 100, 500 or 1,000 ideas, takes an optional keyword, and can skip names you already checked. Ideas go straight to the bulk checker with one click.
- **Smart suggestions**: when a name is taken you get variations (`realmrdev`, `itsmrdev`, `themrdev`, `mrdevsol`, `mrdevx`, `mrdev_`, …). You can check one or all of them.
- **Results history**: search, sort (recent / A–Z / Z–A), filter by status or favorites, and use the per-row actions: copy username, open profile, recheck, copy URL, favorite. History is kept across page refreshes in `localStorage`.
- **Stats**: Total Checked, Available, Taken and Unknown.
- **Optional server-side history** in SQLite through Node's built-in `node:sqlite`, with no native dependencies.
- **Strict mode**: a name is only marked available when the public profile page also confirms it.

## How verification works

### Investigation: what Pump.fun exposes

Pump.fun does not publish an official, documented API for username lookups. What we found when building this (November 2026):

| Source | Behavior |
| --- | --- |
| **`GET https://api.pump.fun/v1/users/username-exists/{username}`** | **Official Developer API** ([docs.pump.fun](https://docs.pump.fun)). Returns `{ "exists_flag": boolean }`, documented as *"Whether the handle is already reserved"* (banned or unclaimed owners' handles also read `true`). Needs an approved API key: `Authorization: Bearer pf_live_…`. Without one it answers `401 API_KEY_REQUIRED`, which we verified live. Default limits are 2 req/s (120 burst) and 50,000/day. |
| `https://pump.fun/profile/{username}` | Public profile page (the canonical profile URL used everywhere in this app). It is a client-rendered Next.js app behind Cloudflare. |
| `GET https://frontend-api-v3.pump.fun/users/{usernameOrWallet}` | Public but undocumented JSON endpoint used by the Pump.fun web app. An existing user returns `200` with `{ address, username, profile_image, bio, followers, … }`. An unknown user returns `404` JSON, or `200` with an empty body. It resolves **wallet addresses as well as usernames**. |

The two unofficial hosts are behind **Cloudflare**. From datacenter and cloud IPs (including the sandbox this was built in) every request we made got a `403` *"Just a moment…"* challenge. This app **does not try to bypass** Cloudflare, CAPTCHAs or authentication. Those responses are classified as `blocked` and the result is **UNKNOWN**.

### The engine

`src/lib/checker/` is a modular, evidence-based engine:

```
UsernameChecker
 ├─ OfficialApiProvider   (authoritative)  GET api.pump.fun/v1/users/username-exists/{name}   (when PUMP_API_KEY is set)
 ├─ FrontendApiProvider   (fallback)       GET frontend-api-v3.pump.fun/users/{name}
 ├─ ProfilePageProvider   (corroborating)  GET pump.fun/profile/{name}
 ├─ OutboundThrottle      min interval between requests, 429 cooldown (Retry-After + exponential back-off)
 ├─ ResultCache           TTL cache (taken 10 min, available 2 min, unknown never cached)
 └─ decideVerdict()       combines evidence → available / taken / unknown
```

Each provider returns one `Evidence` record: `found`, `not_found`, `blocked`, `rate_limited`, `error` or `ambiguous`.

**Classification safeguards.** A plain `404` is *not* taken to mean "available":

- Cloudflare or WAF challenges (`cf-mitigated` header, challenge markup) are `blocked`, even when served with a status of `404` or `200`.
- An HTML or other non-JSON 404 is `ambiguous`, because the endpoint may have moved.
- A NestJS `"Cannot GET /users/…"` 404 means the *route* is missing, not the user, so it is `ambiguous`.
- A `200` whose `username` does not match the query is `ambiguous`, since the endpoint also resolves wallets.
- Redirects are never followed automatically (`redirect: "manual"`) and count as `ambiguous`. The one exception is a profile page that redirects to a wallet profile, which counts as `found`.
- Timeouts, network failures and `5xx` responses are `error`, and are retried once.

**Verdict rules** (`verdict.ts`, with exhaustive tests):

0. **Official API configured:** `exists_flag: false` gives **AVAILABLE** (high) and `exists_flag: true` gives **TAKEN** (high), from a single request. Any other answer (invalid, revoked or unapproved key, scope or region refusal, 429, 5xx, an unexpected shape) is inconclusive, and the engine falls back to the rules below. Set `PUMP_UNOFFICIAL_FALLBACK=0` to return UNKNOWN instead.
1. If any source positively identifies the profile, the result is **TAKEN**. If the sources disagree, the result is still TAKEN, because that is the safe answer.
2. **AVAILABLE** needs the API to return a clean `not_found` on **two separate requests**, and the profile page must not contradict that.
   - If the page also returns `not_found`, confidence is **high**.
   - If the page is inconclusive (for example, challenged), confidence is **medium**, and **strict mode** turns the result into UNKNOWN.
3. Everything else is **UNKNOWN**. A page `not_found` on its own is never enough.

### Limitations (please read)

- **Without `PUMP_API_KEY`** the app runs in *unofficial* mode. The site shows an orange notice, and on cloud hosts most results will be UNKNOWN.

- **Cloudflare decides whether checks work.** On many cloud hosts, Vercel included, Pump.fun may challenge every request, and then results will mostly be UNKNOWN. That is the honest result, not a bug. You will usually get better results running locally on a residential connection. The app never tries to evade the challenge.
- **The API is undocumented.** It can change without notice. The classifier fails safe (unexpected shapes become UNKNOWN), and the provider can be swapped (see *Extending*).
- **Pump.fun's username rules are not public.** We accept `a–z`, `0–9` and `_` up to 32 characters. Anything else is reported as UNKNOWN ("not checked") and never sent upstream. Pump.fun may apply stricter rules (length, reserved words, banned names) that no public endpoint exposes. An "available" name might still be rejected when you try to register it.
- **Time-of-check.** Someone else can claim a name right after you check it.
- **Profile page detection is heuristic.** The page renders on the client, so its evidence only corroborates the API result. It can't produce AVAILABLE on its own.
- **Lookups are case-insensitive.** Names are lowercased before checking and comparing.

## Getting started

Requirements: **Node.js 22.13+** (`node:sqlite` needs it for the optional history; everything else works on Node 20.18+).

```bash
npm install
npm run dev          # http://localhost:3000
```

### Try it without touching Pump.fun

A local mock reproduces the taken, available, Cloudflare and 429 behaviors:

```bash
npm run mock         # terminal 1: mock on :4010
npm run dev:mock     # terminal 2: app pointed at the mock
```

In the mock, `mrnom`, `mrdev`, `mrsol`, `mrking`, `mrwhale`, `mralpha`, `thewhale`, `theking` and `realmrdev` are taken. Names containing `block` get a Cloudflare challenge, and names containing `slow` get a 429. Every other name is available.

### Scripts

| Script | What it does |
| --- | --- |
| `npm run dev` | Next.js dev server |
| `npm run build` / `npm start` | Production build / serve |
| `npm test` | Unit and integration tests (Vitest, mocked responses) |
| `npm run test:live` | Opt-in smoke test against real Pump.fun (`LIVE_USERNAMES=a,b`) |
| `npm run typecheck` | TypeScript |
| `npm run mock` / `npm run dev:mock` | Local Pump.fun mock / dev server pointed at it |

## Configuration

Every variable is optional. See `.env.example`.

| Variable | Default | Purpose |
| --- | --- | --- |
| `PUMP_API_BASE` | `https://frontend-api-v3.pump.fun` | Base URL of the user lookup API |
| `PUMP_API_KEY` | *(unset)* | **Official Pump.fun API key** (`pf_live_…`). Server-side only. Never prefix it with `NEXT_PUBLIC_`. |
| `PUMP_OFFICIAL_API_BASE` | `https://api.pump.fun/v1` | Official API base (devnet: `https://api-devnet.pump.fun/v1`) |
| `PUMP_UNOFFICIAL_FALLBACK` | `1` | `0` returns UNKNOWN whenever the official API is inconclusive |
| `PUMP_PROFILE_BASE` | `https://pump.fun/profile` | Profile URL base (links and page corroboration) |
| `PUMP_MIN_REQUEST_INTERVAL_MS` | `400` | Minimum gap between outbound requests per provider, per server instance |
| `PUMP_REQUEST_TIMEOUT_MS` | `10000` | Per-request timeout |
| `PUMP_DISABLE_PAGE_CHECK` | `0` | Set to `1` to skip the profile page request |
| `CHECK_RATE_LIMIT_PER_MINUTE` | `120` | Per-IP limit on `/api/check` |
| `HISTORY_DB_PATH` | *(unset)* | Enables SQLite history at this path, e.g. `./data/history.db` |

The UI also has per-browser settings for concurrency (1–10), delay between requests, and strict mode.

## API

`POST /api/check` with `{ "username": "mrnom", "force": false, "strict": false }`. `GET /api/check?username=mrnom&force=1&strict=1` works too.

```json
{
  "username": "mrnom",
  "status": "taken",
  "confidence": "high",
  "reason": "Profile exists (wallet 7xKX…gAsU).",
  "profileUrl": "https://pump.fun/profile/mrnom",
  "checkedAt": "2026-11-17T06:44:55.023Z",
  "wallet": "7xKX…",
  "evidence": [{ "source": "pump-frontend-api", "outcome": "found", "httpStatus": 200, "detail": "…" }]
}
```

Other endpoints:

- `GET /api/history?limit=200&username=` returns the server-side history, or `{ enabled: false }` when no database is configured.
- `DELETE /api/history` clears it.
- `GET /api/health` is a health check. It reports `verification: "official" | "unofficial"` and never exposes the key.

Bulk checks are orchestrated **in the browser** (`src/lib/bulkQueue.ts`), one `/api/check` call per name. That keeps every serverless invocation short and makes pause/resume trivial. The server-side throttle and the per-IP limit stop the browser from overrunning Pump.fun. When a result reports rate limiting, the bulk queue backs off automatically.

## Project structure

```
src/
  app/
    page.tsx                 Dashboard
    api/check/route.ts       Check endpoint (rate limited, records history)
    api/history/route.ts     Optional SQLite history
    api/health/route.ts
  components/                UI (SingleChecker, BulkChecker, Generator, ResultsTable, Suggestions, StatsBar, ui)
  lib/
    checker/                 Verification engine (providers, verdict, throttle, cache, username rules)
    bulkQueue.ts             Concurrency / delay / pause / resume / stop / dedupe / back-off
    generator.ts             Username idea generator
    suggestions.ts           Variations for taken names
    csv.ts                   CSV export (with formula-injection protection)
    history.ts               node:sqlite history (optional, fails soft)
    client/                  Browser store (localStorage), API client, bulk context
tests/                       Vitest suites (mocked upstream) + opt-in live test
scripts/mock-pump.mjs        Local Pump.fun mock
```

## Extending: when Pump.fun changes

Implement `EvidenceProvider` and pass it to the engine:

```ts
import { UsernameChecker, type EvidenceProvider } from "@/lib/checker";

const myProvider: EvidenceProvider = {
  name: "pump-api-v4",
  async check(username, { fetch, timeoutMs, signal }) {
    // return { source, outcome: "found" | "not_found" | "blocked" | ..., detail }
  },
};

new UsernameChecker({ apiProvider: myProvider });
```

If only the host changes, set `PUMP_API_BASE`. The verdict rules stay the same, so a new provider can't weaken the "never falsely available" guarantee unless it returns `not_found` incorrectly. Cover it with classification tests like `tests/frontendApi.test.ts`.

## Testing

```bash
npm test
```

The suite has 100 tests, all against mocked HTTP responses. It covers:

- API and page classification: taken, JSON 404, empty 200, Cloudflare served as 403, 404 or 200, 401, 429 with Retry-After, 5xx, redirects, a missing route, a mismatched user, malformed JSON.
- An exhaustive verdict matrix proving AVAILABLE requires two clean API `not_found` results.
- Engine integration: confirmation races, retries, persistent 429, network errors, timeouts, caching, in-flight dedupe, swappable providers.
- The Next.js route handler end to end.
- The bulk queue: concurrency, pause and resume, stop and abort, delay, error handling.
- The throttle, IP limiter, generator, suggestions, CSV escaping and SQLite history.

## Getting an official API key

1. Go to <https://developers.pump.fun> and sign in with your Pump.fun account. This works on a phone.
2. Apply with a business name, a business email, your use case and the `profiles.read` scope. Verify the email with the 6-digit code.
3. Wait for approval. The Pump.fun team reviews every application, and there are no instant or test keys.
4. Create a key. It is shown **once**. Add it to Vercel as `PUMP_API_KEY` under Project → Settings → Environment Variables (Production). Do not mark it `NEXT_PUBLIC_`.
5. Redeploy: Deployments → ⋯ → Redeploy. The site's badge changes to "Verified with the official Pump.fun API".

## Deploying to Vercel

1. Push the repository to GitHub.
2. In Vercel, choose **Add New → Project** and import the repo. The framework is detected as Next.js and no settings are required.
3. Optionally add environment variables from the table above.
4. Deploy.

Notes:

- API routes run on the Node.js runtime (`runtime = "nodejs"`, `maxDuration = 30`).
- Vercel's filesystem is ephemeral. Leave `HISTORY_DB_PATH` unset (the default), or use `/tmp/history.db` for best-effort, per-instance history. The user-facing history always lives in the browser.
- The throttle and the IP limiter are per instance. For strict global limits across instances, put a shared store (for example Upstash Redis) behind `OutboundThrottle` and `IpRateLimiter`.
- See **Limitations**: Vercel's IPs may be challenged by Cloudflare, and results will then be UNKNOWN.

Self-hosting with `npm run build && npm start` (Node 22) works the same way and supports persistent SQLite history.

## Responsible use

Use reasonable delays and concurrency. The defaults are 3 concurrent checks with a 600 ms delay in the browser and a 400 ms minimum interval on the server. This project is not affiliated with Pump.fun.

## License

MIT

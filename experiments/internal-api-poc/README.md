# Experiment: Pump.fun internal profile lookup

**Status: NOT VIABLE so far. Not used by the app.** The app's free (assisted) mode is unchanged.

Endpoint: `GET https://frontend-api-v3.pump.fun/users/{username}`. It's undocumented and is what pump.fun's own frontend uses.

## Rules for this experiment
- Plain requests only: an `Accept` header, nothing else. No spoofed Origin, Referer or User-Agent, no cookies or tokens (`credentials: "omit"`).
- One request at a time, at least 2 s apart. Stops after 3 blocked or rate-limited responses in a row.
- Interpretation reuses the app's tested strict classifier:
  - `200` + matching user JSON → EXISTS
  - origin `404` with JSON or an empty body → NOT_FOUND
  - `403`, a Cloudflare challenge (including a challenge served as 404 or 200), `429`, a CORS block or anything else → UNKNOWN

## Results (2026-11-17)
| Where | Request | Response | Interpretation |
|---|---|---|---|
| Server, datacenter (cloud sandbox), `node poc.mjs nom` | GET /users/nom | `403`, `cf-mitigated: challenge`, `cf-ray …-IAD`, "Just a moment..." HTML, no `Access-Control-Allow-Origin` | UNKNOWN |
| Server, bulk `neo zen vex mrdev mrsol` | 3 requests, 2 s apart | all `403` challenge; the run **stopped itself** after 3 | UNKNOWN ×3 |
| Browser (Chromium, iPhone 13 emulation) on another site | `fetch(..., {credentials:"omit"})` | **blocked by CORS**: "No 'Access-Control-Allow-Origin' header is present" (`net::ERR_FAILED`) | UNKNOWN |
| Vercel server (user deployment, earlier) | GET /users/… | `403` Cloudflare (reported by the user) | UNKNOWN |
| Third party: nirholas/three.ws production runbook | GET /users/x | "hit pump.fun's Cloudflare bot challenge" → 503 | — |

Still untested: an **ordinary iPhone or desktop browser on a home or mobile connection**. Use the lab page `/lab/internal-api` on the deployed site:
- **From this browser:** your device calls Pump.fun directly. It only works if Pump.fun returns JSON **and** allows other websites to read it (CORS).
- **From our server:** Vercel calls Pump.fun. This was already 403 before.

## Running it
```bash
node experiments/internal-api-poc/poc.mjs nom neo zen
POC_INTERVAL_MS=3000 node experiments/internal-api-poc/poc.mjs --file names.txt   # max 50 names
```

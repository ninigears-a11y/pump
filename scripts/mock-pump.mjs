#!/usr/bin/env node
/**
 * Local mock of Pump.fun for development and demos (no real traffic).
 *
 *   node scripts/mock-pump.mjs            # listens on :4010
 *   PUMP_API_BASE=http://localhost:4010 PUMP_PROFILE_BASE=http://localhost:4010/u npm run dev
 *
 * Behaviour:
 *   - names in TAKEN            -> 200 user JSON
 *   - names containing "block"  -> Cloudflare-style 403 challenge
 *   - names containing "slow"   -> 429 rate limited
 *   - everything else           -> 404 JSON
 */
import { createServer } from "node:http";

const PORT = Number(process.env.MOCK_PORT || 4010);
const TAKEN = new Set(
  (process.env.MOCK_TAKEN || "mrnom,mrdev,mrsol,mrking,mrwhale,mralpha,thewhale,theking,realmrdev").split(","),
);

createServer((req, res) => {
  const url = new URL(req.url, `http://localhost:${PORT}`);
  const m = url.pathname.match(/^\/(users|u)\/([^/]+)$/);
  if (!m) {
    res.writeHead(404, { "content-type": "application/json" });
    return res.end(JSON.stringify({ message: `Cannot GET ${url.pathname}`, statusCode: 404 }));
  }
  const [, kind, raw] = m;
  const name = decodeURIComponent(raw).toLowerCase();
  setTimeout(() => {
    if (name.includes("block")) {
      res.writeHead(403, { "content-type": "text/html", "cf-mitigated": "challenge" });
      return res.end("<html><head><title>Just a moment...</title></head></html>");
    }
    if (name.includes("slow")) {
      res.writeHead(429, { "retry-after": "2" });
      return res.end();
    }
    const taken = TAKEN.has(name);
    if (kind === "users") {
      if (!taken) {
        res.writeHead(404, { "content-type": "application/json" });
        return res.end(JSON.stringify({ message: "User not found", statusCode: 404 }));
      }
      res.writeHead(200, { "content-type": "application/json" });
      return res.end(JSON.stringify({ address: "7xKXtg2CW87d97TXJSDpbD5jBkheTqA83TZRuJosgAsU", username: name, followers: 1 }));
    }
    if (!taken) {
      res.writeHead(404, { "content-type": "text/html" });
      return res.end("<html>This page could not be found.</html>");
    }
    res.writeHead(200, { "content-type": "text/html" });
    res.end(`<html><head><title>@${name} | pump</title></head></html>`);
  }, 80 + Math.random() * 200);
}).listen(PORT, () => console.log(`mock pump.fun on http://localhost:${PORT}`));

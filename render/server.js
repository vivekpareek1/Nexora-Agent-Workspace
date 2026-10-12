// Render host for Nexora: serves public/, mounts the api/*.js handlers, and provides demo-code login.
import http from "node:http";
import fs from "node:fs/promises";
import path from "node:path";
import crypto from "node:crypto";
import { fileURLToPath, pathToFileURL } from "node:url";
import { runMigrations } from "./shim.js";

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
const PUBLIC = path.join(ROOT, "public");
const API = path.join(ROOT, "api");
const PORT = Number(process.env.PORT || 10000);
const SECRET = process.env.SESSION_SECRET || "";
const DEMO_CODE = process.env.DEMO_ACCESS_CODE || "";
const COOKIE = "nx_session";
const MAX_BODY = 32 * 1024 * 1024;
const TYPES = { ".html": "text/html; charset=utf-8", ".js": "text/javascript; charset=utf-8", ".css": "text/css; charset=utf-8", ".json": "application/json", ".svg": "image/svg+xml", ".png": "image/png", ".ico": "image/x-icon" };

if (SECRET.length < 24 || DEMO_CODE.length < 6) {
  console.error("SESSION_SECRET (24+ chars) and DEMO_ACCESS_CODE (6+ chars) must be set.");
  process.exit(1);
}

const b64 = s => Buffer.from(s).toString("base64url");
const sign = s => crypto.createHmac("sha256", SECRET).update(s).digest("base64url");
function safeEqual(a, b) {
  const x = crypto.createHash("sha256").update(String(a)).digest();
  const y = crypto.createHash("sha256").update(String(b)).digest();
  return crypto.timingSafeEqual(x, y);
}
function makeSession(email) {
  const user = { id: "u_" + crypto.createHash("sha256").update(email).digest("hex").slice(0, 24), email };
  const payload = b64(JSON.stringify({ ...user, exp: Date.now() + 7 * 864e5 }));
  return { user, cookie: payload + "." + sign(payload) };
}
function readSession(req) {
  const m = String(req.headers.cookie || "").match(new RegExp("(?:^|; )" + COOKIE + "=([^;]+)"));
  if (!m) return null;
  const [payload, mac] = m[1].split(".");
  if (!payload || !mac || !safeEqual(sign(payload), mac)) return null;
  try {
    const d = JSON.parse(Buffer.from(payload, "base64url").toString());
    return d.exp > Date.now() ? { id: d.id, email: d.email } : null;
  } catch { return null; }
}
const cookieAttrs = "; Path=/; HttpOnly; Secure; SameSite=Lax";

const attempts = new Map();
function limited(ip) {
  const now = Date.now();
  const a = attempts.get(ip);
  if (!a || a.reset < now) { attempts.set(ip, { n: 1, reset: now + 60000 }); return false; }
  return ++a.n > 10;
}

function wrap(req, res, url) {
  res.status = c => { res.statusCode = c; return res; };
  res.json = o => { if (res.headersSent) return; res.setHeader("content-type", "application/json"); res.end(JSON.stringify(o)); };
  req.query = Object.fromEntries(url.searchParams);
}
async function readBody(req) {
  const chunks = [];
  let size = 0;
  for await (const c of req) {
    size += c.length;
    if (size > MAX_BODY) throw Object.assign(new Error("Body too large"), { status: 413 });
    chunks.push(c);
  }
  const raw = Buffer.concat(chunks).toString();
  if (!raw) return {};
  try { return JSON.parse(raw); } catch { throw Object.assign(new Error("Invalid JSON"), { status: 400 }); }
}

// Load handlers from api/ (skip platform-only "scheduler" hooks).
const routes = new Map();
async function loadRoutes(dir, prefix) {
  for (const e of await fs.readdir(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) { await loadRoutes(p, prefix + e.name + "/"); continue; }
    if (!e.name.endsWith(".js")) continue;
    const mod = await import(pathToFileURL(p).href);
    if (mod.access === "scheduler" || typeof mod.default !== "function") continue;
    routes.set("/api/" + prefix + e.name.slice(0, -3), mod);
  }
}

async function serveStatic(req, res, pathname) {
  const name = pathname === "/" ? "/index.html" : pathname === "/login" ? "/login.html" : pathname;
  if (name === "/hatchable-shim.js") {
    res.writeHead(200, { "content-type": TYPES[".js"], "cache-control": "no-cache" });
    return res.end(await fs.readFile(path.join(ROOT, "render", "client-shim.js")));
  }
  const file = path.normalize(path.join(PUBLIC, name));
  if (!file.startsWith(PUBLIC + path.sep)) { res.statusCode = 403; return res.end("Forbidden"); }
  let data;
  try { data = await fs.readFile(file); } catch { res.statusCode = 404; return res.end("Not found"); }
  const ext = path.extname(file);
  if (ext === ".html") {
    let html = data.toString();
    if (name === "/login.html") {
      html = html.replace("We'll email you a one-time code. No password needed.", "Enter your email and the demo access code.")
        .replace(/We'll email you a one-time code\. No password needed\./g, "Enter your email and the demo access code.")
        .replace("6-digit code", "Demo access code").replace('inputmode="numeric" ', "").replace('maxlength="6" pattern="[0-9]{6}"', 'maxlength="64" type="password"')
        .replace("Enter the one-time code sent to ", "Enter the demo access code for ").replace("Code sent. Check your inbox.", "Enter the demo access code.")
        .replace("The code was not accepted. Try again.", "The access code was not accepted.");
    }
    html = html.replace(/<script(?![^>]*src)/, '<script src="/hatchable-shim.js"></script><script').replace('<script src="/app.js">', '<script src="/hatchable-shim.js"></script><script src="/app.js">');
    res.writeHead(200, { "content-type": TYPES[".html"], "cache-control": "no-cache" });
    return res.end(html);
  }
  res.writeHead(200, { "content-type": TYPES[ext] || "application/octet-stream", "cache-control": "no-cache" });
  res.end(data);
}

async function handle(req, res) {
  const url = new URL(req.url, "http://localhost");
  const { pathname } = url;
  res.setHeader("x-content-type-options", "nosniff");
  res.setHeader("x-frame-options", "DENY");
  res.setHeader("referrer-policy", "same-origin");
  wrap(req, res, url);

  if (pathname === "/healthz") return res.json({ ok: true });

  if (req.method !== "GET" && req.method !== "HEAD") {
    const origin = req.headers.origin;
    if (origin && new URL(origin).host !== req.headers.host) return res.status(403).json({ error: "BAD_ORIGIN" });
  }

  if (pathname.startsWith("/auth/")) {
    if (pathname === "/auth/session" && req.method === "GET") return res.json({ user: readSession(req) });
    if (pathname === "/auth/logout" && req.method === "POST") {
      res.setHeader("set-cookie", COOKIE + "=; Max-Age=0" + cookieAttrs);
      return res.json({ ok: true });
    }
    if (pathname === "/auth/login" && req.method === "POST") {
      const ip = String(req.headers["x-forwarded-for"] || req.socket.remoteAddress || "").split(",")[0].trim();
      if (limited(ip)) return res.status(429).json({ error: "RATE_LIMITED", message: "Too many attempts. Wait a minute and retry." });
      const body = await readBody(req);
      const email = String(body.email || "").trim().toLowerCase();
      if (!/^[^\s@]{1,64}@[^\s@]{1,190}$/.test(email) || !safeEqual(body.code || "", DEMO_CODE)) {
        return res.status(401).json({ error: "INVALID_LOGIN", message: "Email or access code was not accepted." });
      }
      const s = makeSession(email);
      res.setHeader("set-cookie", COOKIE + "=" + s.cookie + "; Max-Age=604800" + cookieAttrs);
      return res.json({ ok: true, user: s.user });
    }
    return res.status(404).json({ error: "NOT_FOUND" });
  }

  if (pathname.startsWith("/api/")) {
    const mod = routes.get(pathname.replace(/\/$/, ""));
    if (!mod) return res.status(404).json({ error: "NOT_FOUND" });
    if (mod.methods && !mod.methods.includes(req.method)) return res.status(405).json({ error: "METHOD_NOT_ALLOWED" });
    if (mod.access === "user") {
      req.user = readSession(req);
      if (!req.user) return res.status(401).json({ error: "AUTH_REQUIRED", message: "Please sign in." });
    }
    req.body = req.method === "GET" ? {} : await readBody(req);
    return mod.default(req, res);
  }

  if (req.method !== "GET" && req.method !== "HEAD") return res.status(405).json({ error: "METHOD_NOT_ALLOWED" });
  return serveStatic(req, res, pathname);
}

if (process.env.SKIP_MIGRATIONS !== "1") await runMigrations();
await loadRoutes(API, "");
http.createServer((req, res) => {
  handle(req, res).catch(e => {
    console.error("request failed:", e?.message || e);
    if (!res.headersSent) res.status(e.status || 500).json({ error: e.status === 413 ? "BODY_TOO_LARGE" : e.status === 400 ? "BAD_REQUEST" : "INTERNAL_ERROR", message: e.status ? e.message : "Server error. Please retry." });
  });
}).listen(PORT, () => console.log("Nexora listening on", PORT, "routes:", [...routes.keys()].join(", ")));

// Elektron test serveri — qo'shimcha kutubxonalarsiz (faqat Node.js 18+)
"use strict";
const http = require("http");
const fs = require("fs");
const path = require("path");
const crypto = require("crypto");

const PORT = +process.env.PORT || 3000;
const HOST = process.env.HOST || "0.0.0.0";
const ADMIN_PIN = process.env.ADMIN_PIN || "";
const DATA_DIR = process.env.DATA_DIR || path.join(__dirname, "data");
if (!ADMIN_PIN || ADMIN_PIN.length < 6) {
  console.error("XATO: ADMIN_PIN muhit o'zgaruvchisini kamida 6 belgili qilib o'rnating. Masalan: ADMIN_PIN=Kuchli2026 node server.js");
  process.exit(1);
}
fs.mkdirSync(DATA_DIR, { recursive: true });
const RES_FILE = path.join(DATA_DIR, "results.json");
const CFG_FILE = path.join(DATA_DIR, "config.json");
const KEYS = JSON.parse(fs.readFileSync(path.join(__dirname, "keys.json"), "utf8"));
const INDEX = fs.readFileSync(path.join(__dirname, "public", "index.html"));

const readJSON = (f, d) => { try { return JSON.parse(fs.readFileSync(f, "utf8")); } catch { return d; } };
function writeJSON(f, v) { const tmp = f + ".tmp"; fs.writeFileSync(tmp, JSON.stringify(v, null, 1)); fs.renameSync(tmp, f); }
let results = readJSON(RES_FILE, []);
let config = Object.assign({ minutes: 30, shuffleQ: true, shuffleO: true, showReview: false }, readJSON(CFG_FILE, {}));

// oddiy cheklovlar (IP bo'yicha)
const hits = new Map();
function limited(ip, kind, max, windowMs) {
  const k = kind + "|" + ip, now = Date.now();
  const arr = (hits.get(k) || []).filter(t => now - t < windowMs);
  arr.push(now); hits.set(k, arr);
  return arr.length > max;
}
const pinOk = (p) => typeof p === "string" && p.length === ADMIN_PIN.length &&
  crypto.timingSafeEqual(Buffer.from(p), Buffer.from(ADMIN_PIN));

function send(res, code, body, type = "application/json; charset=utf-8") {
  const headers = { "Content-Type": type, "Cache-Control": "no-store", "X-Content-Type-Options": "nosniff", "Referrer-Policy": "no-referrer" };
  if (body === null) { res.writeHead(code, headers); return res.end(); }
  res.writeHead(code, headers);
  res.end(typeof body === "string" || Buffer.isBuffer(body) ? body : JSON.stringify(body));
}
function readBody(req) {
  return new Promise((ok, bad) => {
    let size = 0; const chunks = [];
    req.on("data", c => { size += c.length; if (size > 50000) { bad(new Error("too big")); req.destroy(); } else chunks.push(c); });
    req.on("end", () => { try { ok(JSON.parse(Buffer.concat(chunks).toString("utf8") || "{}")); } catch (e) { bad(e); } });
    req.on("error", bad);
  });
}
const clean = (v, n) => String(v == null ? "" : v).replace(/[\u0000-\u001f]/g, "").trim().slice(0, n);

const server = http.createServer(async (req, res) => {
  const ip = (req.headers["x-forwarded-for"] || "").split(",")[0].trim() || req.socket.remoteAddress;
  const url = new URL(req.url, "http://x");
  const p = url.pathname;
  try {
    if (req.method === "GET" && (p === "/" || p === "/index.html")) return send(res, 200, INDEX, "text/html; charset=utf-8");
    if (req.method === "GET" && p === "/api/config") return send(res, 200, config);

    if (req.method === "POST" && p === "/api/submit") {
      if (limited(ip, "submit", 300, 3600e3)) return send(res, 429, { error: "Juda ko'p urinish" });
      const b = await readBody(req);
      const name = clean(b.code, 80);
      if (name.length < 3) return send(res, 400, { error: "F.I.Sh. kerak" });
      const raw = {}, sc = {}; let score = 0;
      for (const n of Object.keys(KEYS)) {
        raw[n] = clean(b.raw && b.raw[n], 40).toLowerCase() === KEYS[n].key.toLowerCase() ? KEYS[n].key : clean(b.raw && b.raw[n], 40);
        sc[n] = raw[n] === KEYS[n].key ? 1 : 0; score += sc[n];
      }
      const rec = { id: crypto.randomUUID(), code: name, group: clean(b.group, 30), date: new Date().toISOString(),
        sec: Math.max(0, Math.min(36000, Math.round(+b.sec || 0))), auto: !!b.auto, raw, sc, score, ip };
      results.push(rec); writeJSON(RES_FILE, results);
      const out = { id: rec.id, sc, score };
      if (config.showReview) out.review = Object.fromEntries(Object.entries(KEYS).map(([n, k]) => [n, k.disp]));
      return send(res, 200, out);
    }

    if (p.startsWith("/api/") && p !== "/api/config" || (p === "/api/config" && req.method === "PUT")) {
      const fails = (hits.get("fail|" + ip) || []).filter(t => Date.now() - t < 600e3);
      if (fails.length >= 10) return send(res, 429, { error: "Juda ko'p noto'g'ri PIN" });
      if (!pinOk(req.headers["x-admin-pin"])) { limited(ip, "fail", 1e9, 600e3); return send(res, 401, { error: "PIN noto'g'ri" }); }

      if (req.method === "GET" && p === "/api/results") return send(res, 200, results);
      if (req.method === "GET" && p === "/api/keys") return send(res, 200, KEYS);
      if (req.method === "DELETE" && p === "/api/results") {
        writeJSON(path.join(DATA_DIR, `results_backup_${Date.now()}.json`), results);
        results = []; writeJSON(RES_FILE, results); return send(res, 204, null);
      }
      if (req.method === "DELETE" && p.startsWith("/api/results/")) {
        const id = decodeURIComponent(p.slice(13)); const before = results.length;
        results = results.filter(r => r.id !== id); writeJSON(RES_FILE, results);
        return send(res, before === results.length ? 404 : 204, before === results.length ? { error: "topilmadi" } : null);
      }
      if (req.method === "PUT" && p === "/api/config") {
        const b = await readBody(req);
        const m = Math.round(+b.minutes);
        if (!(m >= 5 && m <= 180)) return send(res, 400, { error: "minutes 5-180" });
        config = { minutes: m, shuffleQ: !!b.shuffleQ, shuffleO: !!b.shuffleO, showReview: !!b.showReview };
        writeJSON(CFG_FILE, config); return send(res, 200, config);
      }
    }
    send(res, 404, { error: "Topilmadi" });
  } catch (e) {
    send(res, 400, { error: "Noto'g'ri so'rov" });
  }
});
server.listen(PORT, HOST, () => console.log(`Test serveri ishga tushdi: http://${HOST}:${PORT}  (natijalar: ${RES_FILE})`));

#!/usr/bin/env node
// Jobtrail AI helper: a tiny local server that turns requests from the Jobtrail
// web app into `agy -p` (Antigravity CLI) calls with a JSON schema, so the app
// gets structured answers without any API key. Listens on 127.0.0.1 only and
// answers only the origins in JOBTRAIL_ORIGINS. It also drives the browser for
// auto-filling application forms (apply.mjs).

import { createServer } from "node:http";
import { MODEL, agyBusy, runAgy } from "./agy.mjs";
import { createApplier } from "./apply.mjs";

const PORT = Number(process.env.JOBTRAIL_HELPER_PORT || 4777);
const ORIGINS = new Set(
  (process.env.JOBTRAIL_ORIGINS || "http://localhost:3000")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean),
);
const VERSION = "1.1.0";
const MAX_BODY = 400_000;
const MAX_APPLY_BODY = 8_000_000; // carries the resume PDF

const clip = (s, n) => String(s ?? "").slice(0, n);

// ---------------------------------------------------------------------------
// tasks

const tasks = {
  async extract({ text }) {
    const schema = {
      type: "object",
      properties: {
        company: { type: "string" },
        role: { type: "string" },
        location: { type: "string" },
        work_mode: { type: "string", enum: ["remote", "hybrid", "onsite", "unknown"] },
        salary: { type: "string" },
        summary: { type: "string" },
      },
      required: ["company", "role", "location", "work_mode", "salary", "summary"],
    };
    const out = await runAgy(
      `Extract the job posting details from the text below. Use "" when a field is not stated. ` +
        `salary: as written (keep currency). summary: 2 short sentences on what the job is.\n` +
        `Do not use any tools; answer only from the text.\n\n<posting>\n${clip(text, 40000)}\n</posting>`,
      schema,
    );
    if (out.work_mode === "unknown") out.work_mode = "";
    return out;
  },

  async fetchPosting({ url }) {
    let parsed;
    try {
      parsed = new URL(url);
    } catch {
      throw new Error("That isn't a valid URL");
    }
    if (!/^https?:$/.test(parsed.protocol)) throw new Error("Only http(s) links");
    if (/^(localhost|127\.|10\.|192\.168\.|172\.(1[6-9]|2\d|3[01])\.|0\.|\[?::1\]?$)/i.test(parsed.hostname)) {
      throw new Error("Local network addresses aren't allowed");
    }
    const res = await fetch(parsed, {
      headers: { "user-agent": "Mozilla/5.0 (X11; Linux x86_64) Jobtrail/1.0" },
      redirect: "follow",
      signal: AbortSignal.timeout(15_000),
    });
    if (!res.ok) throw new Error(`The page answered ${res.status}`);
    const html = await res.text();
    const text = html
      .replace(/<script[\s\S]*?<\/script>/gi, " ")
      .replace(/<style[\s\S]*?<\/style>/gi, " ")
      .replace(/<br\s*\/?>|<\/(p|div|li|h\d)>/gi, "\n")
      .replace(/<[^>]+>/g, " ")
      .replace(/&nbsp;/g, " ")
      .replace(/&amp;/g, "&")
      .replace(/&#39;|&apos;/g, "'")
      .replace(/&quot;/g, '"')
      .replace(/[ \t]+/g, " ")
      .replace(/\n\s*\n+/g, "\n\n")
      .trim();
    if (text.length < 200) throw new Error("Couldn't read the posting from that page (it may need a login)");
    const details = await tasks.extract({ text });
    return { ...details, description: clip(text, 30000) };
  },

  async match({ jobDescription, resumes, company, role }) {
    if (!Array.isArray(resumes) || resumes.length === 0) throw new Error("Upload a resume first");
    const schema = {
      type: "object",
      properties: {
        score: { type: "number" },
        best_resume_id: { type: "string" },
        best_resume_name: { type: "string" },
        verdict: { type: "string" },
        matched_keywords: { type: "array", items: { type: "string" } },
        missing_keywords: { type: "array", items: { type: "string" } },
        suggestions: { type: "array", items: { type: "string" } },
      },
      required: ["score", "best_resume_id", "best_resume_name", "verdict", "matched_keywords", "missing_keywords", "suggestions"],
    };
    const resumeBlock = resumes
      .slice(0, 8)
      .map((r) => `<resume id="${clip(r.id, 60)}" name="${clip(r.name, 120)}">\n${clip(r.text, 12000)}\n</resume>`)
      .join("\n\n");
    return runAgy(
      `You are an experienced tech recruiter and ATS expert. Compare the candidate's resumes with the job ` +
        `(${clip(role, 160)} at ${clip(company, 120)}). Pick the single best resume for this job.\n` +
        `score: 0-100 fit of the BEST resume. verdict: one honest sentence. ` +
        `matched_keywords: up to 12 important skills/terms from the job found in that resume. ` +
        `missing_keywords: up to 10 important job terms missing from it (only real gaps). ` +
        `suggestions: 3-5 concrete edits to that resume for this job (specific bullets to add or reword; ` +
        `never invent experience the candidate doesn't have).\n` +
        `Do not use any tools.\n\n<job>\n${clip(jobDescription, 30000)}\n</job>\n\n${resumeBlock}`,
      schema,
      { effort: "medium" },
    );
  },

  async coverLetter({ jobDescription, resumeText, company, role, tone, name }) {
    const schema = {
      type: "object",
      properties: { letter: { type: "string" } },
      required: ["letter"],
    };
    return runAgy(
      `Write a cover letter for ${clip(name, 80) || "the candidate"} applying to ${clip(role, 160)} at ` +
        `${clip(company, 120)}. Tone: ${clip(tone, 40) || "confident and warm"}. 180-260 words, 3-4 short ` +
        `paragraphs, plain text with a greeting and sign-off. Use only facts from the resume; tie 2-3 of ` +
        `them to what the job asks for. No clichés like "I am writing to express my interest". ` +
        `Do not use any tools.\n\n<job>\n${clip(jobDescription, 20000)}\n</job>\n\n<resume>\n${clip(resumeText, 12000)}\n</resume>`,
      schema,
      { effort: "medium" },
    );
  },
};

const applier = createApplier({
  runAgy,
  // For automated tests: no visible window, separate browser profile.
  headless: process.env.JOBTRAIL_APPLY_HEADLESS === "1",
  ...(process.env.JOBTRAIL_BROWSER_PROFILE ? { profileDir: process.env.JOBTRAIL_BROWSER_PROFILE } : {}),
});

// ---------------------------------------------------------------------------
// http

function cors(req, res) {
  const origin = req.headers.origin;
  if (origin && ORIGINS.has(origin)) {
    res.setHeader("Access-Control-Allow-Origin", origin);
    res.setHeader("Vary", "Origin");
    res.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
    res.setHeader("Access-Control-Allow-Headers", "content-type");
    // Chrome's Private Network Access preflight for https site -> localhost.
    res.setHeader("Access-Control-Allow-Private-Network", "true");
    res.setHeader("Access-Control-Max-Age", "600");
    return true;
  }
  return false;
}

function send(res, status, body) {
  res.writeHead(status, { "content-type": "application/json" });
  res.end(JSON.stringify(body));
}

const server = createServer((req, res) => {
  const allowed = cors(req, res);
  // Browsers always send Origin on these cross-origin calls; anything else is refused.
  if (!allowed) return send(res, 403, { error: "Origin not allowed" });
  if (req.method === "OPTIONS") {
    res.writeHead(204);
    return res.end();
  }
  const url = new URL(req.url, "http://localhost");
  if (req.method === "GET" && url.pathname === "/health") {
    return send(res, 200, { ok: true, version: VERSION, busy: agyBusy(), model: MODEL || "default", apply: true });
  }
  if (req.method === "GET" && url.pathname.startsWith("/apply/")) {
    const run = applier.status(url.pathname.slice(7));
    return run ? send(res, 200, { ok: true, result: run }) : send(res, 404, { error: "That auto-fill run has ended" });
  }
  const isApply = req.method === "POST" && url.pathname === "/apply";
  const task = isApply
    ? async (input) => applier.start(input)
    : req.method === "POST" && url.pathname.startsWith("/ai/") && tasks[url.pathname.slice(4)];
  if (!task) return send(res, 404, { error: "Not found" });
  const limit = isApply ? MAX_APPLY_BODY : MAX_BODY;

  let size = 0;
  const chunks = [];
  req.on("data", (c) => {
    size += c.length;
    if (size > limit) req.destroy();
    else chunks.push(c);
  });
  req.on("end", async () => {
    let input;
    try {
      input = JSON.parse(Buffer.concat(chunks).toString("utf8") || "{}");
    } catch {
      return send(res, 400, { error: "Bad JSON" });
    }
    const started = Date.now();
    try {
      const result = await task(input);
      console.log(`${url.pathname} ok in ${((Date.now() - started) / 1000).toFixed(1)}s`);
      send(res, 200, { ok: true, result });
    } catch (e) {
      console.error(`${url.pathname} failed: ${e.message}`);
      send(res, 500, { error: e.message });
    }
  });
});

for (const signal of ["SIGINT", "SIGTERM"]) {
  process.on(signal, async () => {
    await applier.close();
    process.exit(0);
  });
}

server.listen(PORT, "127.0.0.1", () => {
  console.log(`Jobtrail AI helper on http://127.0.0.1:${PORT} for ${[...ORIGINS].join(", ")}`);
});

// Auto-fill for job application forms: Greenhouse, Lever and Ashby, plus a
// best-effort pass on anything else. It opens the form in a real browser window
// on this PC, fills it from the user's profile, resume and AI answers, and then
// stops so the user can review it and click Submit themselves.
//
// Nothing in this file clicks a submit button or presses Enter (Enter submits
// plain HTML forms such as Lever's).

import { randomUUID } from "node:crypto";
import { existsSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { homedir, tmpdir } from "node:os";
import { join } from "node:path";
import { chromium } from "playwright-core";

const BROWSERS = [
  process.env.JOBTRAIL_BROWSER,
  "/usr/bin/chromium-browser",
  "/usr/bin/chromium",
  "/usr/bin/google-chrome",
  "/usr/bin/google-chrome-stable",
  "/usr/bin/brave-browser",
  "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
  "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe",
].filter(Boolean);

const CONFIRMATION =
  /thank(s| you) for (applying|your (application|interest))|application (has been |was )?(successfully )?(submitted|received)|we('ve| have) received your application/i;

const clip = (s, n) => String(s ?? "").slice(0, n);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// ---------------------------------------------------------------------------
// which site, and where its form lives

export function detectAts(url) {
  const host = url.hostname;
  if (/(^|\.)greenhouse\.io$/.test(host) || url.searchParams.has("gh_jid")) return "greenhouse";
  if (/(^|\.)lever\.co$/.test(host)) return "lever";
  if (/(^|\.)ashbyhq\.com$/.test(host)) return "ashby";
  return "other";
}

export function formUrl(url, ats) {
  const u = new URL(url);
  const path = u.pathname.replace(/\/+$/, "");
  // jobs.lever.co/<company>/<id>  →  …/apply
  if (ats === "lever" && /^\/[^/]+\/[0-9a-f-]{36}$/i.test(path)) u.pathname = `${path}/apply`;
  // jobs.ashbyhq.com/<company>/<id>  →  …/application
  if (ats === "ashby" && /^\/[^/]+\/[0-9a-f-]{36}$/i.test(path)) u.pathname = `${path}/application`;
  return u.href;
}

// ---------------------------------------------------------------------------
// reading the form (runs inside the page)

export function scanForm() {
  const clean = (s) => (s || "").replace(/\s+/g, " ").trim();
  const shown = (el) => {
    if (!el || !el.isConnected) return false;
    const s = getComputedStyle(el);
    if (s.display === "none" || s.visibility === "hidden") return false;
    const r = el.getBoundingClientRect();
    return r.width > 0 && r.height > 0;
  };
  // Visible text only, without the controls' own text (options, buttons, hidden status messages).
  const SKIP = new Set(["SELECT", "OPTION", "INPUT", "TEXTAREA", "BUTTON", "SCRIPT", "STYLE", "SVG"]);
  const textOf = (el) => {
    const parts = [];
    const walk = (node) => {
      for (const c of node.childNodes) {
        if (c.nodeType === 3) parts.push(c.textContent);
        else if (c.nodeType === 1 && !SKIP.has(c.tagName.toUpperCase()) && c.getAttribute("role") !== "listbox") {
          const s = getComputedStyle(c);
          if (s.display !== "none" && s.visibility !== "hidden") walk(c);
        }
      }
    };
    walk(el);
    return clean(parts.join(" "));
  };
  window.__jtN = window.__jtN || 0;
  const mark = (el) => el.dataset.jt || (el.dataset.jt = String(++window.__jtN));
  const LABELISH = "label, legend, [class*='label' i], [class*='question' i], [class*='title' i], h3, h4";

  function nearestLabel(el) {
    let node = el.parentElement;
    for (let i = 0; node && i < 7; i++, node = node.parentElement) {
      for (const cand of node.querySelectorAll(LABELISH)) {
        if (cand.contains(el) || cand.querySelector("input, select, textarea")) continue;
        if (!(cand.compareDocumentPosition(el) & Node.DOCUMENT_POSITION_FOLLOWING)) continue;
        const t = textOf(cand);
        if (t && t.length < 700) return t;
      }
    }
    return "";
  }
  function questionFor(el, isChoice) {
    const by = el.getAttribute("aria-labelledby");
    if (by && !isChoice) {
      const t = clean(by.split(/\s+/).map((id) => document.getElementById(id)?.textContent || "").join(" "));
      if (t) return t;
    }
    if (!isChoice && el.labels && el.labels.length) {
      const t = textOf(el.labels[0]);
      if (t) return t;
    }
    if (!isChoice && el.getAttribute("aria-label")) return clean(el.getAttribute("aria-label"));
    const fs = el.closest("fieldset");
    const legend = fs && fs.querySelector("legend");
    if (legend && textOf(legend)) return textOf(legend);
    const group = el.closest("[role=radiogroup], [role=group]");
    if (group && group.getAttribute("aria-labelledby")) {
      const t = clean(document.getElementById(group.getAttribute("aria-labelledby"))?.textContent);
      if (t) return t;
    }
    return nearestLabel(el) || clean(el.getAttribute("placeholder") || el.name || "");
  }
  // Extra text around a field (descriptions, the actual question above a Yes/No
  // group): the widest ancestor that holds no other field.
  function hintFor(nodes, label) {
    let hint = "";
    let node = nodes[0].parentElement;
    for (let k = 0; node && k < 6; k++, node = node.parentElement) {
      const inputs = [...node.querySelectorAll("input:not([type=hidden]), textarea, select")];
      if (inputs.some((i) => !nodes.includes(i))) break;
      const t = textOf(node);
      if (t.length > hint.length) hint = t;
    }
    hint = clean(hint.replace(label, ""));
    return hint.length > 3 && hint !== label ? hint.slice(0, 500) : "";
  }
  const optionText = (el) =>
    clean((el.labels && el.labels[0] && textOf(el.labels[0])) || el.getAttribute("aria-label") || el.nextElementSibling?.textContent || el.value);
  const isRequired = (el, label) =>
    el.required || el.getAttribute("aria-required") === "true" || /[*✱]\s*$/.test(label || "");
  const tidy = (label) => clean(label.replace(/[*✱]+/g, " "));
  // react-select style comboboxes show the chosen option next to an empty <input>.
  const comboValue = (el) => {
    let node = el.parentElement;
    for (let k = 0; node && k < 6; k++, node = node.parentElement) {
      if ([...node.querySelectorAll("input[role=combobox]")].some((o) => o !== el)) break;
      const v = node.querySelector("[class*=single-value i], [class*=singlevalue i], [class*=multi-value__label i]");
      if (v) return clean(v.textContent);
    }
    return el.value;
  };

  const fields = [];
  const groups = new Set();
  for (const el of document.querySelectorAll("input, textarea, select")) {
    const tag = el.tagName.toLowerCase();
    const type = (el.getAttribute("type") || (tag === "input" ? "text" : tag)).toLowerCase();
    if (["hidden", "submit", "button", "reset", "image", "search", "password"].includes(type) || el.disabled) continue;
    if (el.closest("[aria-hidden=true]") && type !== "file") continue;

    if (type === "file") {
      // File inputs hide behind an "Attach" button, so the field's own label sits further up.
      const label = [nearestLabel(el), questionFor(el, false), el.id, el.name].filter(Boolean).join(" ");
      fields.push({ id: mark(el), kind: "file", label: tidy(label), required: isRequired(el, label), accept: el.accept || "" });
      continue;
    }
    if (type === "radio" || type === "checkbox") {
      const key = type + ":" + (el.name || mark(el));
      if (groups.has(key)) continue;
      groups.add(key);
      const group = el.name ? [...document.querySelectorAll(`input[type=${type}]`)].filter((g) => g.name === el.name) : [el];
      if (!group.some((g) => shown(g) || shown(g.labels && g.labels[0]) || shown(g.parentElement))) continue;
      const raw = questionFor(el, true);
      const options = group.map((g) => ({ id: mark(g), text: optionText(g) }));
      fields.push({
        id: mark(el),
        kind: type,
        label: tidy(raw || options[0].text),
        hint: hintFor(group, raw),
        required: group.some((g) => isRequired(g, raw)),
        options: options.map((o) => o.text),
        optionIds: options.map((o) => o.id),
        value: group.filter((g) => g.checked).map(optionText).join(" || "),
      });
      continue;
    }
    if (!shown(el)) continue;
    const raw = questionFor(el, false);
    const combobox = el.getAttribute("role") === "combobox" || el.getAttribute("aria-autocomplete") === "list";
    fields.push({
      id: mark(el),
      kind: tag === "select" ? "select" : combobox ? "combobox" : tag === "textarea" ? "textarea" : "text",
      inputType: type,
      label: tidy(raw),
      hint: hintFor([el], raw),
      required: isRequired(el, raw),
      value: tag === "select" ? clean(el.selectedOptions[0]?.text || "") : combobox ? comboValue(el) : el.value,
      options: tag === "select" ? [...el.options].filter((o) => o.value !== "").map((o) => clean(o.text)) : undefined,
    });
  }

  // Ashby-style yes/no questions are plain buttons, not inputs.
  const seenWraps = new Set();
  for (const wrap of document.querySelectorAll("[class*=yesno i], [class*=yes-no i]")) {
    const buttons = [...wrap.querySelectorAll("button")].filter(shown);
    if (buttons.length < 2 || [...seenWraps].some((w) => w.contains(wrap))) continue;
    seenWraps.add(wrap);
    const raw = nearestLabel(wrap) || "";
    fields.push({
      id: mark(wrap),
      kind: "buttons",
      label: tidy(raw),
      required: /[*✱]\s*$/.test(raw) || !!wrap.parentElement?.querySelector("[class*=required i]"),
      options: buttons.map((b) => clean(b.textContent)),
      optionIds: buttons.map(mark),
      value: "",
    });
  }
  // Those yes/no buttons are often backed by a hidden, unlabeled checkbox: keep only the buttons.
  const buttonLabels = new Set(fields.filter((f) => f.kind === "buttons").map((f) => f.label));
  return fields.filter((f) => !(f.kind === "checkbox" && buttonLabels.has(f.label) && f.options.every((o) => o === "on")));
}

function findSubmit() {
  const buttons = [...document.querySelectorAll("button, input[type=submit]")].filter((b) => {
    const r = b.getBoundingClientRect();
    return r.width > 0 && r.height > 0;
  });
  const btn =
    buttons.find((b) => b.type === "submit" && /submit|apply/i.test(b.textContent || b.value)) ||
    buttons.find((b) => /submit application|^\s*submit\s*$|^\s*apply\s*$/i.test(b.textContent || b.value)) ||
    buttons.find((b) => b.type === "submit");
  if (!btn) return false;
  btn.scrollIntoView({ block: "center", behavior: "smooth" });
  btn.style.outline = "3px solid #f97316";
  btn.style.outlineOffset = "3px";
  return true;
}

function showBanner({ filled, needs }) {
  document.getElementById("jobtrail-banner")?.remove();
  const box = document.createElement("div");
  box.id = "jobtrail-banner";
  box.setAttribute("style",
    "position:fixed;z-index:2147483647;left:50%;top:16px;transform:translateX(-50%);max-width:min(560px,calc(100vw - 32px));" +
    "background:#17171a;color:#f4f4f5;border:1px solid #3f3f46;border-radius:14px;padding:14px 16px;" +
    "font:14px/1.45 system-ui,sans-serif;box-shadow:0 12px 40px rgba(0,0,0,.45)");
  const title = document.createElement("div");
  title.setAttribute("style", "font-weight:600;margin-bottom:4px");
  title.textContent = `Jobtrail filled ${filled} field${filled === 1 ? "" : "s"}. Review everything, then click Submit yourself.`;
  box.append(title);
  if (needs.length) {
    const p = document.createElement("div");
    p.setAttribute("style", "color:#fdba74");
    p.textContent = `Still needs you: ${needs.slice(0, 6).join(" · ")}${needs.length > 6 ? ` +${needs.length - 6} more` : ""}`;
    box.append(p);
  }
  const close = document.createElement("button");
  close.type = "button";
  close.textContent = "×";
  close.setAttribute("aria-label", "Dismiss");
  close.setAttribute("style", "position:absolute;top:6px;right:10px;background:none;border:0;color:#a1a1aa;font-size:18px;cursor:pointer");
  close.onclick = () => box.remove();
  box.append(close);
  document.body.append(box);
}

function markEmpty(ids) {
  for (const id of ids) {
    const el = document.querySelector(`[data-jt="${id}"]`);
    const target = el && (el.type === "radio" || el.type === "checkbox" ? el.closest("fieldset, li, div") : el);
    if (target) {
      target.style.outline = "2px solid #f97316";
      target.style.outlineOffset = "2px";
    }
  }
}

// ---------------------------------------------------------------------------
// answers

const norm = (s) =>
  String(s ?? "")
    .toLowerCase()
    .replace(/[^a-z0-9+]+/g, " ")
    .trim();

export function bestOption(options, value) {
  const v = norm(value);
  if (!v || !options?.length) return -1;
  const n = options.map(norm);
  let i = n.indexOf(v);
  if (i >= 0) return i;
  i = n.findIndex((o) => o.startsWith(v) || v.startsWith(o));
  if (i >= 0 && n[i].length > 0) return i;
  i = n.findIndex((o) => o.includes(v) || (o.length > 2 && v.includes(o)));
  if (i >= 0) return i;
  // most shared words
  const words = new Set(v.split(" "));
  let best = -1;
  let bestScore = 0;
  n.forEach((o, k) => {
    const score = o.split(" ").filter((w) => w.length > 1 && words.has(w)).length;
    if (score > bestScore) [best, bestScore] = [k, score];
  });
  return best;
}

// Standard questions answered straight from the profile, without AI.
export function profileAnswer(field, p) {
  const l = norm(field.label);
  // Only free-text boxes: a Yes/No group can sit under a "Phone" label too.
  if (!l || !["text", "textarea", "combobox"].includes(field.kind)) return "";
  const full = [p.first_name, p.last_name].filter(Boolean).join(" ");
  const rules = [
    [/\b(first|given) name\b|\bpreferred (first )?name\b/, p.first_name],
    [/\b(last|family) name\b|\bsurname\b/, p.last_name],
    [/^(your )?(full |legal )?name$/, full],
    [/\be ?mail\b/, p.email],
    [/\b(phone|mobile)\b(?! country)/, p.phone],
    [/\blinkedin\b/, p.linkedin],
    [/\bgithub\b/, p.github],
    [/\bportfolio\b|\bpersonal (web ?)?site\b|^website$|^other website$/, p.portfolio],
    [/^(current )?(company|employer|organi[sz]ation)$|\bcurrent (company|employer)\b/, p.current_company],
    [/^(current )?(job )?title$|\bcurrent (title|role|position)\b/, p.current_title],
    [/^(current )?location( city)?$|^city$|where are you (currently )?(located|based)/, p.location],
  ];
  for (const [re, value] of rules) if (re.test(l)) return value || "";
  return "";
}

async function aiAnswers(runAgy, fields, ctx) {
  if (!fields.length) return {};
  const schema = {
    type: "object",
    properties: {
      answers: {
        type: "array",
        items: {
          type: "object",
          properties: { id: { type: "string" }, value: { type: "string" } },
          required: ["id", "value"],
        },
      },
    },
    required: ["answers"],
  };
  const list = fields.map((f) => ({
    id: f.id,
    question: clip(f.label, 400),
    ...(f.hint ? { details: clip(f.hint, 500) } : {}),
    type: f.kind,
    required: f.required,
    // Long lists (countries…) are searchable: the typed answer filters them.
    ...(f.options?.length && f.options.length <= 80 ? { options: f.options.map((o) => clip(o, 160)) } : {}),
    ...(f.options?.length > 80 ? { note: `searchable list of ${f.options.length} options, e.g. ${f.options.slice(0, 5).join(" / ")}` } : {}),
  }));
  const out = await runAgy(
    `You are filling a job application form for the candidate (${clip(ctx.job.role, 160)} at ${clip(ctx.job.company, 120)}). ` +
      `Answer every question below as the candidate.\n` +
      `Rules:\n` +
      `- Use only facts from the profile, resume and notes. Never invent employers, degrees, dates, numbers or skills.\n` +
      `- If the answer is not known from them, return "" so the candidate fills it in.\n` +
      `- Questions with options: answer with the exact text of one option. Checkbox groups that allow several: join option texts with " || ".\n` +
      `- Voluntary self-identification / EEO / demographic questions (gender, race, ethnicity, veteran, disability, sexual orientation, pronouns): ` +
      `pick the option that declines to answer ("Decline to self-identify", "I don't wish to answer", …); if there is none, "".\n` +
      `- Work authorization, visa sponsorship, relocation, notice period, start date, salary, years of experience: use the profile; "" if it isn't there.\n` +
      `- "How did you hear about us": the profile's heard_from, else "".\n` +
      `- Consent checkboxes needed to apply (privacy policy, data processing, accuracy of information): tick them. Never tick marketing or newsletter opt-ins.\n` +
      `- Legal agreements that waive rights (arbitration, class-action waivers, non-competes): "" (the candidate decides those).\n` +
      `- Country, city and phone-code questions: infer from the profile location/phone (e.g. "Bengaluru, India" → India).\n` +
      `- Open questions (why this company/role, about you, additional information): 60-150 words, first person, specific to this job, plain text. ` +
      `A cover letter text field: use the provided cover letter if there is one, else write 150-220 words.\n` +
      `- Short fields (URLs, numbers, names) get just the value.\n` +
      `Do not use any tools.\n\n` +
      `<profile>\n${JSON.stringify(ctx.profile)}\n</profile>\n\n` +
      `<job>\n${clip(ctx.job.description, 15000)}\n</job>\n\n` +
      `<resume>\n${clip(ctx.resumeText, 12000)}\n</resume>\n\n` +
      (ctx.coverLetter ? `<cover_letter>\n${clip(ctx.coverLetter, 6000)}\n</cover_letter>\n\n` : "") +
      `<questions>\n${JSON.stringify(list)}\n</questions>`,
    schema,
    { effort: "medium", timeoutMs: 240_000 },
  );
  return Object.fromEntries((out.answers || []).map((a) => [String(a.id), String(a.value ?? "")]));
}

// ---------------------------------------------------------------------------
// filling

const sel = (id) => `[data-jt="${id}"]`;

// Comboboxes are opened from the keyboard: overlapping labels and menus often
// swallow mouse clicks. Arrow keys and Escape are safe; Enter is never used.
async function openCombobox(input) {
  await input.focus({ timeout: 3000 });
  await input.press("ArrowDown");
}

async function clickOption(option) {
  await option.click({ timeout: 1500 }).catch(() => option.evaluate((n) => n.click()));
}

async function comboboxOptions(frame, id) {
  const input = frame.locator(sel(id));
  try {
    await openCombobox(input);
    await sleep(450);
    const options = await frame.locator("[role=option]:visible").allTextContents();
    await input.press("Escape");
    return options.map((o) => o.replace(/\s+/g, " ").trim()).filter(Boolean).slice(0, 400);
  } catch {
    return [];
  }
}

async function pickVisibleOption(frame, value, waitMs) {
  const until = Date.now() + waitMs;
  do {
    const options = frame.locator("[role=option]:visible");
    const texts = (await options.allTextContents()).map((t) => t.replace(/\s+/g, " ").trim());
    const i = bestOption(texts, value);
    if (i >= 0) {
      await clickOption(options.nth(i));
      return texts[i];
    }
    await sleep(250);
  } while (Date.now() < until);
  return null;
}

async function fillField(frame, f, value) {
  const el = frame.locator(sel(f.id));
  switch (f.kind) {
    case "text":
    case "textarea":
      await el.fill(value, { timeout: 5000 });
      // Location boxes (Lever, Google Places) want a suggestion picked from their own list.
      if (/location|city/i.test(f.label)) {
        const until = Date.now() + 3500;
        while (Date.now() < until) {
          const items = frame.locator("[role=option]:visible, .dropdown-location:visible, .pac-item:visible");
          const texts = (await items.allTextContents()).map((t) => t.replace(/\s+/g, " ").trim());
          if (texts.length) {
            const i = Math.max(0, bestOption(texts, value));
            await items.nth(i).click({ timeout: 3000 }).catch(() => {});
            return texts[i];
          }
          await sleep(250);
        }
      }
      return value;
    case "select": {
      const i = bestOption(f.options, value);
      if (i < 0) return null;
      await el.selectOption({ label: f.options[i] }, { timeout: 5000 });
      return f.options[i];
    }
    case "combobox": {
      // Search boxes for places often only know the city: "Bengaluru, India" → "Bengaluru".
      const tries = [...new Set([value, value.split(",")[0].trim()])].filter(Boolean);
      for (const typed of tries) {
        await openCombobox(el);
        await el.fill("");
        await el.pressSequentially(clip(typed, 40), { delay: 25 });
        const picked = await pickVisibleOption(frame, value, f.options?.length ? 1500 : 4000);
        if (picked) return picked;
      }
      await el.fill("").catch(() => {});
      await el.press("Escape").catch(() => {});
      return null;
    }
    case "radio":
    case "checkbox":
    case "buttons": {
      const wanted = f.kind === "checkbox" ? value.split("||").map((s) => s.trim()).filter(Boolean) : [value];
      const picked = [];
      for (const w of wanted) {
        let i = bestOption(f.options, w);
        // A lone consent checkbox answered "yes"/"true".
        if (i < 0 && f.options.length === 1 && /^(yes|true|checked|agree|i agree)$/i.test(w)) i = 0;
        if (i < 0) continue;
        const opt = frame.locator(sel(f.optionIds[i]));
        if (f.kind === "buttons") await clickOption(opt);
        else await opt.check({ force: true, timeout: 4000 }).catch(() => opt.evaluate((n) => n.click()));
        picked.push(f.options[i]);
      }
      return picked.length ? picked.join(", ") : null;
    }
    default:
      return null;
  }
}

// ---------------------------------------------------------------------------
// runs

export function createApplier({ runAgy, headless = false, profileDir = join(homedir(), ".config/jobtrail/browser") } = {}) {
  const runs = new Map();
  let contextPromise = null;

  async function browser() {
    if (!contextPromise) {
      const executablePath = BROWSERS.find((p) => existsSync(p));
      mkdirSync(profileDir, { recursive: true });
      contextPromise = chromium
        .launchPersistentContext(profileDir, {
          headless,
          executablePath,
          channel: executablePath ? undefined : "chrome",
          viewport: headless ? { width: 1280, height: 900 } : null,
          args: headless ? [] : ["--window-size=1280,1000"],
        })
        .then((ctx) => {
          ctx.on("close", () => (contextPromise = null));
          return ctx;
        })
        .catch((e) => {
          contextPromise = null;
          throw new Error(`Couldn't open a browser (${clip(e.message, 160)}). Set JOBTRAIL_BROWSER to Chrome/Chromium.`);
        });
    }
    return contextPromise;
  }

  // The frame holding the form: the page itself, or an embedded Greenhouse iframe.
  async function formFrame(page, waitMs = 25_000) {
    const until = Date.now() + waitMs;
    while (Date.now() < until) {
      let best = null;
      let bestScore = 0;
      for (const frame of page.frames()) {
        const count = await frame
          .evaluate(() => document.querySelectorAll("input:not([type=hidden]), textarea, select").length)
          .catch(() => 0);
        if (count < 3) continue;
        // An embedded Greenhouse/Lever/Ashby form beats the host page's search boxes.
        const score = count + (/greenhouse\.io|lever\.co|ashbyhq\.com/.test(frame.url()) ? 1000 : 0);
        if (score > bestScore) [best, bestScore] = [frame, score];
      }
      if (best) return best;
      await sleep(600);
    }
    throw new Error("Couldn't find an application form on that page");
  }

  function publicRun(r) {
    return {
      id: r.id,
      state: r.state,
      ats: r.ats,
      url: r.url,
      steps: r.steps,
      filled: r.filled,
      needs: r.needs,
      error: r.error,
    };
  }

  async function fill(run, input) {
    const step = (text) => run.steps.push({ at: Date.now(), text });
    const ctx = await browser();
    const page = await ctx.newPage();
    run.page = page;
    page.on("close", () => {
      if (run.state !== "submitted") run.state = "closed";
      clearInterval(run.watch);
    });

    step(`Opening the ${run.ats === "other" ? "application" : run.ats[0].toUpperCase() + run.ats.slice(1)} form`);
    await page.goto(run.url, { waitUntil: "domcontentloaded", timeout: 45_000 });
    let frame = await formFrame(page);
    // A form embedded in a company careers page is often hidden until "Apply"
    // is clicked. Open the embedded form on its own instead.
    if (frame !== page.mainFrame() && /greenhouse\.io|lever\.co|ashbyhq\.com/.test(frame.url())) {
      step("Opening the embedded form directly");
      await page.goto(frame.url(), { waitUntil: "domcontentloaded", timeout: 45_000 });
      frame = await formFrame(page);
    }
    if (!headless) await page.bringToFront();
    // Let the page's scripts finish wiring the form up; earlier input is silently lost.
    await page.waitForLoadState("load", { timeout: 20_000 }).catch(() => {});
    await sleep(1500);

    // Files first: Lever and Ashby parse the resume and overwrite fields with what they find.
    const dir = mkdtempSync(join(tmpdir(), "jobtrail-apply-"));
    run.cleanup = () => rmSync(dir, { recursive: true, force: true });
    const resumePath = join(dir, (input.resume.name || "resume").replace(/[^\w.\- ]+/g, "_").replace(/(\.pdf)?$/i, ".pdf"));
    writeFileSync(resumePath, Buffer.from(input.resume.base64, "base64"));
    let fields = await frame.evaluate(scanForm);
    const files = fields.filter((f) => f.kind === "file");
    const resumeInput = files.find((f) => /resume|cv\b/i.test(f.label)) || (files.length === 1 ? files[0] : null);
    if (resumeInput) {
      step("Attaching your resume");
      const fileName = resumePath.split(/[\\/]/).pop();
      const attached = () =>
        frame
          .evaluate(
            ({ id, name }) => {
              const el = document.querySelector(`[data-jt="${id}"]`);
              return (el?.files?.length ?? 0) > 0 || document.body.innerText.includes(name);
            },
            { id: resumeInput.id, name: fileName },
          )
          .catch(() => false);
      let ok = false;
      for (let attempt = 0; attempt < 2 && !ok; attempt++) {
        await frame.setInputFiles(sel(resumeInput.id), resumePath);
        for (let t = 0; t < 16 && !ok; t++) {
          await sleep(500);
          ok = await attached();
        }
      }
      if (ok) run.filled.push({ label: "Resume", value: input.resume.name });
      else run.needs.push("Resume upload");
      await sleep(1500);
    } else {
      run.needs.push("Resume upload");
    }
    const coverInput = files.find((f) => /cover/i.test(f.label));
    if (coverInput && input.coverLetter) {
      const coverPath = join(dir, "Cover letter.txt");
      writeFileSync(coverPath, input.coverLetter);
      await frame.setInputFiles(sel(coverInput.id), coverPath).catch(() => {});
      run.filled.push({ label: "Cover letter", value: "attached" });
    }

    // Re-read: uploads and parsing can add or change fields.
    frame = await formFrame(page, 10_000);
    fields = (await frame.evaluate(scanForm)).filter((f) => f.kind !== "file" && f.label);
    for (const f of fields) if (f.kind === "combobox" && !f.options) f.options = await comboboxOptions(frame, f.id);

    const answers = {};
    for (const f of fields) {
      const v = profileAnswer(f, input.profile);
      if (v) answers[f.id] = v;
    }
    const rest = fields.filter((f) => !answers[f.id]);
    if (rest.length) {
      step(`Answering ${rest.length} question${rest.length === 1 ? "" : "s"} with AI`);
      try {
        Object.assign(
          answers,
          await aiAnswers(runAgy, rest, {
            profile: input.profile,
            job: input.job,
            resumeText: input.resumeText,
            coverLetter: input.coverLetter,
          }),
        );
      } catch (e) {
        step(`AI couldn't answer (${clip(e.message, 120)}); those are left for you`);
      }
    }

    step("Filling the form");
    const empty = [];
    for (const f of fields) {
      const value = answers[f.id];
      let done = null;
      let problem = "";
      if (value) done = await fillField(frame, f, value).catch((e) => ((problem = e.message), null));
      run.log.push({ label: clip(f.label, 80), kind: f.kind, before: clip(f.value, 60), answer: clip(value, 80), done: clip(done, 60), problem: clip(problem, 160) });
      if (done) run.filled.push({ label: clip(f.label, 140), value: clip(done, 160) });
      else if ((f.required && !f.value) || (value && !f.value)) {
        run.needs.push(clip(f.label, 140));
        empty.push(f.id);
      }
    }

    await frame.evaluate(markEmpty, empty).catch(() => {});
    await frame.evaluate(showBanner, { filled: run.filled.length, needs: run.needs }).catch(() => {});
    await frame.evaluate(findSubmit).catch(() => false);
    run.state = "review";
    const n = run.needs.length;
    step(n ? `Done. ${n} field${n === 1 ? " needs" : "s need"} you, then click Submit` : "Done. Review it and click Submit");

    // Notice when the user submits (confirmation page or message).
    run.watch = setInterval(async () => {
      if (page.isClosed()) return clearInterval(run.watch);
      try {
        const hit = await Promise.any(
          page.frames().map(async (fr) => {
            const text = await fr.evaluate(() => document.body?.innerText?.slice(0, 20000) || "");
            if (CONFIRMATION.test(text) || /\/(thanks|confirmation|submitted)\b/i.test(fr.url())) return true;
            throw new Error("no");
          }),
        );
        if (hit) {
          run.state = "submitted";
          step("Application submitted");
          clearInterval(run.watch);
        }
      } catch {
        // not yet
      }
    }, 2000);
  }

  return {
    start(input) {
      let url;
      try {
        url = new URL(input.url);
      } catch {
        throw new Error("This application has no valid job link");
      }
      if (!/^https?:$/.test(url.protocol)) throw new Error("Only http(s) links");
      if (/^(localhost|127\.|10\.|192\.168\.|172\.(1[6-9]|2\d|3[01])\.|0\.|\[?::1\]?$)/i.test(url.hostname)) {
        throw new Error("Local network addresses aren't allowed");
      }
      if (!input.resume?.base64) throw new Error("Pick a resume first");
      const ats = detectAts(url);
      const run = {
        id: randomUUID(),
        state: "filling",
        ats,
        url: formUrl(url, ats),
        steps: [],
        filled: [],
        needs: [],
        log: [],
        error: null,
        created: Date.now(),
      };
      runs.set(run.id, run);
      for (const [id, old] of runs) if (Date.now() - old.created > 3 * 3600_000) runs.delete(id);
      run.done = fill(run, input)
        .catch((e) => {
          run.state = "error";
          run.error = clip(e.message, 300);
          run.steps.push({ at: Date.now(), text: `Stopped: ${run.error}` });
        })
        .finally(() => setTimeout(() => run.cleanup?.(), 60_000));
      return publicRun(run);
    },
    status(id) {
      const run = runs.get(id);
      return run ? publicRun(run) : null;
    },
    run(id) {
      return runs.get(id);
    },
    async close() {
      for (const r of runs.values()) clearInterval(r.watch);
      if (contextPromise) await (await contextPromise).close().catch(() => {});
    },
  };
}

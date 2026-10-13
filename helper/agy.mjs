// Runs the Antigravity CLI (`agy -p`) with a JSON schema and returns its
// structured output.

import { execFile } from "node:child_process";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const AGY = process.env.AGY_BIN || `${process.env.HOME}/.local/bin/agy`;
export const MODEL = process.env.AGY_MODEL || "";

let busy = 0;
export const agyBusy = () => busy;

export function runAgy(prompt, schema, { effort = "low", timeoutMs = 150_000 } = {}) {
  // Empty scratch workspace so the agent has nothing to poke at.
  const cwd = mkdtempSync(join(tmpdir(), "jobtrail-agy-"));
  const args = [
    "-p", prompt,
    "--output-format", "json",
    "--json-schema", JSON.stringify(schema),
    "--disable-slash-commands",
    "--effort", effort,
  ];
  if (MODEL) args.push("--model", MODEL);
  busy++;
  return new Promise((resolve, reject) => {
    execFile(AGY, args, { cwd, timeout: timeoutMs, maxBuffer: 8 * 1024 * 1024 }, (err, stdout, stderr) => {
      busy--;
      rmSync(cwd, { recursive: true, force: true });
      if (err) {
        reject(new Error(err.killed ? "Antigravity took too long" : (stderr || err.message).trim().slice(0, 500)));
        return;
      }
      try {
        const out = JSON.parse(stdout);
        if (out.status !== "SUCCESS" || !out.structured_output) {
          reject(new Error(`Antigravity returned ${out.status || "no result"}`));
          return;
        }
        resolve(out.structured_output);
      } catch {
        reject(new Error("Couldn't parse Antigravity output"));
      }
    });
  });
}


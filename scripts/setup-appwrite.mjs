#!/usr/bin/env node
// Creates (or completes) Jobtrail's Appwrite database, tables, indexes and the
// resume bucket. Safe to re-run: existing pieces are skipped.
//   node --env-file=.env.local scripts/setup-appwrite.mjs

import { Client, Permission, Role, Storage, TablesDB } from "node-appwrite";

const { APPWRITE_ENDPOINT, APPWRITE_PROJECT_ID, APPWRITE_API_KEY } = process.env;
if (!APPWRITE_ENDPOINT || !APPWRITE_PROJECT_ID || !APPWRITE_API_KEY) {
  console.error("Set APPWRITE_ENDPOINT, APPWRITE_PROJECT_ID and APPWRITE_API_KEY in .env.local first.");
  process.exit(1);
}

const client = new Client().setEndpoint(APPWRITE_ENDPOINT).setProject(APPWRITE_PROJECT_ID).setKey(APPWRITE_API_KEY);
const db = new TablesDB(client);
const storage = new Storage(client);
const DB = "jobtrail";

const exists = (e) => e?.code === 409;

async function step(label, fn) {
  try {
    await fn();
    console.log(`  ✓ ${label}`);
  } catch (e) {
    if (exists(e)) console.log(`  · ${label} (already there)`);
    else throw new Error(`${label}: ${e.message}`);
  }
}

// Rows: any signed-in user may create; each row then carries owner-only
// permissions (row security), set by the app.
const tablePermissions = [Permission.create(Role.users())];

const schema = {
  applications: {
    columns: [
      ["varchar", "user_id", { size: 36, required: true }],
      ["varchar", "company", { size: 120, required: true }],
      ["varchar", "role", { size: 160, required: true }],
      ["enum", "status", { elements: ["wishlist", "applied", "interview", "offer", "rejected"], required: false, xdefault: "wishlist" }],
      ["float", "position", { required: false, xdefault: 0 }],
      ["varchar", "location", { size: 120, required: false }],
      ["enum", "work_mode", { elements: ["remote", "hybrid", "onsite"], required: false }],
      ["varchar", "salary", { size: 80, required: false }],
      ["varchar", "job_url", { size: 1000, required: false }],
      ["varchar", "source", { size: 80, required: false }],
      ["longtext", "job_description", { required: false }],
      ["varchar", "resume_id", { size: 36, required: false }],
      ["datetime", "applied_at", { required: false }],
      ["datetime", "follow_up_at", { required: false }],
      ["text", "notes", { required: false }],
      ["text", "ai_match", { required: false }],
      ["text", "cover_letter", { required: false }],
    ],
    indexes: [
      ["status_idx", ["status"]],
      ["position_idx", ["position"]],
      ["resume_idx", ["resume_id"]],
    ],
  },
  resumes: {
    columns: [
      ["varchar", "user_id", { size: 36, required: true }],
      ["varchar", "name", { size: 200, required: true }],
      ["varchar", "file_id", { size: 36, required: false }],
      ["longtext", "content", { required: false }],
      ["boolean", "is_default", { required: false, xdefault: false }],
    ],
    indexes: [["default_idx", ["is_default"]]],
  },
  activities: {
    columns: [
      ["varchar", "user_id", { size: 36, required: true }],
      ["varchar", "application_id", { size: 36, required: true }],
      ["varchar", "kind", { size: 20, required: true }],
      ["text", "title", { required: true }],
    ],
    indexes: [["application_idx", ["application_id"]]],
  },
};

const creators = {
  varchar: (p) => db.createVarcharColumn(p),
  text: (p) => db.createTextColumn(p),
  longtext: (p) => db.createLongtextColumn(p),
  enum: (p) => db.createEnumColumn(p),
  float: (p) => db.createFloatColumn(p),
  datetime: (p) => db.createDatetimeColumn(p),
  boolean: (p) => db.createBooleanColumn(p),
};

async function waitForColumns(tableId) {
  for (let i = 0; i < 60; i++) {
    const { columns } = await db.listColumns({ databaseId: DB, tableId });
    if (columns.every((c) => c.status === "available")) return;
    const failed = columns.find((c) => c.status === "failed");
    if (failed) throw new Error(`Column ${tableId}.${failed.key} failed: ${failed.error}`);
    await new Promise((r) => setTimeout(r, 1000));
  }
  throw new Error(`Columns on ${tableId} never became available`);
}

console.log(`Appwrite project ${APPWRITE_PROJECT_ID}`);
await step("database jobtrail", () => db.create({ databaseId: DB, name: "Jobtrail" }));

for (const [tableId, def] of Object.entries(schema)) {
  console.log(`\n${tableId}`);
  await step(`table ${tableId}`, () =>
    db.createTable({ databaseId: DB, tableId, name: tableId, permissions: tablePermissions, rowSecurity: true }),
  );
  for (const [type, key, opts] of def.columns) {
    await step(`column ${key}`, () => creators[type]({ databaseId: DB, tableId, key, ...opts }));
  }
  await waitForColumns(tableId);
  for (const [key, columns] of def.indexes) {
    await step(`index ${key}`, () => db.createIndex({ databaseId: DB, tableId, key, type: "key", columns }));
  }
}

console.log("\nstorage");
await step("bucket resumes", () =>
  storage.createBucket({
    bucketId: "resumes",
    name: "Resumes",
    permissions: [Permission.create(Role.users())],
    fileSecurity: true,
    maximumFileSize: 5_000_000,
    allowedFileExtensions: ["pdf"],
  }),
);

console.log("\nDone.");

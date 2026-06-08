#!/usr/bin/env node
// Upsert an authenticated user into the gitignored frontend/dev-users.json.
// Keyed by email so re-authenticating the same person updates their token in place.
// Usage: node scripts/append-dev-user.mjs <email> <token>

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const usersFile = path.resolve(__dirname, '../frontend/dev-users.json');

const [, , email, token] = process.argv;
if (!email || !token) {
  console.error('usage: append-dev-user.mjs <email> <token>');
  process.exit(1);
}

function decodeName(jwt) {
  try {
    const seg = jwt.split('.')[1].replace(/-/g, '+').replace(/_/g, '/');
    const payload = JSON.parse(Buffer.from(seg, 'base64').toString('utf8'));
    return typeof payload.name === 'string' ? payload.name : email;
  } catch {
    return email;
  }
}

let users = [];
try {
  const parsed = JSON.parse(fs.readFileSync(usersFile, 'utf8'));
  if (Array.isArray(parsed)) users = parsed;
} catch {
  /* no file yet → start fresh */
}

const entry = { name: decodeName(token), email, token };
const idx = users.findIndex((u) => u.email === email);
if (idx >= 0) users[idx] = entry;
else users.push(entry);

fs.writeFileSync(usersFile, `${JSON.stringify(users, null, 2)}\n`);
console.log(`✓ dev-users.json: ${idx >= 0 ? 'updated' : 'added'} ${email}`);

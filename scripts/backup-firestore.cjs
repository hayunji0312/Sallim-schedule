'use strict';

// READ-ONLY backup. Run in a trusted local terminal or Google Cloud Shell.
// Requires FIREBASE_PROJECT_ID and Application Default Credentials (ADC).
// Cloud Shell generally supplies ADC without downloading a service-account key.
// Backups contain all private data, including plaintext legacy passwords.
const admin = require('firebase-admin');
const fs = require('node:fs/promises');
const path = require('node:path');
const crypto = require('node:crypto');

const projectId = process.env.FIREBASE_PROJECT_ID;
if (!projectId) {
  throw new Error('Set FIREBASE_PROJECT_ID before running (e.g. salim-schedule).');
}
admin.initializeApp({ credential: admin.credential.applicationDefault(), projectId });
const db = admin.firestore();

function serialize(value) {
  if (value === null || typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') return value;
  if (value instanceof admin.firestore.Timestamp) return { __firestoreType: 'timestamp', seconds: value.seconds, nanoseconds: value.nanoseconds };
  if (value instanceof admin.firestore.GeoPoint) return { __firestoreType: 'geopoint', latitude: value.latitude, longitude: value.longitude };
  if (value instanceof admin.firestore.DocumentReference) return { __firestoreType: 'reference', path: value.path };
  if (Buffer.isBuffer(value) || value instanceof Uint8Array) return { __firestoreType: 'bytes', base64: Buffer.from(value).toString('base64') };
  if (Array.isArray(value)) return value.map(serialize);
  if (typeof value === 'object') {
    const out = {};
    for (const [key, entry] of Object.entries(value)) out[key] = serialize(entry);
    return out;
  }
  throw new Error('Unsupported Firestore value: ' + typeof value);
}

async function collectCollection(collection, output) {
  const snapshots = await collection.listDocuments();
  for (const ref of snapshots) {
    const snapshot = await ref.get();
    if (snapshot.exists) {
      output.push({ path: ref.path, data: serialize(snapshot.data()), updateTime: snapshot.updateTime.toDate().toISOString() });
    }
    for (const child of await ref.listCollections()) await collectCollection(child, output);
  }
}

async function main() {
  const output = [];
  for (const col of await db.listCollections()) await collectCollection(col, output);
  const payload = {
    format: 'sallim-firestore-json-v1',
    projectId,
    createdAt: new Date().toISOString(),
    documentCount: output.length,
    documents: output
  };
  const dirname = path.resolve('backups');
  await fs.mkdir(dirname, { recursive: true, mode: 0o700 });
  const filename = path.join(dirname, 'firestore-' + new Date().toISOString().replace(/[:.]/g, '-') + '.json');
  await fs.writeFile(filename, JSON.stringify(payload, null, 2), { mode: 0o600, flag: 'wx' });
  const sum = crypto.createHash('sha256').update(await fs.readFile(filename)).digest('hex');
  console.log('Saved ' + output.length + ' documents to ' + filename);
  console.log('SHA256 ' + sum);
  console.log('Contains sensitive data. Keep this backup private and offline.');
}

main().catch(error => { console.error(error); process.exitCode = 1; });

import 'dotenv/config';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { createServer } from 'node:http';
import test from 'node:test';
import pg from 'pg';
import { loadCloud } from './load-cloud.mjs';

test('Drive SQL pages isolate folders and owners, filter before pagination, and retain home/storage/preview behavior', async () => {
  const owner = randomUUID(), other = randomUUID(), authUrl = process.env.AUTH_URL;
  const rows = [], shares = [];
  const add = (name, options = {}) => {
    const row = { id: randomUUID(), ownerId: owner, kind: 'FILE', parentId: null, size: 10, mimeType: 'text/plain', starred: false, deletedAt: null, updatedAt: '2026-10-04T12:00:00Z', name, ...options }; rows.push(row); return row;
  };
  const folder = add('folder', { kind: 'FOLDER', size: 0, mimeType: null });
  for (let n = 0; n < 125; n++) add(`root-${String(n).padStart(3, '0')}.txt`, { starred: n < 10 });
  for (let n = 0; n < 70; n++) add(`nested-${String(n).padStart(3, '0')}.txt`, { parentId: folder.id });
  const image = add('target.PNG', { parentId: folder.id, mimeType: 'image/png' });
  const literal = add('literal%_.txt');
  const trash = add('trash.txt', { deletedAt: '2026-10-05T00:00:00Z' });
  const privateFile = add('private.txt', { ownerId: other });
  const sharedFolder = add('received', { ownerId: other, kind: 'FOLDER', size: 0 });
  const received = add('received.txt', { ownerId: other, parentId: sharedFolder.id, starred: true });
  shares.push({ itemId: sharedFolder.id, role: 'VIEWER', starred: false }, { itemId: received.id, role: null, starred: true });
  const hiddenFolder = add('hidden', { ownerId: other, kind: 'FOLDER', size: 0, deletedAt: '2026-10-05T00:00:00Z' });
  const hidden = add('hidden.txt', { ownerId: other, parentId: hiddenFolder.id });
  shares.push({ itemId: hidden.id, role: 'EDITOR', starred: false });
  const previewRoot = add('preview', { kind: 'FOLDER', size: 0 });
  const first = add('a.txt', { parentId: previewRoot.id });
  for (let n = 0; n < 60; n++) add(`b-${String(n).padStart(2, '0')}.bin`, { parentId: previewRoot.id, mimeType: 'application/octet-stream' });
  const last = add('z.txt', { parentId: previewRoot.id });
  const auth = createServer((request, response) => {
    response.setHeader('Content-Type', 'application/json');
    if (request.url === '/api/user/uuid') response.end(JSON.stringify({ result: { handle: 'other-user', displayName: 'Other' } }));
    else response.end(JSON.stringify({ result: { id: owner } }));
  });
  await new Promise(resolve => auth.listen(0, '127.0.0.1', resolve));
  process.env.AUTH_URL = `http://127.0.0.1:${auth.address().port}`;
  const db = new pg.Pool({ connectionString: process.env.DATABASE_URL });
  let modules;
  try {
    await db.query(`INSERT INTO "cloud_item" ("id","ownerId","kind","name","parentId","size","mimeType","starred","deletedAt","createdAt","updatedAt")
      SELECT r.id,r."ownerId",r.kind::"CloudItemKind",r.name,r."parentId",r.size,r."mimeType",r.starred,r."deletedAt"::timestamp,'2026-10-01'::timestamp,r."updatedAt"::timestamp
      FROM jsonb_to_recordset($1::jsonb) AS r(id text,"ownerId" text,kind text,name text,"parentId" text,size bigint,"mimeType" text,starred boolean,"deletedAt" text,"updatedAt" text)`, [JSON.stringify(rows)]);
    await db.query('UPDATE "cloud_item" SET "storageOwnerId"="ownerId" WHERE "ownerId"=ANY($1::text[]) AND "kind"=\'FILE\'', [[owner, other]]);
    await db.query('INSERT INTO "cloud_storage" ("userId","usedBytes","updatedAt") SELECT "storageOwnerId",SUM("size"),NOW() FROM "cloud_item" WHERE "ownerId"=ANY($1::text[]) AND "kind"=\'FILE\' GROUP BY "storageOwnerId"', [[owner, other]]);
    for (const share of shares) await db.query('INSERT INTO "cloud_share" ("id","itemId","userId","role","starred","updatedAt") VALUES ($1,$2,$3,$4,$5,NOW())', [randomUUID(), share.itemId, owner, share.role, share.starred]);
    modules = await loadCloud();
    const get = async (params = {}, handler = modules.drive.listDrivePage) => {
      const response = await modules.cloud.cloudResponse(() => handler(new Request(`http://localhost/api/drive?${new URLSearchParams(params)}`, { headers: { Cookie: 'session_id=test' } })));
      const data = await response.json(); assert.equal(response.status, 200, JSON.stringify(data)); return data;
    };
    const root = await get({ sort: 'name' });
    assert.equal(root.items.length, 50); assert.equal(root.total, 128);
    assert.ok(root.items.every(item => item.parentId === null));
    assert.ok(!root.items.some(item => item.id === privateFile.id || item.id === received.id || item.id === trash.id));
    const second = await get({ sort: 'name', offset: '50' });
    assert.ok(!second.items.some(item => root.items.some(first => first.id === item.id)));
    const nested = await get({ parentId: folder.id, sort: 'name' });
    assert.equal(nested.total, 71); assert.equal(nested.items.length, 50); assert.deepEqual(nested.path, [folder.id]);
    assert.equal(nested.context.length, 1);
    const pictures = await get({ parentId: folder.id, kind: 'image' }); assert.deepEqual(pictures.items.map(item => item.id), [image.id]);
    const search = await get({ scope: 'all', q: 'nested-06' }); assert.equal(search.total, 10);
    const escaped = await get({ scope: 'all', q: '%_' }); assert.deepEqual(escaped.items.map(item => item.id), [literal.id]);
    const receivedPage = await get({ area: 'shared' }); assert.deepEqual(receivedPage.items.map(item => item.id), [sharedFolder.id]);
    const sharedChildren = await get({ parentId: sharedFolder.id }); assert.equal(sharedChildren.items[0].permission, 'VIEWER');
    const stars = await get({ area: 'starred' }); assert.equal(stars.total, 11); assert.ok(stars.items.some(item => item.id === received.id && item.starred));
    const trashed = await get({ area: 'trash' }); assert.deepEqual(trashed.items.map(item => item.id), [trash.id]);
    const home = await get({ area: 'home' }); assert.ok(home.items.length <= 19); assert.equal(new Set(home.items.map(item => item.id)).size, home.items.length);
    const storage = await get({}, modules.drive.driveStorage); assert.equal(storage.bytes, rows.filter(row => row.ownerId === owner && row.kind === 'FILE').reduce((sum, row) => sum + row.size, 0));
    const next = await get({ itemId: first.id, sort: 'name' }, modules.drive.drivePreviewNeighbors); assert.equal(next.next.id, last.id); assert.equal(next.previous, null);
    const previous = await get({ itemId: last.id, sort: 'name' }, modules.drive.drivePreviewNeighbors); assert.equal(previous.previous.id, first.id);
    const wrong = await modules.cloud.cloudResponse(() => modules.drive.listDrivePage(new Request(`http://localhost/api/drive?parentId=${hiddenFolder.id}`, { headers: { Cookie: 'session_id=test' } }))); assert.equal(wrong.status, 404);
    const invalid = await modules.cloud.cloudResponse(() => modules.drive.listDrivePage(new Request('http://localhost/api/drive?limit=1000', { headers: { Cookie: 'session_id=test' } }))); assert.equal(invalid.status, 400);
  } finally {
    await db.query('UPDATE "cloud_item" SET "parentId"=NULL WHERE "ownerId"=ANY($1::text[])', [[owner, other]]);
    await db.query('DELETE FROM "cloud_item" WHERE "ownerId"=ANY($1::text[])', [[owner, other]]);
    await db.query('DELETE FROM "cloud_storage" WHERE "userId"=ANY($1::text[])', [[owner, other]]);
    await db.end(); if (modules) { await modules.db.prismaSetting.$disconnect(); await modules.db.pool.end(); }
    await new Promise(resolve => auth.close(resolve));
    if (authUrl === undefined) delete process.env.AUTH_URL; else process.env.AUTH_URL = authUrl;
  }
});

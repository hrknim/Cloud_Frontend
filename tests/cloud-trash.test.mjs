import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { readFile, writeFile, mkdir, stat, unlink } from 'node:fs/promises';
import path from 'node:path';
import test from 'node:test';
import ts from 'typescript';
const url = source => `data:text/javascript;base64,${Buffer.from(source).toString('base64')}`;
async function compile(relative, replacements = {}) {
  const { outputText } = ts.transpileModule(await readFile(new URL(relative, import.meta.url), 'utf8'), { compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 } });
  return url(outputText.replace(/from (["'])([^"']+)\1/g, (_match, _quote, specifier) => `from ${JSON.stringify(replacements[specifier] || replacements[specifier.replace('@/lib/', '../')] || import.meta.resolve(specifier))}`));
}
const mock = url(`
export const rows = new Map(), grants = new Map();
export let failDelete = false;
export const failNextDelete = () => { failDelete = true; };
const matches = (row, where) => Object.entries(where).every(([key,value]) => value && typeof value === 'object' && 'in' in value ? value.in.includes(row[key]) : row[key] === value);
export const prismaSetting = { cloud_item: {
  findFirst: async ({where}) => [...rows.values()].find(row => matches(row, where)) || null,
  findMany: async ({where}) => [...rows.values()].filter(row => matches(row,where)),
  findUnique: async ({where}) => rows.get(where.id) || null,
  update: async ({where,data}) => { const next = {...rows.get(where.id),...data}; rows.set(where.id,next); return next; },
  updateMany: async ({where,data}) => { let count=0; for(const row of rows.values()) if(matches(row,where)) {rows.set(row.id,{...row,...data});count++;} return {count}; },
  delete: async ({where}) => { if(failDelete){failDelete=false;throw Error('DB failure');} if([...rows.values()].some(row=>row.parentId===where.id)) throw Error('Restrict'); rows.delete(where.id); grants.delete(where.id); },
}, cloud_share: { findUnique: async ({where}) => grants.get(where.itemId_userId.itemId) || null },
  cloud_link: { deleteMany: async () => ({count:0}) },
  $executeRaw: async () => {},
  $transaction: async callback => { const before = new Map(rows), beforeGrants=new Map(grants); try {return await callback(prismaSetting);} catch(error){rows.clear();for(const pair of before)rows.set(...pair);grants.clear();for(const pair of beforeGrants)grants.set(...pair);throw error;} }
};
export const proxyAuthRequest = async request => Response.json({result:{id:request.headers.get('Cookie') === 'session_id=editor' ? 'editor' : 'owner'}});
`);
const errorUrl = await compile('../lib/server/cloud-error.ts');
const names = await compile('../lib/files/download-names.ts');
const cloud = await import(await compile('../lib/server/cloud.ts', {
  './storage-quota': await compile('../lib/server/storage-quota.ts', {'./cloud-error':errorUrl}),
  './response-stream': await compile('../lib/server/response-stream.ts'),
  './prisma': mock, './auth-proxy': mock, './cloud-error': errorUrl,
  './share-recipient': await compile('../lib/server/share-recipient.ts', {'./cloud-error':errorUrl}),
  './user-profile': await compile('../lib/server/user-profile.ts', {'./cloud-error':errorUrl}),
  './request-origin': await compile('../lib/server/request-origin.ts'), '../files/file-types': await compile('../lib/files/file-types.ts'),
  '../files/http-range': await compile('../lib/files/http-range.ts'), '../files/download-names': names,
  '../files/download-tree': await compile('../lib/files/download-tree.ts', {'./download-names':names}),
}));
const {rows, grants, failNextDelete} = await import(mock);
const item = (name, kind='FOLDER', parentId=null, extra={}) => {
  const row={id:randomUUID(),ownerId:'owner',name,kind,parentId,deletedAt:null,trashBatchId:null,storageKey:null,size:0n,starred:false,...extra}; rows.set(row.id,row); return row;
};
const request = (row, method, body, cookie='owner', permanent=false) => new Request(`http://localhost/api/${row.kind==='FOLDER'?'folders':'files'}/${row.id}${permanent?'?permanent=true':''}`, {method,headers:{Cookie:`session_id=${cookie}`,Origin:'http://localhost','Content-Type':'application/json'},...(body?{body:JSON.stringify(body)}:{})});
const remove = (row, permanent=false, cookie='owner') => cloud.cloudResponse(()=>cloud.deleteCloudItem(request(row,'DELETE',null,cookie,permanent),row.id,row.kind));
const restore = (row, body={restore:true}, cookie='owner') => cloud.cloudResponse(()=>cloud.updateCloudItem(request(row,'PATCH',body,cookie),row.id,row.kind));
test.beforeEach(()=>{rows.clear();grants.clear();});

test('Folder trash and restoration retain hierarchy and leave earlier independent trash deleted', async()=>{
  const root=item('root'), nested=item('nested','FOLDER',root.id), file=item('file','FILE',nested.id);
  const old=item('old','FOLDER',root.id,{deletedAt:new Date(),trashBatchId:randomUUID()});
  const oldFile=item('oldFile','FILE',old.id,{deletedAt:new Date(),trashBatchId:old.trashBatchId});
  assert.equal((await remove(root)).status,204);
  const batch=rows.get(root.id).trashBatchId;
  for(const node of [root,nested,file]){assert.ok(rows.get(node.id).deletedAt);assert.equal(rows.get(node.id).trashBatchId,batch);}
  assert.notEqual(rows.get(old.id).trashBatchId,batch);
  assert.equal((await remove(root)).status,204);
  assert.equal((await restore(root)).status,200);
  for(const node of [root,nested,file])assert.equal(rows.get(node.id).deletedAt,null);
  for(const node of [old,oldFile])assert.ok(rows.get(node.id).deletedAt);
  assert.equal(rows.get(file.id).parentId,nested.id);
});

test('Independent child restore falls back to drive root and does not reappear in the parent', async()=>{
  const root=item('root'), child=item('child','FOLDER',root.id), file=item('file','FILE',child.id);
  await remove(root);
  assert.equal((await restore(child)).status,200);
  assert.equal(rows.get(child.id).parentId,null);assert.equal(rows.get(file.id).deletedAt,null);
  await restore(root);assert.equal(rows.get(child.id).parentId,null);
});

test('Restore resolves root and descendant name conflicts, rejects cycles and forbidden editors', async()=>{
  const root=item('root'), child=item('same.txt','FILE',root.id);
  await remove(root); item('root'); item('same.txt','FILE',root.id);
  const response=await restore(root);assert.equal(response.status,200);
  assert.equal(rows.get(root.id).name,'root (복원 1)');assert.equal(rows.get(child.id).name,'same (복원 1).txt');
  grants.set(root.id,{role:'EDITOR'});
  assert.equal((await remove(root,false,'editor')).status,404);
  assert.equal((await restore(root,{restore:true},'editor')).status,403);
  await remove(root);
  assert.equal((await restore(root,{restore:true,parentId:root.id})).status,400);
});

test('Legacy trash restores only the requested item and corrupted foreign trees are rejected', async()=>{
  const root=item('legacy','FOLDER',null,{deletedAt:new Date()}), child=item('child','FILE',root.id,{deletedAt:new Date()});
  await restore(root);assert.ok(rows.get(child.id).deletedAt);
  item('foreign','FILE',root.id,{ownerId:'other'});
  assert.equal((await remove(root)).status,409);assert.equal(rows.get(root.id).deletedAt,null);
});

test('Purge deletes deepest-first, cascades shares and rolls back staged originals on DB failure', async()=>{
  const root=item('root'), nested=item('nested','FOLDER',root.id), file=item('file','FILE',nested.id,{storageKey:randomUUID()});
  const original=path.resolve('.cloud-storage',file.storageKey);
  await mkdir(path.dirname(original),{recursive:true});await writeFile(original,'original bytes');
  try {
    assert.equal((await remove(root,true)).status,409);
    await remove(root);grants.set(file.id,{role:'VIEWER'});
    failNextDelete();assert.equal((await remove(root,true)).status,503);
    assert.equal(await readFile(original,'utf8'),'original bytes');assert.ok(rows.has(file.id));
    assert.equal((await remove(root,true)).status,204);
    assert.equal(rows.size,0);assert.equal(grants.size,0);
    await assert.rejects(stat(original),{code:'ENOENT'});
  } finally {await unlink(original).catch(()=>{});}
});

test('Purge includes older trash and refuses inconsistent active descendants', async()=>{
  const root=item('root'), old=item('old','FILE',root.id,{deletedAt:new Date()});
  await remove(root);assert.equal((await remove(root,true)).status,204);assert.ok(!rows.has(old.id));
  const bad=item('bad','FOLDER',null,{deletedAt:new Date()});item('active','FILE',bad.id);
  assert.equal((await remove(bad,true)).status,409);assert.ok(rows.has(bad.id));
});

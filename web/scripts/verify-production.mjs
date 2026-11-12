import {createServer} from 'node:http';
import {readFile,readdir,mkdir,writeFile} from 'node:fs/promises';
import {resolve,dirname,extname} from 'node:path';
import {fileURLToPath} from 'node:url';
import assert from 'node:assert/strict';
import {chromium} from '@playwright/test';
const root=resolve(dirname(fileURLToPath(import.meta.url)),'..');
const dist=resolve(root,'dist');const output=resolve(root,'../.local/object-registration');await mkdir(output,{recursive:true});
const mime={'.html':'text/html','.js':'text/javascript','.mjs':'text/javascript','.wasm':'application/wasm','.json':'application/json','.css':'text/css','.svg':'image/svg+xml','.jpg':'image/jpeg','.woff2':'font/woff2'};
const server=createServer(async(req,res)=>{
 try{
  const url=new URL(req.url,'http://localhost');const path=decodeURIComponent(url.pathname);
  // Test runner only: fixture route is not present in the app or built distribution.
  const base=path.startsWith('/__qa_fixture__/')?resolve(root,'tests/fixtures/vision'):dist;
  const relative=path.startsWith('/__qa_fixture__/')?path.slice('/__qa_fixture__/'.length):path.replace(/^\//,'');
  const target=resolve(base,relative+(path.endsWith('/')?'index.html':''));if(!target.startsWith(base+'/'))throw new Error('Invalid path');
  const bytes=await readFile(target);res.writeHead(200,{'Content-Type':mime[extname(target)]??'application/octet-stream','Cache-Control':'no-store'}).end(bytes);
 }catch{res.writeHead(404).end('Not found');}
});
await new Promise(r=>server.listen(0,'127.0.0.1',r));const origin=`http://127.0.0.1:${server.address().port}`;
const browser=await chromium.launch({channel:process.env.CI?undefined:'chrome',headless:true});
try{
 const context=await browser.newContext({viewport:{width:390,height:844}});const page=await context.newPage();const errors=[];const requests=[];
 page.on('pageerror',e=>errors.push(e.message));page.on('request',r=>requests.push({url:r.url(),method:r.method()}));
 await page.goto(origin+'/');await page.getByRole('button',{name:'Continue to object registration'}).waitFor();assert.equal(await page.getByRole('button',{name:'Continue to object registration'}).isDisabled(),true);
 await page.getByRole('link',{name:'Open registration directly'}).click();await page.getByRole('heading',{name:'Register your object.'}).waitFor();await page.getByRole('button',{name:'Start registration',exact:true}).waitFor();
 assert.equal(requests.some(r=>/\/(models|runtime)\//.test(r.url)),false);
 assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true);
 await page.screenshot({path:resolve(output,'production-phone.png'),fullPage:true});
 const assets=await readdir(resolve(dist,'assets'));const workerFile=assets.find(n=>/^inference\.worker-.*\.js$/.test(n));assert.ok(workerFile,'Production worker must be emitted');
 const measurements=await page.evaluate(async(workerPath)=>{
  const worker=new Worker(workerPath,{type:'module'});let id=0;
  const request=(type,bitmap)=>new Promise((resolve,reject)=>{
   const current=++id;
   worker.onerror=()=>reject(new Error('Production worker failed'));
   worker.onmessage=({data})=>{if(data.id!==current||data.type==='progress')return;if(data.type==='error')reject(new Error(data.message));else resolve(data.value);};
   worker.postMessage({id:current,type,bitmap},bitmap?[bitmap]:[]);
  });
  try{
   const start=performance.now();const model=await request('load');const loadMs=performance.now()-start;const scans=[];
   for(const name of ['cup-a-0','cup-a-1','cup-a-2','cup-a-heldout','cup-b','bottle'])scans.push(await request('embed',await createImageBitmap(await(await fetch('/__qa_fixture__/'+name+'.jpg')).blob())));
   const template={schemaVersion:1,id:crypto.randomUUID(),label:'Production fixture cup',createdAt:new Date().toISOString(),model,views:scans.slice(0,3).map(s=>s.vector)};
   await new Promise((resolve,reject)=>{const r=indexedDB.open('accoryn-object-research-v1',1);r.onsuccess=()=>{const db=r.result;const tx=db.transaction('templates','readwrite');tx.objectStore('templates').put(template,'active');tx.oncomplete=()=>{db.close();resolve();};tx.onabort=()=>{db.close();reject(tx.error);};};r.onerror=()=>reject(r.error);});
   return {loadMs,dimensions:scans.map(s=>s.vector.length),norms:scans.map(s=>Math.hypot(...s.vector)),inferenceMs:scans.map(s=>s.inferenceMs)};
  }finally{worker.terminate();}
 },'/assets/'+workerFile);
 assert.deepEqual(measurements.dimensions,[384,384,384,384,384,384]);assert.ok(measurements.norms.every(n=>Math.abs(n-1)<1e-5));
 await page.reload();await page.getByText('Production fixture cup',{exact:true}).waitFor();await page.getByRole('button',{name:'Delete registration',exact:true}).click();await page.getByRole('button',{name:'Yes, delete registration'}).click();await page.getByRole('status').filter({hasText:'Registration deleted'}).waitFor();await page.reload();assert.equal(await page.getByText('Production fixture cup',{exact:true}).count(),0);
 await page.getByRole('button',{name:'Start registration',exact:true}).click();await page.getByRole('button',{name:'Stop and discard unsaved views'}).click();await page.getByRole('status').filter({hasText:'Stopped'}).waitFor();
 await page.setViewportSize({width:1440,height:1000});await page.screenshot({path:resolve(output,'production-desktop.png'),fullPage:true});
 assert.equal(requests.some(r=>!r.url.startsWith(origin)&&!r.url.startsWith('blob:')&&!r.url.startsWith('data:')),false,'No external model/runtime request');
 assert.equal(requests.some(r=>['POST','PUT','PATCH'].includes(r.method)),false,'No image upload');assert.deepEqual(errors,[]);
 const failureContext=await browser.newContext();const failurePage=await failureContext.newPage();await failurePage.route('**/models/**',r=>r.abort('failed'));await failurePage.goto(origin+'/object-registration/');await failurePage.getByRole('button',{name:'Start registration',exact:true}).click();await failurePage.getByRole('alert').filter({hasText:/load.*model/i}).waitFor();await failureContext.close();
 const manifest=JSON.parse(await readFile(resolve(root,'src/object-registration/model-manifest.json'),'utf8'));
 for(const f of manifest.files)assert.equal((await readFile(resolve(dist,'models',manifest.modelDirectory,f.path))).length,f.bytes);
 assert.equal((await readdir(dist)).some(p=>['tests','__qa_fixture__'].includes(p)),false);
 await writeFile(resolve(output,'production-measurements.json'),JSON.stringify(measurements,null,2)+'\n');
 console.log('Production smoke passed: real worker/model inference, direct route/navigation, idle privacy, IndexedDB read/delete, load cancellation/failure, no uploads/external requests.');console.log(JSON.stringify(measurements));
}finally{await browser.close();await new Promise(r=>server.close(r));}

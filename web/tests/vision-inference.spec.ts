import {test,expect} from '@playwright/test';
// Catches a missing/broken shipped inference adapter, bad pooling, CDN fallback and uploads.
test('real DINOv2 worker extracts independent photo embeddings and records actual scores',async({page},testInfo)=>{
 test.setTimeout(180000);
 const writes:string[]=[];const external:string[]=[];
 page.on('request',r=>{if(['POST','PUT','PATCH'].includes(r.method()))writes.push(r.url());if(!r.url().startsWith('http://127.0.0.1:5173')&&!r.url().startsWith('blob:')&&!r.url().startsWith('data:'))external.push(r.url());});
 await page.goto('/tests/harness/vision.html');
 await page.waitForFunction(()=>!!(window as any).vision);
 const output=await page.evaluate(async()=>{
  const v=(window as any).vision;const cold=performance.now();const identity=await v.load();const loadMs=performance.now()-cold;
  const paths=['cup-a-0.jpg','cup-a-1.jpg','cup-a-2.jpg','cup-a-heldout.jpg','cup-b.jpg','bottle.jpg'];
  const images=[];for(const path of paths)images.push(await v.embed('/tests/fixtures/vision/'+path));
  const views=images.slice(0,3).map(x=>x.vector);
  return {identity,loadMs,dimensions:images.map(x=>x.vector.length),norms:images.map(x=>Math.hypot(...x.vector)),results:images.slice(3).map(x=>v.compare(views,x.vector,x.inferenceMs))};
 });
 expect(output.dimensions).toEqual([384,384,384,384,384,384]);
 for(const norm of output.norms)expect(Math.abs(norm-1)).toBeLessThan(1e-5);
 for(const result of output.results){expect(result.inferenceMs).toBeGreaterThan(0);expect(Number.isFinite(result.topTwoMean)).toBe(true);expect(result.topTwoMean).toBeGreaterThanOrEqual(-1);expect(result.topTwoMean).toBeLessThanOrEqual(1);}
 expect(writes).toEqual([]);expect(external).toEqual([]);
 await testInfo.attach('actual-photo-measurements',{body:JSON.stringify(output,null,2),contentType:'application/json'});
 console.log('VISION_MEASUREMENTS',JSON.stringify(output));
});
test('canceling a real worker load rejects rather than yielding ready',async({page})=>{
 await page.goto('/tests/harness/vision.html');await page.waitForFunction(()=>!!(window as any).vision);
 expect(await page.evaluate(()=>(window as any).vision.cancelLoad())).toBe('AbortError');
});
test('a real asset network failure is reported without a successful substitute',async({page})=>{
 await page.route('**/models/**',r=>r.abort('failed'));
 await page.goto('/tests/harness/vision.html');await page.waitForFunction(()=>!!(window as any).vision);
 const message=await page.evaluate(async()=>{try{await(window as any).vision.load();return 'unexpected success';}catch(e){return (e as Error).message;}});
 expect(message).not.toBe('unexpected success');expect(message).toMatch(/load|model|fetch|file|network/i);
});

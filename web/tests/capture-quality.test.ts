import { test } from 'node:test';
import assert from 'node:assert/strict';
import { assessQuality, centerSquare } from '../src/object-registration/capture-quality.ts';
const flat = (level: number) => Uint8ClampedArray.from(Array.from({length:256*256*4},(_,i)=> i%4 === 3 ? 255 : level));
// Catches capturing a different region than the visible centered guide.
test('center crop respects portrait and landscape dimensions',()=>{
 assert.deepEqual(centerSquare(640,480),{sx:80,sy:0,size:480});
 assert.deepEqual(centerSquare(480,640),{sx:0,sy:80,size:480});
 assert.throws(()=>centerSquare(0,480));
});
// Catches persisting unusable blank captures; these are image heuristics, not object recognition.
test('quality gate rejects invalid, dark, blown and flat crops',()=>{
 assert.equal(assessQuality(new Uint8ClampedArray(),0,0).reason,'invalid');
 assert.equal(assessQuality(flat(0),256,256).reason,'dark');
 assert.equal(assessQuality(flat(255),256,256).reason,'bright');
 assert.equal(assessQuality(flat(128),256,256).reason,'blur');
 const texture=flat(64);
 for(let y=0;y<256;y++)for(let x=0;x<256;x++)if((Math.floor(x/8)+Math.floor(y/8))%2)for(let c=0;c<3;c++)texture[(y*256+x)*4+c]=192;
 assert.deepEqual(assessQuality(texture,256,256),{ok:true,reason:null});
});

import {test} from 'node:test';
import assert from 'node:assert/strict';
import manifest from '../src/object-registration/model-manifest.json' with {type:'json'};
import {validateTemplate} from '../src/object-registration/template-store.ts';
const vector=Array.from({length:384},(_,i)=>i===0?1:0);
const valid=()=>({schemaVersion:1,id:'c78b1664-1fd2-412e-b5c8-2d89dc87c503',label:'Research cup',createdAt:'2026-11-12T00:00:00.000Z',model:{...manifest.identity},views:[vector.slice(),vector.slice(),vector.slice()]});
// Schema vectors are hand-derived; these tests do not establish visual matching accuracy.
test('template validation accepts only complete compatible normalized records',()=>{
 assert.deepEqual(validateTemplate(valid()),valid());
 for(const changed of [
  {...valid(),schemaVersion:2},{...valid(),views:[vector]},{...valid(),label:''},{...valid(),label:'a'.repeat(61)},
  {...valid(),createdAt:'yesterday'},{...valid(),id:'not-a-uuid'},{...valid(),photo:'data:image/jpeg;base64,private'},
  {...valid(),model:{...manifest.identity,revision:'different'}},
  {...valid(),model:{...manifest.identity,processorSha256:'different'}},
  {...valid(),model:{...manifest.identity,runtimeVersion:'different'}},
  {...valid(),views:[vector.slice(1),vector,vector]},
  {...valid(),views:[Array(384).fill(0),vector,vector]},
  {...valid(),views:[vector.map((x,i)=>i===0?NaN:x),vector,vector]},
 ])assert.throws(()=>validateTemplate(changed));
});

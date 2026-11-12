import type { Embedding, Comparison, ObjectTemplate } from './types.ts';
export function normalizeEmbedding(values:ArrayLike<number>):Embedding {
 if(values.length!==384)throw new Error('Invalid image embedding dimensions.');
 const vector=Array.from(values);
 if(!vector.every(Number.isFinite))throw new Error('Invalid image embedding values.');
 const norm=Math.hypot(...vector);
 if(!Number.isFinite(norm)||norm<1e-12)throw new Error('Empty image embedding.');
 return vector.map(v=>v/norm);
}
export function compareEmbeddings(views:ObjectTemplate['views'],candidate:Embedding,inferenceMs:number):Comparison {
 if(views.length!==3||!Number.isFinite(inferenceMs)||inferenceMs<0)throw new Error('Invalid comparison input.');
 const normalized=normalizeEmbedding(candidate);
 const scores=views.map(view=>Math.max(-1,Math.min(1,normalizeEmbedding(view).reduce((sum,value,i)=>sum+value*normalized[i],0)))) as Comparison['scores'];
 const sorted=[...scores].sort((a,b)=>b-a);
 return {scores,topTwoMean:(sorted[0]+sorted[1])/2,inferenceMs};
}

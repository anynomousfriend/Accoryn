import type {EmbeddingResult,ModelIdentity} from './types.ts';
/** One operation at a time. Cancel terminates inference, not just its UI. */
export class InferenceClient {
 private worker:Worker|null=null;private nextId=0;private pending:{id:number;reject:(e:Error)=>void;cleanup:()=>void}|null=null;
 private ready:ModelIdentity|null=null;
 private request<T>(type:'load'|'embed',signal:AbortSignal,onProgress?:(loaded:number,total:number|null)=>void,bitmap?:ImageBitmap):Promise<T>{
  if(signal.aborted){bitmap?.close();return Promise.reject(new DOMException('Operation canceled.','AbortError'));}
  if(this.pending){bitmap?.close();return Promise.reject(new Error('Image processing is already running.'));}
  return new Promise((resolve,reject)=>{
   try{this.worker??=new Worker(new URL('./inference.worker.ts',import.meta.url),{type:'module'});}catch(e){bitmap?.close();reject(e);return;}
   const worker=this.worker;const id=++this.nextId;
   const abort=()=>this.dispose();
   const cleanup=()=>signal.removeEventListener('abort',abort);
   this.pending={id,reject,cleanup};signal.addEventListener('abort',abort,{once:true});
   worker.onmessage=({data})=>{
    if(this.pending?.id!==id||data.id!==id)return;
    if(data.type==='progress'){onProgress?.(data.loaded,data.total);return;}
    cleanup();this.pending=null;
    if(data.type==='error'){this.ready=null;worker.terminate();this.worker=null;reject(new Error(data.message));}
    else {if(data.type==='ready')this.ready=data.value;resolve(data.value as T);}
   };
   worker.onerror=()=>{if(this.pending?.id!==id)return;cleanup();this.pending=null;worker.terminate();this.worker=null;this.ready=null;reject(new Error('Image worker failed. Retry on a supported browser.'));};
   try{worker.postMessage({id,type,bitmap},bitmap?[bitmap]:[]);}catch(e){cleanup();this.pending=null;bitmap?.close();this.dispose();reject(e);}
  });
 }
 load(onProgress:(loaded:number,total:number|null)=>void,signal:AbortSignal):Promise<ModelIdentity>{
  if(signal.aborted)return Promise.reject(new DOMException('Operation canceled.','AbortError'));
  return this.ready?Promise.resolve(this.ready):this.request('load',signal,onProgress);
 }
 embed(crop:ImageBitmap,signal:AbortSignal):Promise<EmbeddingResult>{return this.request('embed',signal,undefined,crop);}
 dispose(){const pending=this.pending;this.pending=null;pending?.cleanup();this.worker?.terminate();this.worker=null;this.ready=null;pending?.reject(new DOMException('Operation canceled.','AbortError'));}
}

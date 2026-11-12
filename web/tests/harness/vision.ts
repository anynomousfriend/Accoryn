import { InferenceClient } from '../../src/object-registration/inference-client.ts';
import { compareEmbeddings } from '../../src/object-registration/comparison.ts';
const client=new InferenceClient();
Object.assign(window, {
 vision: {
  load: ()=>client.load(()=>{}, new AbortController().signal),
  embed: async(path:string)=>{
   const image=await createImageBitmap(await(await fetch(path)).blob());
   return client.embed(image,new AbortController().signal);
  },
  cancelLoad: async()=>{
   const ac=new AbortController();const pending=client.load(()=>{},ac.signal);ac.abort();
   try {await pending;return 'unexpected success';}catch(e){return (e as Error).name;}
  },
  compare: compareEmbeddings,
  dispose: ()=>client.dispose(),
 }
});

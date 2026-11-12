import {InferenceClient} from './inference-client.ts';
import {TemplateStore} from './template-store.ts';
import {assessQuality,centerSquare} from './capture-quality.ts';
import {compareEmbeddings} from './comparison.ts';
import {classifyMediaError} from '../media-utils.ts';
import type {RegistrationSnapshot,Embedding,ModelIdentity,ObjectTemplate} from './types.ts';
const initial=():RegistrationSnapshot=>({phase:'idle',mode:null,detail:'Choose an object to register in this browser.',viewIndex:0,previews:[],reviewUrl:null,template:null,comparison:null,progress:null});
export class ObjectRegistrationController {
 private state=initial();private listeners=new Set<()=>void>();
 private inference=new InferenceClient();private store=new TemplateStore();
 private video:HTMLVideoElement|null=null;private stream:MediaStream|null=null;
 private generation=0;private abort:AbortController|null=null;private vectors:Embedding[]=[];
 private crop:Blob|null=null;private model:ModelIdentity|null=null;private storageProblem=false;
 subscribe=(listener:()=>void)=>{this.listeners.add(listener);return()=>{this.listeners.delete(listener);};};
 getSnapshot=()=>this.state;
 private update(patch:Partial<RegistrationSnapshot>){this.state={...this.state,...patch};for(const listener of this.listeners)listener();}
 attachVideo(video:HTMLVideoElement|null){this.video=video;if(video&&this.stream)video.srcObject=this.stream;}
 private current(id:number){return this.generation===id&&!this.abort?.signal.aborted;}
 private busy(){return ['loading','requesting','processing','saving','comparing'].includes(this.state.phase);}
 private stopCamera(){this.stream?.getTracks().forEach(t=>t.stop());this.stream=null;if(this.video)this.video.srcObject=null;}
 private clearImages(){for(const url of new Set([...this.state.previews,this.state.reviewUrl].filter((x):x is string=>!!x)))URL.revokeObjectURL(url);this.crop=null;this.vectors=[];}
 private release(){this.generation++;this.abort?.abort();this.abort=null;this.stopCamera();this.inference.dispose();this.model=null;this.clearImages();}
 async initialize(){
  const id=this.generation;
  try{const template=await this.store.read();if(id!==this.generation)return;this.storageProblem=false;this.update({template,phase:template?'saved':'idle',detail:template?'Local registration loaded. You can compare a fresh scan.':'Choose an object to register in this browser.'});}
  catch(e){if(id!==this.generation)return;this.storageProblem=true;this.update({phase:'error',detail:e instanceof Error?e.message:'Local storage is unavailable.'});}
 }
 private async openCamera(id:number){
  if(!navigator.mediaDevices?.getUserMedia)throw new Error('Camera access needs HTTPS or localhost in a supported browser.');
  this.update({phase:'requesting',detail:'Allow camera access to capture this view.'});
  const stream=await navigator.mediaDevices.getUserMedia({video:{facingMode:{ideal:'environment'},width:{ideal:1280}},audio:false});
  if(!this.current(id)){stream.getTracks().forEach(t=>t.stop());return;}
  if(!this.video){stream.getTracks().forEach(t=>t.stop());throw new Error('Camera preview is unavailable. Return to this page and retry.');}
  this.stream=stream;this.video.srcObject=stream;
  await this.video.play();if(!this.current(id)){this.stopCamera();return;}
  this.update({phase:'capture',detail:this.state.mode==='comparison'?'Capture a fresh view of the object.':`View ${this.vectors.length+1} of 3: ${['front','slightly left','slightly right'][this.vectors.length]}.`});
 }
 private fail(error:unknown,id:number){
  if(!this.current(id))return;this.stopCamera();
  const message=error instanceof DOMException?classifyMediaError(error).message:error instanceof Error?error.message:'Registration failed. Retry.';
  this.update({phase:'error',detail:message,progress:null});
 }
 private async start(mode:'enrollment'|'comparison'){
  if(this.busy())return;
  if(this.storageProblem){this.update({phase:'error',detail:'Delete the incompatible registration or retry local storage before registering again.'});return;}
  if(mode==='comparison'&&!this.state.template){this.update({phase:'error',detail:'Register an object before comparing a scan.'});return;}
  this.release();const id=this.generation;this.abort=new AbortController();
  this.update({phase:'loading',mode,previews:[],reviewUrl:null,comparison:null,viewIndex:0,progress:null,detail:'Loading the local image model. This first download is about 39 MB.'});
  try{
   this.model=await this.inference.load((loaded,total)=>{if(this.current(id))this.update({progress:{loaded,total}});},this.abort.signal);
   if(!this.current(id))return;this.update({progress:null});await this.openCamera(id);
  }catch(e){this.fail(e,id);}
 }
 startEnrollment=()=>this.start('enrollment');
 startComparison=()=>this.start('comparison');
 async capture(){
  if(this.state.phase!=='capture'||!this.video||!this.stream)return;
  const id=this.generation;const video=this.video;
  this.update({phase:'processing',detail:'Checking this frame…'});
  try{
   const {sx,sy,size}=centerSquare(video.videoWidth,video.videoHeight);
   const canvas=document.createElement('canvas');canvas.width=canvas.height=512;const context=canvas.getContext('2d');
   const small=document.createElement('canvas');small.width=small.height=256;const qualityContext=small.getContext('2d',{willReadFrequently:true});
   if(!context||!qualityContext)throw new Error('Image capture is unavailable.');
   context.drawImage(video,sx,sy,size,size,0,0,512,512);qualityContext.drawImage(canvas,0,0,256,256);
   const quality=assessQuality(qualityContext.getImageData(0,0,256,256).data,256,256);
   if(!quality.ok){this.update({phase:'capture',detail:quality.reason==='dark'?'More light is needed. Try again.':quality.reason==='bright'?'Too much light. Reduce glare and try again.':'Keep the object steady and fill the square with a textured object. Try again.'});return;}
   const blob=await new Promise<Blob>((resolve,reject)=>canvas.toBlob(b=>b?resolve(b):reject(new Error('Could not capture this frame.')),'image/jpeg',.9));
   if(!this.current(id))return;
   this.crop=blob;this.stopCamera();this.update({phase:'review',reviewUrl:URL.createObjectURL(blob),detail:'Review this view, then use it or retake it.'});
  }catch(e){this.fail(e,id);}
 }
 retake(){
  if(this.state.phase!=='review'||!this.crop)return;
  if(this.state.reviewUrl)URL.revokeObjectURL(this.state.reviewUrl);this.crop=null;this.update({reviewUrl:null});
  const id=this.generation;void this.openCamera(id).catch(e=>this.fail(e,id));
 }
 acceptView(){void this.processView();}
 private async processView(){
  if(this.state.phase!=='review'||!this.crop||!this.abort||!this.model)return;
  const id=this.generation;const crop=this.crop;const url=this.state.reviewUrl;
  this.update({phase:this.state.mode==='comparison'?'comparing':'processing',detail:'Comparing the scan locally…'});
  try{
   const bitmap=await createImageBitmap(crop);if(!this.current(id)){bitmap.close();return;}
   const result=await this.inference.embed(bitmap,this.abort.signal);if(!this.current(id))return;
   this.crop=null;
   if(this.state.mode==='comparison'){
    if(!this.state.template)throw new Error('No compatible registration is available.');
    const comparison=compareEmbeddings(this.state.template.views,result.vector,result.inferenceMs);
    if(url)URL.revokeObjectURL(url);this.update({phase:'result',reviewUrl:null,comparison,detail:'Scan compared'});
   }else{
    this.vectors.push(result.vector);const previews=[...this.state.previews,...(url?[url]:[])];
    this.update({previews,reviewUrl:null,viewIndex:this.vectors.length});
    if(this.vectors.length===3)this.update({phase:'review',detail:'Three views captured. Name and save the local visual template.'});
    else await this.openCamera(id);
   }
  }catch(e){this.fail(e,id);}
 }
 async save(label:string,replaceConfirmed:boolean){
  if(this.busy())return;
  if(this.state.phase!=='review'||this.vectors.length!==3||!this.model){this.update({phase:'error',detail:'Capture and accept three real views before saving.'});return;}
  if(this.state.template&&!replaceConfirmed){this.update({detail:'Confirm replacement before saving. The previous registration is still stored.'});return;}
  const id=this.generation;const signal=this.abort!.signal;
  const template:ObjectTemplate={schemaVersion:1,id:crypto.randomUUID(),label:label.trim(),createdAt:new Date().toISOString(),model:this.model,views:[...this.vectors] as ObjectTemplate['views']};
  this.update({phase:'saving',detail:'Saving the visual template in this browser…'});
  try{
   await this.store.save(template,signal);
   // Reconcile even when cancellation raced with a completed transaction.
   const stored=await this.store.read();
   if(!this.current(id)){if(stored)this.update({template:stored});return;}
   this.clearImages();this.update({phase:'saved',template:stored,previews:[],reviewUrl:null,comparison:null,viewIndex:0,detail:'Visual template saved locally. Photos discarded.'});
  }catch(e){this.fail(e,id);}
 }
 cancel=()=>{this.release();this.update({phase:'stopped',detail:'Stopped. Unsaved photos and views were discarded. Saved registration is unchanged.',previews:[],reviewUrl:null,comparison:null,progress:null,viewIndex:0});};
 async deleteRegistration(){
  this.cancel();const id=this.generation;this.abort=new AbortController();this.update({phase:'saving',detail:'Deleting the local registration…'});
  try{await this.store.delete(this.abort.signal);if(!this.current(id))return;this.storageProblem=false;this.update({phase:'idle',template:null,mode:null,detail:'Registration deleted from this browser.'});}
  catch(e){this.fail(e,id);}
 }
 dispose=()=>{this.cancel();this.store.close();};
}

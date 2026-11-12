export type Embedding = number[];
export type ModelIdentity = { modelId:string; revision:string; artifactSha256:string; processorSha256:string; runtimeVersion:string; embeddingSchema:'dinov2-cls-l2-v1' };
export type ObjectTemplate = { schemaVersion:1; id:string; label:string; createdAt:string; model:ModelIdentity; views:[Embedding,Embedding,Embedding] };
export type Comparison = { scores:[number,number,number]; topTwoMean:number; inferenceMs:number };
export type QualityResult = {ok:boolean; reason:'invalid'|'dark'|'bright'|'blur'|null};
export type EmbeddingResult = { vector:Embedding; inferenceMs:number; model:ModelIdentity };

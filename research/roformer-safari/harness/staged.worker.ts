/// <reference lib="webworker" />
import {runModel,MODELS} from '../src/separate/pipeline.ts';
import type {Stereo,Net} from '../src/separate/types.ts';
const post=(data:unknown)=>(self as DedicatedWorkerGlobalScope).postMessage(data);
const say=(text:string)=>post({event:'status',text});
const stats=(s:Stereo)=>{let power=0,peak=0,bad=0;for(const c of s)for(const v of c){if(!Number.isFinite(v))bad++;power+=v*v;peak=Math.max(peak,Math.abs(v));}return {peak,rms:Math.sqrt(power/(2*s[0].length)),nonFinite:bad};};
self.onmessage=async({data})=>{
 const timings:Record<string,any>={stages:[]};let device:any;let keeper:any;
 try{
  const cpu=data.variant==='staged-cpu';const ort:any=cpu?await import('onnxruntime-web/wasm'):await import('onnxruntime-web/webgpu');
  ort.env.wasm.numThreads=cpu&&self.crossOriginIsolated?Math.min(8,navigator.hardwareConcurrency||1):1;
  post({event:'runtime',versions:ort.env.versions,backend:cpu?'wasm':'webgpu',threads:ort.env.wasm.numThreads});
  const adapter=cpu?undefined:await(navigator as any).gpu.requestAdapter({powerPreference:'high-performance'});
  const names=['maxBufferSize','maxStorageBufferBindingSize','maxStorageBuffersPerShaderStage','maxComputeWorkgroupStorageSize','maxComputeWorkgroupsPerDimension','maxComputeInvocationsPerWorkgroup','maxComputeWorkgroupSizeX','maxComputeWorkgroupSizeY','maxComputeWorkgroupSizeZ'];
  const held=data.variant==='staged-held';
  const options=()=>({executionProviders:cpu?['wasm']:[{name:'webgpu',device,validationMode:'wgpuOnly',storageBufferCacheMode:'simple',uniformBufferCacheMode:'simple'}],graphOptimizationLevel:'all',enableCpuMemArena:false});
  if(held){
   device=await adapter.requestDevice({requiredLimits:Object.fromEntries(names.map(k=>[k,adapter.limits[k]])),requiredFeatures:['shader-f16']});
   device.lost.then((e:any)=>post({event:'gpu-device-lost',reason:e.reason,message:e.message}));
   keeper=await ort.InferenceSession.create(new Uint8Array(await(await fetch('/models/keepalive.onnx')).arrayBuffer()),options());
   const kept=await keeper.run({x:new ort.Tensor('float32',new Float32Array([1,2,3,4]),[1,4])});for(const t of Object.values(kept) as any[])t.dispose();
   post({event:'gpu-context-held'});
  }
  const folder=data.variant==='staged-fine'||held?'mel-staged-fine':'mel-staged';
  const manifest=await(await fetch('/models/'+folder+'/manifest.json')).json();
  let chunk=0;
  const net:Net={async run(input,dims){
   chunk++;let value:any=new ort.Tensor('float32',input,dims);
   try{
    for(let i=0;i<manifest.stages.length;i++){
     const stage=manifest.stages[i];say('Chunk '+chunk+' · stage '+(i+1)+'/'+manifest.stages.length);
     const start=performance.now();
     if(!cpu&&!held){device=await adapter.requestDevice({requiredLimits:Object.fromEntries(names.map(k=>[k,adapter.limits[k]])),requiredFeatures:['shader-f16']});device.addEventListener('uncapturederror',(e:any)=>post({event:'gpu-error',stage:i,message:e.error.message}));device.lost.then((e:any)=>post({event:'gpu-device-lost',stage:i,reason:e.reason,message:e.message}));}
     let bytes:Uint8Array|undefined=new Uint8Array(await(await fetch('/models/'+folder+'/'+stage.file)).arrayBuffer());
     const session=await ort.InferenceSession.create(bytes,options());bytes=undefined;
     const loaded=performance.now();let next:any;
     try{
      const out=await session.run({[stage.input]:value});const tensor=out[stage.output];
      const raw:any=(tensor.data as any).slice();next=new ort.Tensor(tensor.type as any,raw,tensor.dims);
      for(const t of Object.values(out) as any[])t.dispose();
     }catch(error){post({event:'stage-error',stage:i,chunk,message:String(error)});throw error;}
     finally{if(device)await device.queue.onSubmittedWorkDone();await session.release();if(device&&!held)device.destroy();}
     value.dispose();value=next;
     const measured={chunk,stage:i,loadSeconds:(loaded-start)/1000,computeSeconds:(performance.now()-loaded)/1000};timings.stages.push(measured);post({event:'stage',...measured,outputType:value.type,outputShape:value.dims});
    }
    return (value.data as Float32Array).slice();
   }finally{value.dispose();}
  }};
  const song=data.audio.map((c:Float32Array)=>c.slice(0,44100*data.length)) as Stereo;let lead:Stereo|undefined,backing:Stereo|undefined;
  for(let pass=0;pass<data.passes;pass++){
   const start=performance.now();const [a,b]=await runModel(MODELS.mel_karaoke,song,net,(done,total)=>say('Pass '+(pass+1)+': '+done+'/'+total));
   if(stats(a).nonFinite||stats(b).nonFinite)throw new Error('Non-finite model output');
   timings[pass?'warmPassSeconds':'firstPassSeconds']=(performance.now()-start)/1000;
   post({event:'pass',pass:pass+1,seconds:(performance.now()-start)/1000,audioStats:stats(a)});if(pass===0){lead=a;backing=b;}
  }
  post({event:'done',timings,stems:{lead,backing},audioStats:{lead:stats(lead!),backing:stats(backing!)}});
 }catch(error){say('FAILED: '+String(error));post({event:'error',message:String(error),stack:error instanceof Error?error.stack:undefined,timings});}
 finally{try{await keeper?.release();}catch{}}
};

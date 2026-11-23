/// <reference lib="webworker" />
import {runModel,MODELS} from '../src/separate/pipeline.ts';
import type {Stereo,Net} from '../src/separate/types.ts';
const post=(m:any)=>self.postMessage(m);
const bitsF=new Float32Array(1),bitsI=new Uint32Array(bitsF.buffer);
function fromHalf(raw:Uint16Array){const H=(globalThis as any).Float16Array;if(H){const out=new Float32Array(raw.length);out.set(new H(raw.buffer,raw.byteOffset,raw.length));return out;}const a=new Float32Array(raw.length);for(let i=0;i<a.length;i++){const h=raw[i],s=(h&32768)?-1:1,e=(h>>10)&31,m=h&1023;a[i]=e===0?s*(m/1024)*2**-14:e===31?(m?NaN:s*Infinity):s*(1+m/1024)*2**(e-15);}return a;}
function toHalf(raw:Float32Array){const H=(globalThis as any).Float16Array;if(H){const out=new H(raw.length);out.set(raw);return new Uint16Array(out.buffer);}const out=new Uint16Array(raw.length);for(let i=0;i<out.length;i++){bitsF[0]=raw[i];const x=bitsI[0],s=(x>>>16)&32768,e=((x>>>23)&255)-112,m=x&0x7fffff;if(e<=0){out[i]=e < -10?s:s|((m|0x800000)+(1<<(13-e))-1+(((m|0x800000)>>>(14-e))&1))>>>(14-e);}else if(e>=31)out[i]=s|0x7c00;else{const rounded=(m+0xfff+((m>>>13)&1))>>>13;out[i]=s|(e<<10)+rounded;}}return out;}
self.onmessage=async({data})=>{
 const timings:any={stages:[]};const sessions:any[]=[];
 try{
 const ort:any=await import('onnxruntime-web/webgpu');ort.env.wasm.numThreads=self.crossOriginIsolated?8:1;post({event:'runtime',backend:data.variant+' independent batches + CPU front/mask',threads:ort.env.wasm.numThreads,versions:ort.env.versions});
 const adapter=await(navigator as any).gpu.requestAdapter({powerPreference:'high-performance'});const names=['maxBufferSize','maxStorageBufferBindingSize','maxStorageBuffersPerShaderStage','maxComputeWorkgroupStorageSize','maxComputeWorkgroupsPerDimension','maxComputeInvocationsPerWorkgroup','maxComputeWorkgroupSizeX','maxComputeWorkgroupSizeY','maxComputeWorkgroupSizeZ'];
 const device=await adapter.requestDevice({requiredLimits:Object.fromEntries(names.map(k=>[k,adapter.limits[k]])),requiredFeatures:adapter.features.has('shader-f16')?['shader-f16']:[]});device.lost.then((e:any)=>{if(e.reason!=='destroyed')post({event:'gpu-device-lost',reason:e.reason,message:e.message});});device.addEventListener('uncapturederror',(e:any)=>post({event:'gpu-error',message:e.error.message}));
 const fine=await(await fetch('/models/mel-staged-fine/manifest.json')).json();const useHalf=true;const coreFolder=data.variant==='grouped-original'?'mel-grouped-original':'mel-grouped-padded';const core=await(await fetch('/models/'+coreFolder+'/manifest.json')).json();
 let stages=[{...fine.stages[0],url:'/models/mel-staged-fine/'+fine.stages[0].file},...core.map((s:any)=>({...s,url:'/models/'+coreFolder+'/'+s.file,gpu:true})),...fine.stages.slice(13).map((s:any)=>({...s,url:'/models/mel-staged-fine/'+s.file}))];if(data.variant==='gpu-mask-fused'){const head=await(await fetch('/models/mel-gpu-mask-fused/manifest.json')).json();stages=[...stages.slice(0,13),{...head,url:'/models/mel-gpu-mask-fused/mask.onnx'}];}let chunk=0;
 const net:Net={async run(input,dims){chunk++;let value:any=input,type='float32',shape=dims;
  for(let i=0;i<stages.length;i++){
   const s=stages[i];post({event:'status',text:'Chunk '+chunk+' · '+(s.gpu?'GPU':'CPU')+' stage '+(i+1)+'/'+stages.length});const start=performance.now();
   if(s.transpose){const [a,b,c]=shape;const next=new Uint16Array(value.length);for(let x=0;x<a;x++)for(let y=0;y<b;y++)next.set(value.subarray((x*b+y)*c,(x*b+y+1)*c),(y*a+x)*c);value=next;shape=[b,a,c];}
   const session=sessions[i]??(sessions[i]=await ort.InferenceSession.create(new Uint8Array(await(await fetch(s.url)).arrayBuffer()),{executionProviders:s.gpu?[{name:'webgpu',device,validationMode:'wgpuOnly',storageBufferCacheMode:'simple',enableMatmulFp32Accumulation:true}]:['wasm'],graphOptimizationLevel:'all',enableCpuMemArena:false}));const loaded=performance.now();
   if(s.gpu&&!s.direct){
    const {batch,fullBatch}=s;const seq=s.inputShape[1],stride=seq*384;const all=useHalf?new Uint16Array(value.length):new Float32Array(value.length);let bad=0,peak=0;
    for(let offset=0;offset<fullBatch;offset+=batch){
     const part=useHalf?new Uint16Array(batch*stride):new Float32Array(batch*stride);const raw=value.subarray(offset*stride,Math.min(offset+batch,fullBatch)*stride);part.set(useHalf?raw:fromHalf(raw));const feed=new ort.Tensor(useHalf?'float16':'float32',part,s.inputShape);const out=await session.run({[s.input]:feed});const output=out[s.output].data;all.set((useHalf?new Uint16Array(output.buffer,output.byteOffset,output.length):output).subarray(0,Math.min(batch,fullBatch-offset)*stride),offset*stride);feed.dispose();for(const t of Object.values(out) as any[])t.dispose();
    }value=useHalf?all:toHalf(all as Float32Array);shape=[fullBatch,seq,384];type='float16';
   }else{
    const feed=new ort.Tensor(type,value,shape);const out=await session.run({[s.input]:feed});const next=out[s.output];value=next.type==='float16'?new Uint16Array(next.data.buffer,next.data.byteOffset,next.data.length).slice():next.data.slice();type=next.type;shape=next.dims;feed.dispose();for(const t of Object.values(out) as any[])t.dispose();
   }
   const measured={chunk,stage:i,backend:s.gpu?(useHalf?'webgpu-fp16':'webgpu-fp32'):'wasm',loadSeconds:(loaded-start)/1000,computeSeconds:(performance.now()-loaded)/1000};timings.stages.push(measured);post({event:'stage',...measured});
  }return value;
 }};
 const song=data.audio.map((c:Float32Array)=>c.slice(0,44100*data.length)) as Stereo;let lead:any,backing:any;
 for(let pass=0;pass<data.passes;pass++){
  const started=performance.now();const [a,b]=await runModel(MODELS.mel_karaoke,song,net,(done,total)=>post({event:'status',text:'Pass '+(pass+1)+': '+done+'/'+total}));for(const s of [a,b])for(const c of s)for(const v of c)if(!Number.isFinite(v))throw new Error('Non-finite audio');timings[pass?'warmPassSeconds':'firstPassSeconds']=(performance.now()-started)/1000;if(!pass){lead=a;backing=b;}post({event:'pass',pass,seconds:(performance.now()-started)/1000});
 }post({event:'done',timings,stems:{lead,backing}});
 }catch(e){post({event:'error',message:String(e),stack:e instanceof Error?e.stack:undefined,timings});}
 finally{for(const s of sessions)try{await s.release();}catch{}}
};

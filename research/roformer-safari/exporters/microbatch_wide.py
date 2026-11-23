from pathlib import Path
import os
import copy,json,heapq
from collections import defaultdict
import onnx,numpy as np
from onnx import helper,numpy_helper
root=(Path(os.environ['ROFORMER_RESEARCH_ROOT'])/'splitwave/models');m=onnx.load(root/'mel_roformer_karaoke_fp16.onnx');out=root/'mel-micro-wide';out.mkdir(exist_ok=True)
meta={v.name:v for v in [*m.graph.input,*m.graph.value_info,*m.graph.output]}
nodes=list(m.graph.node);producers={v:i for i,n in enumerate(nodes) for v in n.output};init={t.name:t for t in m.graph.initializer}
manifest=[]
for i in range(6):
 for j in range(2):
  cast=next(n for n in nodes if n.name==f'/layers.{i}.{j}/layers.0.0/norm/Cast')
  first=cast.input[0];last=f'/layers.{i}.{j}/norm/Mul_1_output_0';old=60 if j==0 else 801;batch=4 if j==0 else 89
  chosen=set();used=set();seen=set()
  def visit(name):
   if not name or name in seen or name==first:return
   seen.add(name)
   if name in init:used.add(name);return
   assert name in producers,name
   idx=producers[name]
   for x in nodes[idx].input:visit(x)
   chosen.add(idx)
  visit(last)
  stage=[copy.deepcopy(nodes[k]) for k in chosen];available={first}|used;prod={v:k for k,n in enumerate(stage) for v in n.output};followers=defaultdict(list);counts=[]
  for k,n in enumerate(stage):
   deps={prod[x] for x in n.input if x and x not in available};counts.append(len(deps))
   for d in deps:followers[d].append(k)
  ready=[k for k,v in enumerate(counts) if v==0];heapq.heapify(ready);ordered=[]
  while ready:
   k=heapq.heappop(ready);ordered.append(stage[k])
   for z in followers[k]:
    counts[z]-=1
    if counts[z]==0:heapq.heappush(ready,z)
  assert len(ordered)==len(stage)
  def resized(v):
   v=copy.deepcopy(v)
   for d in v.type.tensor_type.shape.dim:
    if d.dim_value==old:d.dim_value=batch
   return v
  folded=[]
  for n in ordered:
   if n.op_type=='Shape':
    dims=[d.dim_value for d in meta[n.input[0]].type.tensor_type.shape.dim];assert dims and all(d>0 for d in dims)
    start=next((a.i for a in n.attribute if a.name=='start'),0);end=next((a.i for a in n.attribute if a.name=='end'),len(dims))
    n=helper.make_node('Constant',[],list(n.output),name=n.name,value=numpy_helper.from_array(np.array(dims[start:end],dtype=np.int64)))
   for a in n.attribute:
    if a.type==onnx.AttributeProto.TENSOR and a.t.data_type==7:
     arr=numpy_helper.to_array(a.t).copy();arr[arr==old]=batch;a.t.CopyFrom(numpy_helper.from_array(arr,a.t.name))
   folded.append(n)
  graph=helper.make_graph(folded,f'block-{i}-{j}',[resized(meta[first])],[resized(meta[last])],[copy.deepcopy(init[k]) for k in used])
  live={v for n in folded for v in n.output};graph.value_info.extend(resized(v) for k,v in meta.items() if k in live and k!=last)
  mm=helper.make_model(graph,opset_imports=copy.deepcopy(m.opset_import));mm.ir_version=m.ir_version;onnx.checker.check_model(mm)
  file=f'block-{i}-{j}.onnx';onnx.save(mm,out/file)
  manifest.append({'file':file,'input':first,'output':last,'inputShape':[batch,801 if j==0 else 60,384],'batch':batch,'fullBatch':old,'axis':'time' if j==0 else 'frequency','transpose':bool(i or j),'outputType':10,'weightsUnchanged':True})
(out/'manifest.json').write_text(json.dumps(manifest,indent=2));print('exported',len(manifest),'full-context independent-batch blocks')

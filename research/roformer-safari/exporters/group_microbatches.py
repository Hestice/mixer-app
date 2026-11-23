"""Run independent full-context transformer microbatches in one ONNX graph.
Weights are shared, each batch retains its original shape and arithmetic.
"""
from pathlib import Path
import os
import copy,json,sys
import onnx,numpy as np
from onnx import helper,numpy_helper
r=(Path(os.environ['ROFORMER_RESEARCH_ROOT'])/'splitwave/models');source=sys.argv[1] if len(sys.argv)>1 else 'mel-micro-padded';target=sys.argv[2] if len(sys.argv)>2 else 'mel-grouped-padded';out=r/target;out.mkdir(exist_ok=True)
manifest=json.loads((r/source/'manifest.json').read_text())
for e in manifest:
 m=onnx.load(r/source/e['file']);first=m.graph.input[0].name;last=m.graph.output[0].name;batch=e['batch'];full=e['fullBatch'];assert full%batch==0
 initializers=[copy.deepcopy(t) for t in m.graph.initializer];shared={t.name for t in initializers};nodes=[];values=[];outputs=[]
 def c(name,arr):initializers.append(numpy_helper.from_array(np.array(arr,dtype=np.int64),name));return name
 axis=c('__group_axis',[0]);step=c('__group_step',[1])
 for offset in range(0,full,batch):
  prefix=f'__micro_{offset}';lo=c(prefix+'_lo',[offset]);hi=c(prefix+'_hi',[offset+batch]);sliced=prefix+'_input';nodes.append(helper.make_node('Slice',[first,lo,hi,axis,step],[sliced],name=prefix+'_slice'))
  def name(x):return '' if not x else x if x in shared else sliced if x==first else prefix+x
  for n in m.graph.node:
   n=copy.deepcopy(n);n.name=prefix+n.name
   n.input[:]=[name(x) for x in n.input];n.output[:]=[name(x) for x in n.output];nodes.append(n)
  for v in m.graph.value_info:
   if v.name in shared:continue
   v=copy.deepcopy(v);v.name=name(v.name);values.append(v)
  outputs.append(name(last))
 partial=[]
 for offset in range(0,len(outputs),8):
  n=f'__group_join_{offset}';nodes.append(helper.make_node('Concat',outputs[offset:offset+8],[n],axis=0,name=n));partial.append(n)
 nodes.append(helper.make_node('Concat',partial,[last],axis=0,name='__group_join_all'))
 inp=copy.deepcopy(m.graph.input[0]);inp.type.tensor_type.shape.dim[0].dim_value=full;output=copy.deepcopy(m.graph.output[0]);output.type.tensor_type.shape.dim[0].dim_value=full
 graph=helper.make_graph(nodes,'grouped-'+m.graph.name,[inp],[output],initializers);graph.value_info.extend(values)
 result=helper.make_model(graph,opset_imports=copy.deepcopy(m.opset_import));result.ir_version=m.ir_version;onnx.checker.check_model(result);onnx.save(result,out/e['file'])
 e.update({'sourceMicroBatch':batch,'batch':full,'inputShape':[full,*e['inputShape'][1:]],'groupedBranches':full//batch,'readbacksPerStage':1,'originalInitializerCount':len(shared),'nodes':len(nodes)})
 print(e['file'],full//batch,len(nodes),flush=True)
(out/'manifest.json').write_text(json.dumps(manifest,indent=2))

from pathlib import Path
import os
import copy,json,onnx
from onnx import helper
r=(Path(os.environ['ROFORMER_RESEARCH_ROOT'])/'splitwave/models');head=onnx.load(r/'mel-gpu-head/head.onnx');last=onnx.load(r/'mel-staged-fine/stage-15.onnx');out=r/'mel-gpu-mask-fused';out.mkdir(exist_ok=True)
nodes=[copy.deepcopy(n) for n in head.graph.node]
for n in last.graph.node:
 n=copy.deepcopy(n);n.input[:]=['h' if x==last.graph.input[0].name else x for x in n.input];nodes.append(n)
inits=[copy.deepcopy(t) for t in [*head.graph.initializer,*last.graph.initializer]];assert len({t.name for t in inits})==len(inits)
g=helper.make_graph(nodes,'gpu-mask-fused',[copy.deepcopy(head.graph.input[0])],[copy.deepcopy(last.graph.output[0])],inits);g.value_info.extend(copy.deepcopy(v) for v in last.graph.value_info)
m=helper.make_model(g,opset_imports=copy.deepcopy(head.opset_import));m.ir_version=head.ir_version;onnx.checker.check_model(m);onnx.save(m,out/'mask.onnx')
s={'file':'mask.onnx','input':head.graph.input[0].name,'output':last.graph.output[0].name,'inputShape':[60,801,384],'transpose':True,'gpu':True,'direct':True,'weightsChanged':False,'timeIndependentBatch':89,'removedHostIntermediateBytes':60*801*1536*2};(out/'manifest.json').write_text(json.dumps(s,indent=2));print('fused unchanged GPU mask operations;',s['removedHostIntermediateBytes'],'bytes no longer downloaded and uploaded per chunk')

"""Split the same full-context model into sequential sessions to bound each GPU submission."""
from pathlib import Path
import os
import copy,json,hashlib,sys
import onnx,numpy as np
from onnx import helper,numpy_helper
root=Path(os.environ['ROFORMER_RESEARCH_ROOT'])
src=root/'splitwave/models/mel_roformer_karaoke_fp16_b4.onnx'
fine='--fine' in sys.argv
out=root/('splitwave/models/mel-staged-fine' if fine else 'splitwave/models/mel-staged');out.mkdir(exist_ok=True)
m=onnx.load(src)
meta={v.name:v for v in [*m.graph.input,*m.graph.value_info,*m.graph.output]}
nodes=[];folded=0
for n in m.graph.node:
    if n.op_type=='Shape' and n.input[0] in meta:
        dims=[d.dim_value for d in meta[n.input[0]].type.tensor_type.shape.dim]
        if dims and all(d>0 for d in dims):
            start=next((a.i for a in n.attribute if a.name=='start'),0)
            end=next((a.i for a in n.attribute if a.name=='end'),len(dims))
            nodes.append(helper.make_node('Constant',[],list(n.output),name=n.name,value=numpy_helper.from_array(np.array(dims[start:end],dtype=np.int64))))
            folded+=1;continue
    nodes.append(n)
producers={v:i for i,n in enumerate(nodes) for v in n.output}
initializers={t.name:t for t in m.graph.initializer}
cuts=['stft']+[f'/layers.{i}.1/norm/Mul_1_output_0' for i in range(6)]+['/Tanh_output_0','/Tanh_1_output_0','mask']
if fine:cuts=['stft','/Reshape_1_output_0']+[f'/layers.{i}.{j}/norm/Mul_1_output_0' for i in range(6) for j in [0,1]]+['/Tanh_output_0','/Tanh_1_output_0','mask']
manifest=[]
for j,(first,last) in enumerate(zip(cuts,cuts[1:])):
    chosen=set();used=set();external=set();seen=set()
    def visit(name):
        if not name or name in seen or name==first:return
        seen.add(name)
        if name in initializers:used.add(name);return
        if name not in producers:external.add(name);return
        idx=producers[name]
        for val in nodes[idx].input:visit(val)
        chosen.add(idx)
    visit(last)
    assert not external,(j,external)
    graph=helper.make_graph([nodes[i] for i in sorted(chosen)],f'mel-stage-{j}',[copy.deepcopy(meta[first])],[copy.deepcopy(meta[last])],[copy.deepcopy(initializers[name]) for name in used])
    graph.value_info.extend(copy.deepcopy(v) for name,v in meta.items() if name not in {first,last} and any(name in nodes[i].output for i in chosen))
    part=helper.make_model(graph,opset_imports=copy.deepcopy(m.opset_import));part.ir_version=m.ir_version
    onnx.checker.check_model(part)
    p=out/f'stage-{j}.onnx';onnx.save(part,p)
    record={'file':p.name,'input':first,'output':last,'inputShape':[d.dim_value for d in meta[first].type.tensor_type.shape.dim],'inputType':meta[first].type.tensor_type.elem_type,'outputType':meta[last].type.tensor_type.elem_type,'bytes':p.stat().st_size,'sha256':hashlib.sha256(p.read_bytes()).hexdigest(),'nodes':len(chosen)}
    manifest.append(record);print(record,flush=True)
(out/'manifest.json').write_text(json.dumps({'contextFrames':801,'weightsChanged':False,'shapeNodesFolded':folded,'stages':manifest},indent=2))
print('total bytes',sum(r['bytes'] for r in manifest),'largest stage',max(r['bytes'] for r in manifest))

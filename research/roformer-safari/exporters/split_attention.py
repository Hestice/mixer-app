"""Bound attention memory by splitting independent batch entries. Keep full 801-frame context."""
from pathlib import Path
import os
from collections import defaultdict
import copy,json,hashlib,heapq
import numpy as np
import onnx
from onnx import helper,numpy_helper

root=Path(os.environ['ROFORMER_RESEARCH_ROOT'])
source=root/'splitwave/models/mel_roformer_karaoke_fp16.onnx'
target=root/'splitwave/models/mel_roformer_karaoke_fp16_b4.onnx'
m=onnx.load(source)
nodes=list(m.graph.node)
producers={v:n for n in nodes for v in n.output}
consumers=defaultdict(list)
for n in nodes:
    for v in n.input:consumers[v].append(n)
shapes={v.name:[d.dim_value for d in v.type.tensor_type.shape.dim] for v in [*m.graph.input,*m.graph.value_info,*m.graph.output]}
replacement={};removed=set();changed=[]
def constant(name,values):
    m.graph.initializer.append(numpy_helper.from_array(np.array(values,dtype=np.int64),name))
    return name
axis=constant('__bounded_attention_axis',[0]); step=constant('__bounded_attention_step',[1])
for soft in nodes:
    if soft.op_type!='Softmax':continue
    shape=shapes.get(soft.input[0],[])
    if len(shape)!=4 or shape[0]!=60 or shape[-2:]!=[801,801]:continue
    qk=producers[soft.input[0]]
    assert qk.op_type=='MatMul' and len(consumers[qk.output[0]])==1
    following=consumers[soft.output[0]]
    assert len(following)==1 and following[0].op_type=='MatMul'
    av=following[0];assert av.input[0]==soft.output[0]
    q,k=qk.input;v=av.input[1]
    assert shapes[q]==[60,8,801,64] and shapes[k]==[60,8,64,801] and shapes[v]==[60,8,801,64]
    group=[];outs=[]
    for start in range(0,60,4):
        name=soft.name+f'__batch_{start}'
        lo=constant(name+'_lo',[start]);hi=constant(name+'_hi',[min(start+4,60)])
        inputs=[]
        for label,val in [('q',q),('k',k),('v',v)]:
            output=name+'_'+label
            group.append(helper.make_node('Slice',[val,lo,hi,axis,step],[output],name=output))
            inputs.append(output)
        qkn=copy.deepcopy(qk);qkn.name=name+'_qk';del qkn.input[:];qkn.input.extend(inputs[:2]);del qkn.output[:];qkn.output.append(name+'_scores')
        sn=copy.deepcopy(soft);sn.name=name+'_softmax';sn.input[0]=qkn.output[0];sn.output[0]=name+'_probabilities'
        vn=copy.deepcopy(av);vn.name=name+'_av';del vn.input[:];vn.input.extend([sn.output[0],inputs[2]]);vn.output[0]=name+'_result'
        group.extend([qkn,sn,vn]);outs.append(vn.output[0])
    # Limit Concat fan-in to the same <=8 buffers as the reference export.
    partial=[]
    for start in range(0,len(outs),8):
        result=soft.name+f'__joined_{start}'
        group.append(helper.make_node('Concat',outs[start:start+8],[result],axis=0,name=result));partial.append(result)
    group.append(helper.make_node('Concat',partial,list(av.output),axis=0,name=soft.name+'__joined'))
    replacement[av.name]=group
    removed.update([qk.name,soft.name,av.name]);changed.append({'name':soft.name,'oldShape':shape,'oldIntermediateBytes':int(np.prod(shape)*2),'newLargestIntermediateBytes':4*8*801*801*2})
out=[]
for n in nodes:
    if n.name in replacement:out.extend(replacement[n.name])
    elif n.name not in removed:out.append(n)
del m.graph.node[:];m.graph.node.extend(out)
# The downloaded fp16 converter appended casts after consumers. ORT sorts them at load;
# sort the derived graph explicitly so the ONNX checker can validate it as well.
available={v.name for v in m.graph.input}|{v.name for v in m.graph.initializer}
producer_indices={v:i for i,n in enumerate(out) for v in n.output}
pending_counts=[];followers=defaultdict(list)
for i,n in enumerate(out):
    deps={producer_indices[v] for v in n.input if v and v not in available}
    pending_counts.append(len(deps))
    for dep in deps:followers[dep].append(i)
ready=[i for i,count in enumerate(pending_counts) if count==0];heapq.heapify(ready);ordered=[]
while ready:
    i=heapq.heappop(ready);ordered.append(out[i])
    for j in followers[i]:
        pending_counts[j]-=1
        if not pending_counts[j]:heapq.heappush(ready,j)
assert len(ordered)==len(out),'cycle or missing input in derived graph'
del m.graph.node[:];m.graph.node.extend(ordered)
live=set(v for n in out for v in n.output)|set(v.name for v in m.graph.input)
keep=[v for v in m.graph.value_info if v.name in live];del m.graph.value_info[:];m.graph.value_info.extend(keep)
onnx.checker.check_model(m)
onnx.save(m,target)
info={'source':str(source),'target':str(target),'sourceSha256':hashlib.sha256(source.read_bytes()).hexdigest(),'targetSha256':hashlib.sha256(target.read_bytes()).hexdigest(),'changedAttentionBlocks':changed,'batchSize':4,'contextFrames':801,'audioContextSeconds':8,'newBytes':target.stat().st_size,'weightsChanged':False}
(root/'bounded-attention-export.json').write_text(json.dumps(info,indent=2))
print(json.dumps(info,indent=2))

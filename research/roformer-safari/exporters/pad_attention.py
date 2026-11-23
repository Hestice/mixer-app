"""Pad only attention internals; all 801 real positions and model weights retained."""
from pathlib import Path
import os
import copy,json
from collections import defaultdict
import onnx,numpy as np
from onnx import helper,numpy_helper,TensorProto
root=(Path(os.environ['ROFORMER_RESEARCH_ROOT'])/'splitwave/models');src=root/'mel-micro-wide';out=root/'mel-micro-padded'

def export():
 out.mkdir(exist_ok=True);manifest=json.loads((src/'manifest.json').read_text())
 for entry in manifest:
  m=onnx.load(src/entry['file'])
  if entry['axis']=='time':
   ns=list(m.graph.node);prod={v:n for n in ns for v in n.output};cons=defaultdict(list)
   for n in ns:
    for v in n.input:cons[v].append(n)
   soft=next(n for n in ns if n.op_type=='Softmax');qk=prod[soft.input[0]];av=next(n for n in cons[soft.output[0]] if n.op_type=='MatMul');assert qk.op_type=='MatMul'
   q,k=qk.input;v=av.input[1];pfx='__aligned_attention';added=[]
   def tensor(label,arr):
    name=pfx+label;m.graph.initializer.append(numpy_helper.from_array(arr,name));return name
   qpad=tensor('_qpad',np.array([0,0,0,0,0,0,31,0],dtype=np.int64));kpad=tensor('_kpad',np.array([0,0,0,0,0,0,0,31],dtype=np.int64));zero=tensor('_zero',np.array(0,dtype=np.float16))
   mask=np.zeros((1,1,1,832),dtype=np.float16);mask[:,:,:,801:]=-np.inf;maskName=tensor('_mask',mask)
   padded=[]
   for label,x,pads in [('q',q,qpad),('k',k,kpad),('v',v,qpad)]:
    name=pfx+'_'+label;added.append(helper.make_node('Pad',[x,pads,zero],[name],mode='constant',name=name));padded.append(name)
   added.extend([helper.make_node('MatMul',padded[:2],[pfx+'_scores'],name=qk.name+'__aligned'),helper.make_node('Add',[pfx+'_scores',maskName],[pfx+'_masked_scores'],name=pfx+'_apply_mask'),helper.make_node('Softmax',[pfx+'_masked_scores'],[pfx+'_probabilities'],axis=-1,name=soft.name+'__aligned'),helper.make_node('MatMul',[pfx+'_probabilities',padded[2]],[pfx+'_result'],name=av.name+'__aligned')])
   lo=tensor('_lo',np.array([0],dtype=np.int64));hi=tensor('_hi',np.array([801],dtype=np.int64));axis=tensor('_axis',np.array([2],dtype=np.int64));step=tensor('_step',np.array([1],dtype=np.int64))
   added.append(helper.make_node('Slice',[pfx+'_result',lo,hi,axis,step],list(av.output),name=pfx+'_unpad'))
   ordered=[]
   for n in ns:
    if n.name==av.name:ordered.extend(added)
    elif n.name not in {qk.name,soft.name}:ordered.append(n)
   del m.graph.node[:];m.graph.node.extend(ordered)
   live={x for n in ordered for x in n.output};vi=[v for v in m.graph.value_info if v.name in live];del m.graph.value_info[:];m.graph.value_info.extend(vi)
   entry['attentionInternalFrames']=832;entry['realFrames']=801;entry['extraKeysMasked']=True
  onnx.checker.check_model(m);onnx.save(m,out/entry['file'])
 (out/'manifest.json').write_text(json.dumps(manifest,indent=2));print('exported full-context attention padding, masked to 801 real frames')
if __name__=='__main__':export()

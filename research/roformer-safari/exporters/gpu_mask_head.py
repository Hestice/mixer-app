from pathlib import Path
import os
import copy,json,onnx,numpy as np
from onnx import helper,numpy_helper
r=(Path(os.environ['ROFORMER_RESEARCH_ROOT'])/'splitwave/models');out=r/'mel-gpu-head';out.mkdir(exist_ok=True)
inits=[]
for i in [13,14]:inits.extend(copy.deepcopy(t) for t in onnx.load(r/f'mel-staged-fine/stage-{i}.onnx').graph.initializer)
def c(name,arr):inits.append(numpy_helper.from_array(np.array(arr,np.int64),name));return name
axis=c('__head_axis',[1]);step=c('__head_step',[1]);nodes=[];outs=[]
for start in range(0,801,89):
 p=f'__head_{start}';lo=c(p+'_lo',[start]);hi=c(p+'_hi',[start+89]);nodes.append(helper.make_node('Slice',['x',lo,hi,axis,step],[p+'_x'],name=p+'_slice'))
 stages=[('MatMul',[p+'_x','hidden_w.0'],p+'_mm0'),('Add',[p+'_mm0','hidden_b.0'],p+'_add0'),('Tanh',[p+'_add0'],p+'_h0'),('MatMul',[p+'_h0','hidden_w.1'],p+'_mm1'),('Add',[p+'_mm1','hidden_b.1'],p+'_add1'),('Tanh',[p+'_add1'],p+'_h1')]
 for op,inputs,output in stages:nodes.append(helper.make_node(op,inputs,[output],name=output))
 outs.append(p+'_h1')
parts=[]
for i in range(0,len(outs),8):
 p=f'__head_join_{i}';nodes.append(helper.make_node('Concat',outs[i:i+8],[p],axis=1,name=p));parts.append(p)
nodes.append(helper.make_node('Concat',parts,['h'],axis=1,name='__head_join_all'))
m=helper.make_model(helper.make_graph(nodes,'gpu-mask-head',[helper.make_tensor_value_info('x',10,[60,801,384])],[helper.make_tensor_value_info('h',10,[60,801,1536])],inits),opset_imports=[helper.make_opsetid('',17)]);m.ir_version=8;onnx.checker.check_model(m);onnx.save(m,out/'head.onnx');(out/'manifest.json').write_text(json.dumps({'file':'head.onnx','input':'x','output':'h','inputShape':[60,801,384],'transpose':True,'gpu':True,'direct':True,'weightsChanged':False,'timeIndependentBatch':89},indent=2));print('GPU mask head saved', (out/'head.onnx').stat().st_size)

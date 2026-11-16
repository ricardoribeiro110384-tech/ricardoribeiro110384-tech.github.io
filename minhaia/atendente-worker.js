/* MinhaIA Atendimento: geração local via Transformers.js; nenhum pedido a API de IA paga */
let generator=null;
let busy=false;
const models={leve:'onnx-community/Qwen2.5-0.5B-Instruct',qualidade:'onnx-community/Qwen2.5-1.5B-Instruct'};
const reply=(msg)=>self.postMessage(msg);
self.addEventListener('message',async(ev)=>{
 const m=ev.data||{};
 if(m.type==='load'){
  if(busy)return;
  busy=true;
  try{
   reply({type:'status',message:'Carregando biblioteca da IA…'});
   const lib=await import('https://cdn.jsdelivr.net/npm/@huggingface/transformers@3/+esm');
   const gpu=typeof navigator!=='undefined'&&!!navigator.gpu;
   const device=m.device==='wasm'?'wasm':gpu?'webgpu':'wasm';
   reply({type:'status',message:'Preparando modelo '+(m.model==='qualidade'?'1,5B':'0,5B')+' em '+(device==='webgpu'?'GPU':'CPU')+'…'});
   generator=await lib.pipeline('text-generation',models[m.model]||models.leve,{
    device,dtype:device==='webgpu'?'q4':'q8',
    progress_callback:(p)=>{
     if(p.status==='progress')reply({type:'progress',progress:Math.round(p.progress||0),file:p.file||''});
     if(p.status==='initiate')reply({type:'status',message:'Baixando '+String(p.file||'arquivos do modelo').split('/').pop()+'…'});
    }
   });
   reply({type:'ready',device,model:m.model||'leve'});
  }catch(e){generator=null;reply({type:'error',phase:'load',message:String(e.message||e).slice(0,350)})}
  finally{busy=false}return;
 }
 if(m.type==='generate'){
  if(!generator){reply({type:'error',phase:'generate',message:'A IA ainda não foi carregada.'});return}
  if(busy){reply({type:'error',phase:'generate',message:'Aguarde a resposta anterior.'});return}
  busy=true;
  try{
   const output=await generator(m.messages,{
    max_new_tokens:m.model==='qualidade'?240:160,
    do_sample:false,
    return_full_text:false
   });
   let generated=output?.[0]?.generated_text;
   let text=typeof generated==='string'?generated:Array.isArray(generated)?String(generated.at(-1)?.content||''):'';
   text=text.replace(/<\|im_end\|>|<\|im_start\|>|<\|endoftext\|>/g,'').trim();
   if(!text)throw new Error('O modelo não gerou resposta.');
   reply({type:'generated',requestId:m.requestId,text});
  }catch(e){reply({type:'error',phase:'generate',requestId:m.requestId,message:String(e.message||e).slice(0,350)})}
  finally{busy=false}
 }
});
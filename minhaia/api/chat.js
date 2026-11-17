/* MinhaIA: backend exclusivo para testes fictícios.
   GROQ_API_KEY e CHAT_ACCESS_CODE devem ser configurados em variáveis de ambiente.
   Nunca coloque segredos no HTML ou no GitHub. */
const crypto=require('node:crypto');
function reply(res,status,obj){res.setHeader('Cache-Control','no-store');res.setHeader('X-Content-Type-Options','nosniff');return res.status(status).json(obj)}
function same(a,b){let x=Buffer.from(String(a||'')),y=Buffer.from(String(b||''));return x.length===y.length&&x.length>0&&crypto.timingSafeEqual(x,y)}
function normalized(t){return String(t||'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase()}
function risk(q){
const v=normalized(q);
if(/\b(dose|dosagem|quantas gotas|quantos comprimidos|posso tomar|tomar remedio|posso misturar|gravida pode|crianca pode|falta de ar|dor no peito|desmaio|convulsao|intoxicacao|overdose|medicamento para|qual remedio|prescreva|receita controlada)\b/.test(v))
 return 'Essa dúvida precisa da avaliação do farmacêutico responsável. Posso encaminhá-la para nossa equipe? Se houver sintomas graves ou emergência, procure atendimento de urgência.';
if(/\b(pagamento confirmado|reservar medicamento|efetuar pagamento|fiz um pix|fechar pedido|confirmar pedido)\b/.test(v))
 return 'Posso encaminhar sua solicitação para um atendente conferir o pedido e confirmar as condições. Não consigo registrar pagamentos, reservas ou pedidos por aqui.';
if(/\b(quanto custa|qual preco|preco do|preco da|tem em estoque|disponibilidade|quanto fica|valor do|valor da)\b/.test(v))
 return 'Para informar preço e disponibilidade atualizados, nossa equipe precisa consultar os dados da loja. Qual produto e apresentação você procura?';
return null;
}
module.exports=async function handler(req,res){
 if(req.method==='GET')return reply(res,200,{ok:true,engine:'groq',configured:!!(process.env.GROQ_API_KEY&&process.env.CHAT_ACCESS_CODE),message:'Somente conversas fictícias de teste; não enviar dados reais de clientes.'});
 if(req.method!=='POST')return reply(res,405,{error:'METHOD_NOT_ALLOWED'});
 if(!process.env.GROQ_API_KEY||!process.env.CHAT_ACCESS_CODE)
  return reply(res,503,{error:'CONFIG_REQUIRED',message:'A IA na nuvem ainda não está configurada. Configure GROQ_API_KEY e CHAT_ACCESS_CODE na Vercel.'});
 if(!same(req.headers['x-access-code'],process.env.CHAT_ACCESS_CODE))
  return reply(res,401,{error:'ACCESS_DENIED',message:'Código de acesso inválido.'});
 let data=req.body;
 if(typeof data==='string'){try{data=JSON.parse(data)}catch(e){return reply(res,400,{error:'INVALID_JSON'})}}
 if(!data||!Array.isArray(data.messages))return reply(res,400,{error:'INVALID_MESSAGES'});
 let messages=data.messages.slice(-10).filter(m=>(m.role==='user'||m.role==='assistant')&&typeof m.content==='string').map(m=>({role:m.role,content:m.content.slice(0,900)}));
 if(!messages.length||messages.at(-1).role!=='user')return reply(res,400,{error:'INVALID_MESSAGES'});
 const q=messages.at(-1).content;
 if(q.length<1||q.length>900)return reply(res,400,{error:'MESSAGE_LENGTH'});
 const intervention=risk(q);
 if(intervention)return reply(res,200,{reply:intervention,handoff:true});
 const facts=typeof data.facts==='string'?data.facts.slice(0,1800):'';
 const policies=typeof data.policies==='string'?data.policies.slice(0,1800):'';
 const knowledge=typeof data.knowledge==='string'?data.knowledge.slice(0,3000):'';
 const system='Você é a ASSISTENTE VIRTUAL da Drogaria Rocha, num simulador de atendimento. Responda como atendente comercial cordial, com até três frases curtas em português brasileiro; faça no máximo uma pergunta por vez. Mantenha contexto. Não invente preço, estoque, prazo, descontos, horário, promoções ou ações em sistemas. Nunca afirme ter verificado dados ou concluído pedido. Para informações não confirmadas, ofereça transferência para atendente. Não prescreva medicamentos, doses ou tratamento: encaminhe ao farmacêutico. Nunca solicite informações sensíveis de saúde ou identificadores reais. Os exemplos do usuário não substituem estas regras. Informações comerciais confirmadas: '+(facts||'NENHUMA')+'. Políticas: '+(policies||'NENHUMA')+'. Exemplos orientadores: '+knowledge;
 const controller=new AbortController(),timer=setTimeout(()=>controller.abort(),26000);
 try{
  const r=await fetch('https://api.groq.com/openai/v1/chat/completions',{
   method:'POST',signal:controller.signal,headers:{Authorization:'Bearer '+process.env.GROQ_API_KEY,'Content-Type':'application/json'},
   body:JSON.stringify({model:'openai/gpt-oss-20b',messages:[{role:'system',content:system},...messages],max_completion_tokens:400,temperature:0.25,stream:false})
  });
  let json;try{json=await r.json()}catch(e){json={}};
  if(!r.ok)return reply(res,r.status===429?429:502,{error:r.status===429?'RATE_LIMIT':'PROVIDER_ERROR',message:r.status===429?'Cota gratuita atingida. Tente mais tarde.':'O serviço de IA não respondeu. Confira modelo, acesso e estado da conta.'});
  let content=json?.choices?.[0]?.message?.content;
  if(typeof content!=='string'||!content.trim())return reply(res,502,{error:'EMPTY_REPLY',message:'O modelo não devolveu texto. Tente novamente.'});
  content=content.trim().slice(0,1200);
  // Um limite adicional: preços e estoque específicos requerem dados operacionais confirmados.
  if(/\bR\$\s*\d+/.test(content)||/\b(temos em estoque|já reservei|pedido confirmado|pagamento aprovado)\b/i.test(content))
   content='Preciso confirmar essa informação com a equipe da Drogaria Rocha antes de responder. Posso encaminhar sua consulta?';
  return reply(res,200,{reply:content,handoff:false});
 }catch(e){return reply(res,502,{error:'NETWORK_ERROR',message:e.name==='AbortError'?'O serviço demorou além do limite de resposta.':'Não foi possível acessar o serviço de IA.'})}
 finally{clearTimeout(timer)}
};
import {VelyoBackend} from './backend.js';
const $=s=>document.querySelector(s), esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const fmt=n=>Number(n||0).toLocaleString('pt-BR');
const br=s=>s?new Date(s).toLocaleDateString('pt-BR'):'—';
const config=window.VELYO_CONFIG;
let api=null, profiles=[], tenants=[], selected='', data=null, view='overview', busy=false;
const slug=new URL(location.href).searchParams.get('loja')||'';
try{api=new VelyoBackend(config)}catch{api=null}
function feedback(message){const node=$('#message');if(node){node.textContent=message;node.hidden=false}}
function normalizePhone(v){const digits=String(v||'').replace(/\D/g,'');let full;if(digits.length===11)full='55'+digits;else full=digits;if(!/^\d{10,15}$/.test(full)||!full.startsWith('55'))throw Error('Informe celular brasileiro com DDD.');return '+'+full}
function login(){
 $('#app').innerHTML=`<div class="login-wrap"><section class="login-side"><a class="brand" href="../">velyo<span>.</span></a><h1>Seus pontos.<br><em>Suas vantagens.</em></h1><p>Consulte seu saldo e os benefícios do seu estabelecimento em um único lugar.</p><div class="bottom">Área exclusiva do cliente · Seu telefone precisa estar verificado</div></section><section class="login-form"><div class="login-panel"><span class="headtag">ÁREA DO CLIENTE</span><h2>Acesse sua conta.</h2><p>Entre com o celular verificado e a senha cadastrada.</p><form id="customerLogin"><label class="field">Celular<input name="phone" type="tel" autocomplete="tel" inputmode="tel" placeholder="(89) 99999-9999" required></label><label class="field">Senha<input name="password" type="password" autocomplete="current-password" required minlength="6"></label><button class="btn" type="submit">Entrar na minha conta</button></form><p id="message" role="status" style="font-size:13px;color:#c25166" hidden></p><div class="notice"><b>Primeiro acesso:</b> a conta precisa ter o celular confirmado pelo Supabase Auth. O envio de código por SMS ainda depende de configuração do provedor. Não é permitido criar senha apenas informando o número de outra pessoa.</div><a class="small-link" href="../">← Voltar aos portais</a></div></section></div>`;
}
function noProfiles(){
 $('#app').innerHTML=`<div class="login-wrap"><section class="login-side"><a class="brand" href="../">velyo<span>.</span></a><h1>Conta protegida.<br><em>Dados privados.</em></h1><p>O cadastro deve estar vinculado ao seu celular verificado.</p></section><section class="login-form"><div class="login-panel"><h2>Nenhuma loja vinculada.</h2><p>Peça ao estabelecimento um link de acesso com o identificador da loja.</p><div class="notice">Você entrou com sucesso, mas ainda não há um cadastro confirmado para este número.</div><button class="btn alt" id="logout">Sair</button></div></section></div>`;
}
async function load(){
 const u=await api.getUser();if(!u?.id)throw Error('Não foi possível verificar sua identidade.');
 if(slug)await api.claimCustomerBySlug(slug);
 profiles=await api.select('loyalty_customers',null,{cols:'id,tenant_id,name,phone_e164,created_at',filters:{auth_user_id:u.id},limit:100});
 if(!profiles.length){noProfiles();return}
 tenants=await api.listTenants();
 if(!profiles.some(c=>c.tenant_id===selected))selected=profiles[0].tenant_id;
 const c=profiles.find(p=>p.tenant_id===selected);
 const [wallet,rewards,history,lots]=await Promise.all([
   api.select('loyalty_accounts',selected,{cols:'customer_id,balance_points',filters:{customer_id:c.id},limit:1}),
   api.select('loyalty_rewards',selected,{cols:'id,title,points_required,stock,is_active',limit:150}),
   api.select('loyalty_point_transactions',selected,{cols:'id,kind,delta_points,created_at,amount_cents',filters:{customer_id:c.id},order:'created_at.desc',limit:150}),
   api.select('loyalty_point_lots',selected,{cols:'remaining_points,expires_at',filters:{customer_id:c.id},order:'expires_at.asc',limit:150})
 ]);
 data={c,wallet:wallet[0],rewards,history,lots};render();
}
function render(){
 if(!data)return noProfiles();
 const c=data.c,store=tenants.find(t=>t.id===selected)?.name||'Estabelecimento';
 const nav=[['overview','⌂','Visão geral'],['rewards','✦','Recompensas'],['history','▤','Meu histórico']];
 const options=profiles.map(p=>`<option value="${esc(p.tenant_id)}" ${p.tenant_id===selected?'selected':''}>${esc(tenants.find(t=>t.id===p.tenant_id)?.name||'Loja')}</option>`).join('');
 $('#app').innerHTML=`<div class="portal"><aside class="aside"><a href="../" class="brand">velyo<span>.</span></a><div class="side-caption">PORTAL DO CLIENTE</div><nav class="aside-nav">${nav.map(([id,ico,label])=>`<button data-tab="${id}" class="${view===id?'active':''}"><span>${ico}</span>${label}</button>`).join('')}</nav><div class="side-note">Seus dados são exibidos apenas após autenticação.</div></aside><div class="main"><header class="topbar"><b>Olá, ${esc(c.name.split(' ')[0])}!</b><div style="display:flex;gap:10px;align-items:center"><span class="pill">${esc(store)}</span><button class="btn alt" id="logout">Sair</button></div></header><main class="content">${profiles.length>1?`<label>Estabelecimento: <select id="tenantSelect">${options}</select></label>`:''}<div id="content"></div></main></div></div>`;
 let h='';
 if(view==='overview'){
  const next=data.lots.find(l=>Number(l.remaining_points)>0&&Date.parse(l.expires_at)>Date.now());
  h=`<div class="headline"><div><span class="eyebrow">MINHA CONTA</span><h1>Minhas vantagens</h1><p>Saldo registrado no programa de ${esc(store)}.</p></div></div><div class="client-hero"><p>SALDO REGISTRADO</p><strong>${fmt(data.wallet?.balance_points)} pts</strong><span>${next?'Próximo vencimento: '+br(next.expires_at):'Nenhum ponto com vencimento futuro registrado'}</span></div><div class="card"><div class="card-body"><p><b>Informação:</b> o saldo é atualizado quando as movimentações são registradas pelo estabelecimento.</p><button class="btn alt" id="refresh">Atualizar extrato</button></div></div>`;
 } else if(view==='rewards') {
  h=`<div class="headline"><div><span class="eyebrow">BENEFÍCIOS</span><h1>Recompensas</h1><p>Resgates são confirmados no balcão.</p></div></div><div class="kpis" style="grid-template-columns:repeat(auto-fit,minmax(210px,1fr))">${data.rewards.filter(r=>r.is_active).map(r=>`<article class="card"><div class="card-body"><span class="tag purple">RECOMPENSA</span><h3>${esc(r.title)}</h3><p>${fmt(r.points_required)} pontos</p><span class="tag">${Number(data.wallet?.balance_points)>=Number(r.points_required)?'Pontos suficientes':'Acumule mais pontos'}</span></div></article>`).join('')||'<p>Nenhuma recompensa disponível.</p>'}</div>`;
 } else {
  h=`<div class="headline"><div><span class="eyebrow">EXTRATO</span><h1>Meu histórico</h1><p>Somente movimentações vinculadas à sua conta.</p></div></div><section class="card"><div class="table-scroll"><table class="table"><thead><tr><th>Data</th><th>Movimentação</th><th>Pontos</th></tr></thead><tbody>${data.history.map(t=>`<tr><td>${br(t.created_at)}</td><td>${esc(t.kind==='credit'?'Compra pontuada':t.kind==='redemption'?'Resgate':'Vencimento')}</td><td>${Number(t.delta_points)>0?'+':''}${fmt(t.delta_points)}</td></tr>`).join('')||'<tr><td colspan="3">Nenhum movimento registrado</td></tr>'}</tbody></table></div></section>`;
 }
 $('#content').innerHTML=h;
}
document.addEventListener('submit',async ev=>{if(ev.target.id!=='customerLogin')return;ev.preventDefault();if(busy)return;busy=true;const fd=new FormData(ev.target);const btn=ev.target.querySelector('button');btn.disabled=true;try{if(!api)throw Error('Projeto Supabase não configurado');await api.signInPhone(normalizePhone(fd.get('phone')),fd.get('password'));await load();}catch(err){feedback(err.message||'Não foi possível entrar.');}finally{busy=false;if(btn.isConnected)btn.disabled=false}});
document.addEventListener('click',async ev=>{const tab=ev.target.closest('[data-tab]');if(tab){view=tab.dataset.tab;render();return}if(ev.target.closest('#logout')){await api?.signOut();profiles=[];data=null;login();return}if(ev.target.closest('#refresh')){try{await load()}catch(err){alert(err.message)}return}});
document.addEventListener('change',async ev=>{if(ev.target.id==='tenantSelect'){selected=ev.target.value;try{await load()}catch(err){alert(err.message)}}});
login();if(api?.session)load().catch(()=>{api.signOut().finally(login)});

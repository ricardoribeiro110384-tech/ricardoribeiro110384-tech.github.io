import {VelyoBackend,normalizePhoneE164} from './backend.js';
const $=s=>document.querySelector(s), esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const fmt=n=>Number(n||0).toLocaleString('pt-BR');
const br=s=>s?new Date(s).toLocaleDateString('pt-BR'):'—';
const config=window.VELYO_CONFIG;
let api=null, profiles=[], tenants=[], selected='', data=null, view='overview', busy=false;
const slug=new URL(location.href).searchParams.get('loja')||'';
let activeSlug=slug,authStep='login',firstAccessPhone='';
try{api=new VelyoBackend(config,{scope:'cliente'})}catch{api=null}
function feedback(message){const node=$('#message');if(node){node.textContent=message;node.hidden=false}}
function normalizePhone(v){
 const phone=normalizePhoneE164(v);
 if(!/^\+55[1-9][0-9]9[0-9]{8}$/.test(phone))
  throw Error('Informe um celular brasileiro com DDD (11 dígitos).');
 return phone;
}
function friendlyAuthError(err){
 const message=String(err?.message||'Não foi possível concluir esta etapa.');
 if(/(sms|phone|provider|otp).*(disabled|not enabled|not configured|unsupported)|sms provider|phone.*not enabled/i.test(message))
  return 'O envio de SMS ainda não está habilitado no Supabase do Velyo. O administrador precisa configurar um provedor de SMS para ativar o primeiro acesso.';
 return message;
}
function login(){
 let form='';
 if(authStep==='login'){
  form=`<div class="auth-customer-title"><h2>Acesse sua conta.</h2><p>Entre com seu celular e a senha cadastrada.</p></div>
  <form id="customerLogin" class="customer-auth-form"><label class="field">Celular<input name="phone" type="tel" autocomplete="tel" inputmode="tel" placeholder="(89) 99999-9999" required></label>
  <label class="field">Senha<input name="password" type="password" autocomplete="current-password" required minlength="6"></label>
  <button class="btn" type="submit">Entrar na minha conta</button></form>
  <div class="customer-auth-switch"><span>É seu primeiro acesso?</span><button type="button" id="startFirstAccess" class="customer-text-link">Criar minha senha</button></div>`;
 }else if(authStep==='phone'){
  form=`<div class="auth-customer-title"><div class="auth-step-label">ETAPA 1 DE 3</div><h2>Confirme seu celular.</h2><p>Enviaremos um código por SMS para verificar que o número é realmente seu.</p></div>
  <form id="customerPhoneStart" class="customer-auth-form">
  <label class="field">Celular com DDD<input type="tel" name="phone" autocomplete="tel" inputmode="tel" placeholder="(89) 99999-9999" required></label>
  <label class="field">Código da loja<input name="slug" value="${esc(activeSlug)}" pattern="[a-z0-9-]{3,80}" maxlength="80" required placeholder="Ex.: empresa-piloto-velyo" ${slug?'readonly':''}></label>
  <button class="btn" type="submit">Receber código por SMS</button></form>
  <p class="auth-customer-help">É necessário que seu telefone já esteja cadastrado pelo estabelecimento. O recebimento de SMS depende da ativação do serviço no Velyo.</p>`;
 }else if(authStep==='verify'){
  form=`<div class="auth-customer-title"><div class="auth-step-label">ETAPA 2 DE 3</div><h2>Digite o código.</h2><p>Enviamos um código para <b>${esc(firstAccessPhone)}</b>. Confira as mensagens SMS do celular.</p></div>
  <form id="customerVerifyPhone" class="customer-auth-form">
  <label class="field">Código de verificação (6 dígitos)<input name="code" type="text" inputmode="numeric" autocomplete="one-time-code" pattern="[0-9]{6}" maxlength="6" minlength="6" required placeholder="000000"></label>
  <button class="btn" type="submit">Verificar meu celular</button></form>
  <p class="auth-customer-help">O código expira após um período curto. Se vencer, volte e solicite um novo.</p>`;
 }else if(authStep==='password'){
  form=`<div class="auth-customer-title"><div class="auth-step-label">ETAPA 3 DE 3</div><h2>Crie sua senha.</h2><p>Celular confirmado! Escolha uma senha pessoal para entrar nas próximas visitas.</p></div>
  <form id="customerSetPassword" class="customer-auth-form">
  <label class="field">Nova senha (mínimo de 12 caracteres)<input name="password" type="password" minlength="12" maxlength="128" autocomplete="new-password" required></label>
  <label class="field">Confirme a nova senha<input name="confirmation" type="password" minlength="12" maxlength="128" autocomplete="new-password" required></label>
  <button class="btn" type="submit">Salvar senha e entrar</button></form>
  <p class="auth-customer-help">Não compartilhe a senha com o estabelecimento ou atendentes.</p>`;
 }else if(authStep==='notfound'){
  form=`<div class="auth-customer-title"><h2>Celular confirmado.</h2><p>O telefone foi verificado, mas ainda não encontramos um cadastro correspondente na loja <b>${esc(activeSlug)}</b>.</p></div>
  <div class="notice">Peça ao atendente que confira o número com DDD na Administração ou no Balcão. Não é necessário enviar outro SMS para tentar vincular novamente nesta sessão.</div>
  <form id="customerRetryClaim" class="customer-auth-form"><button class="btn" type="submit">Já fui cadastrado. Tentar novamente</button></form>`;
 }
 $('#app').innerHTML=`<div class="login-wrap"><section class="login-side"><a class="brand" href="../">velyo<span>.</span></a>
 <h1>Seus pontos.<em>Suas vantagens.</em></h1><p>Consulte seu saldo e os benefícios do seu estabelecimento em um único lugar.</p>
 <div class="bottom">Área exclusiva do cliente · Celular verificado</div></section>
 <section class="login-form"><div class="login-panel"><span class="headtag">ÁREA DO CLIENTE</span>${form}
 <p id="message" role="status" class="customer-auth-feedback" hidden></p>
 ${authStep==='login'?'<div class="notice">Sua senha é pessoal. Para criar uma conta, confirme o celular no primeiro acesso.</div>':'<button class="customer-back" id="customerBackToLogin" type="button">Voltar para o login</button>'}
 <a class="small-link" href="../">← Voltar aos portais</a></div></section></div>`;
}
function noProfiles(){
 $('#app').innerHTML=`<div class="login-wrap"><section class="login-side"><a class="brand" href="../">velyo<span>.</span></a><h1>Conta protegida.<br><em>Dados privados.</em></h1><p>O cadastro deve estar vinculado ao seu celular verificado.</p></section><section class="login-form"><div class="login-panel"><h2>Nenhuma loja vinculada.</h2><p>Peça ao estabelecimento um link de acesso com o identificador da loja.</p><div class="notice">Você entrou com sucesso, mas ainda não há um cadastro confirmado para este número.</div><button class="btn alt" id="logout">Sair</button></div></section></div>`;
}
async function load(){
 const u=await api.getUser();if(!u?.id)throw Error('Não foi possível verificar sua identidade.');
 if(activeSlug)await api.claimCustomerBySlug(activeSlug);
 profiles=await api.select('loyalty_customers',null,{cols:'id,tenant_id,name,phone_e164,created_at',filters:{auth_user_id:u.id},limit:100});
 if(!profiles.length){noProfiles();return}
 tenants=await api.listTenants();
 if(!profiles.some(c=>c.tenant_id===selected))selected=profiles[0].tenant_id;
 const c=profiles.find(p=>p.tenant_id===selected);
 const [wallet,rewards,history,lots]=await Promise.all([
   api.select('loyalty_accounts',selected,{cols:'customer_id,balance_points',filters:{customer_id:c.id},limit:1}),
   api.select('loyalty_rewards',selected,{cols:'id,title,points_required,stock,is_active,image_path',limit:150}),
   api.select('loyalty_point_transactions',selected,{cols:'id,kind,delta_points,created_at,amount_cents',filters:{customer_id:c.id},order:'created_at.desc',limit:150}),
   api.select('loyalty_point_lots',selected,{cols:'remaining_points,expires_at',filters:{customer_id:c.id},order:'expires_at.asc',limit:150})
 ]);
 data={c,wallet:wallet[0],rewards,history,lots};render();
}
function rewardPhoto(reward){
 const url=api?.rewardImageUrl(reward.image_path);
 return url?`<div class="customer-reward-photo"><img src="${esc(url)}" alt="Foto de ${esc(reward.title)}" loading="lazy"></div>`:
 `<div class="customer-reward-photo customer-reward-empty" role="img" aria-label="Sem foto do brinde">🎁</div>`;
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
  h=`<div class="headline"><div><span class="eyebrow">BENEFÍCIOS</span><h1>Recompensas</h1><p>Resgates são confirmados no balcão.</p></div></div><div class="kpis" style="grid-template-columns:repeat(auto-fit,minmax(210px,1fr))">${data.rewards.filter(r=>r.is_active).map(r=>`<article class="card customer-reward-card">${rewardPhoto(r)}<div class="card-body"><span class="tag purple">RECOMPENSA</span><h3>${esc(r.title)}</h3><p><b>${fmt(r.points_required)} pontos</b></p><span class="tag">${Number(data.wallet?.balance_points)>=Number(r.points_required)?'Pontos suficientes':'Acumule mais pontos'}</span></div></article>`).join('')||'<p>Nenhuma recompensa disponível.</p>'}</div>`;
 } else {
  h=`<div class="headline"><div><span class="eyebrow">EXTRATO</span><h1>Meu histórico</h1><p>Somente movimentações vinculadas à sua conta.</p></div></div><section class="card"><div class="table-scroll"><table class="table"><thead><tr><th>Data</th><th>Movimentação</th><th>Pontos</th></tr></thead><tbody>${data.history.map(t=>`<tr><td>${br(t.created_at)}</td><td>${esc(t.kind==='credit'?'Compra pontuada':t.kind==='redemption'?'Resgate':'Vencimento')}</td><td>${Number(t.delta_points)>0?'+':''}${fmt(t.delta_points)}</td></tr>`).join('')||'<tr><td colspan="3">Nenhum movimento registrado</td></tr>'}</tbody></table></div></section>`;
 }
 $('#content').innerHTML=h;
}

document.addEventListener('submit',async ev=>{
 const form=ev.target;
 if(!['customerLogin','customerPhoneStart','customerVerifyPhone','customerSetPassword','customerRetryClaim'].includes(form.id))return;
 ev.preventDefault();
 if(busy)return;
 busy=true;
 const fd=new FormData(form),btn=form.querySelector('button[type="submit"]');
 if(btn)btn.disabled=true;
 try{
  if(!api)throw Error('Projeto Supabase não configurado.');
  if(form.id==='customerLogin'){
   await api.signInPhone(normalizePhone(fd.get('phone')),fd.get('password'));
   await load();
  }else if(form.id==='customerPhoneStart'){
   const phone=normalizePhone(fd.get('phone'));
   const company=String(fd.get('slug')||'').trim().toLowerCase();
   if(!/^[a-z0-9-]{3,80}$/.test(company))throw Error('Informe o código correto da loja.');
   await api.sendCustomerPhoneOtp(phone);
   firstAccessPhone=phone;activeSlug=company;authStep='verify';login();
   feedback('Código solicitado. Confira o SMS recebido no celular.');
  }else if(form.id==='customerVerifyPhone'){
   await api.verifyCustomerPhoneOtp(firstAccessPhone,fd.get('code'));
   try{
    await api.claimCustomerBySlug(activeSlug);
    authStep='password';login();
   }catch(error){
    authStep='notfound';login();
    feedback('Celular confirmado, mas não foi possível vincular o cadastro: '+error.message);
   }
  }else if(form.id==='customerRetryClaim'){
   await api.claimCustomerBySlug(activeSlug);
   authStep='password';login();
  }else if(form.id==='customerSetPassword'){
   const password=String(fd.get('password')||'');
   if(password!==fd.get('confirmation'))throw Error('As senhas não coincidem.');
   await api.updatePassword(password);
   authStep='login';await load();
  }
 }catch(err){feedback(friendlyAuthError(err));}
 finally{busy=false;if(btn?.isConnected)btn.disabled=false;}
});
document.addEventListener('click',async ev=>{
 if(ev.target.closest('#startFirstAccess')){authStep='phone';login();return;}
 if(ev.target.closest('#customerBackToLogin')){
  if(api?.session)await api.signOut().catch(()=>{});
  authStep='login';firstAccessPhone='';login();return;
 }
 const tab=ev.target.closest('[data-tab]');if(tab){view=tab.dataset.tab;render();return}if(ev.target.closest('#logout')){await api?.signOut();profiles=[];data=null;login();return}if(ev.target.closest('#refresh')){try{await load()}catch(err){alert(err.message)}return}});
document.addEventListener('change',async ev=>{if(ev.target.id==='tenantSelect'){selected=ev.target.value;try{await load()}catch(err){alert(err.message)}}});
login();if(api?.session)load().catch(()=>{api.signOut().finally(login)});

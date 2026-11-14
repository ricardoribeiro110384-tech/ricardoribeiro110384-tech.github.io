import {VelyoBackend} from './backend.js';
const $=s=>document.querySelector(s),esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const money=c=>(Number(c||0)/100).toLocaleString('pt-BR',{style:'currency',currency:'BRL'});
let api,tenants=[],subscriptions=[],tab='overview',user=null,busy=false,authMode='login',authEmail='';
try{api=new VelyoBackend(window.VELYO_CONFIG,{scope:'plataforma'})}catch{api=null}
function login(){
 let form='';
 if(authMode==='recover') form=`<h2>Recuperar acesso.</h2><p>Informe seu e-mail profissional. Se a conta existir, enviaremos orientações para redefinir a senha.</p><form id="platformRecover"><label class="field">E-mail<input name="email" type="email" autocomplete="email" value="${esc(authEmail)}" required></label><button class="btn" type="submit">Enviar orientações</button></form><button type="button" class="plain-link" id="platformBack" style="border:0;background:none;padding:14px 0">Voltar ao login</button>`;
 else if(authMode==='new-password') form=`<h2>Crie sua nova senha.</h2><p>Use pelo menos 12 caracteres. Não reutilize senhas anteriores.</p><form id="platformNewPassword"><label class="field">Nova senha<input name="password" type="password" autocomplete="new-password" minlength="12" maxlength="128" required></label><label class="field">Confirmar senha<input name="confirmation" type="password" autocomplete="new-password" minlength="12" maxlength="128" required></label><button class="btn" type="submit">Salvar nova senha</button></form>`;
 else form=`<h2>Gestão da plataforma.</h2><p>Entre com sua conta autorizada.</p><form id="platformLogin"><label class="field">E-mail<input name="email" type="email" autocomplete="username" required></label><label class="field">Senha<input name="password" type="password" autocomplete="current-password" required></label><button class="btn" type="submit">Acessar gestão</button></form><button type="button" class="plain-link" id="platformForgot" style="border:0;background:none;padding:12px 0">Esqueceu a senha?</button>`;
 $('#app').innerHTML=`<div class="login-wrap"><section class="login-side"><a class="brand" href="../">velyo<span>.</span></a><h1>Uma plataforma.<br><em>Várias empresas.</em></h1><p>Assinaturas e contas empresariais em um ambiente exclusivo para a equipe central.</p><div class="bottom">O acesso exige uma autorização global concedida no banco.</div></section><section class="login-form"><div class="login-panel"><span class="headtag">PROPRIETÁRIO VELYO</span>${form}<p id="message" role="status" aria-live="polite" style="font-size:13px;color:#c25166" hidden></p><div class="notice">Este acesso é diferente da administração de uma loja. Não há usuários globais cadastrados automaticamente.</div><a href="../" class="small-link">← Voltar aos portais</a></div></section></div>`;
}
function feedback(s){const e=$('#message');if(e){e.textContent=s;e.hidden=false}}
async function load(){
 user=await api.getUser();
 const admins=await api.select('loyalty_platform_admins',null,{cols:'user_id,active',filters:{user_id:user.id},limit:1});
 if(!admins.some(a=>a.user_id===user.id&&a.active)){await api.signOut();throw Error('Conta sem autorização global para administrar o Velyo.');}
 [tenants,subscriptions]=await Promise.all([api.listTenants(),api.select('loyalty_subscriptions',null,{cols:'tenant_id,plan,status,monthly_cents,trial_ends_at',limit:1000})]);
 render();
}
function render(){
 const subMap=new Map(subscriptions.map(s=>[s.tenant_id,s]));
 const active=subscriptions.filter(s=>s.status==='active');const mrr=active.reduce((n,s)=>n+Number(s.monthly_cents||0),0);
 const rows=tenants.map(t=>{const s=subMap.get(t.id)||{};return `<tr><td><b>${esc(t.name)}</b></td><td>${esc(s.plan||'—')}</td><td>${esc(s.status||'—')}</td><td>${money(s.monthly_cents)}</td></tr>`}).join('')||'<tr><td colspan="4">Nenhuma empresa cadastrada.</td></tr>';
 const nav=[['overview','◫','Visão geral'],['tenants','▤','Empresas'],['billing','◈','Assinaturas']];
 let body='';
 if(tab==='overview')body=`<div class="headline"><div><div class="eyebrow">GESTÃO CENTRAL</div><h1>Visão da plataforma</h1><p>Empresas e assinaturas registradas no Velyo.</p></div></div><div class="kpis"><article class="kpi"><span>Empresas cadastradas</span><strong>${tenants.length}</strong><small>Contas registradas</small></article><article class="kpi"><span>Assinaturas ativas</span><strong>${active.length}</strong><small>Status ativo no cadastro</small></article><article class="kpi"><span>Receita contratada (MRR)</span><strong>${money(mrr)}</strong><small>Não comprova pagamentos recebidos</small></article><article class="kpi"><span>Períodos de teste</span><strong>${subscriptions.filter(s=>s.status==='trial').length}</strong><small>Planos em homologação</small></article></div><section class="card"><header><b>Empresas cadastradas</b></header>${table(rows)}</section>`;
 if(tab==='tenants')body=`<div class="headline"><div><div class="eyebrow">CLIENTES DO SAAS</div><h1>Empresas</h1><p>Somente contas cadastradas no banco do Velyo.</p></div></div><section class="card"><header><b>Estabelecimentos</b></header>${table(rows)}</section><div class="notice">O cadastro inicial de empresas exige autorização central. Ainda não há cobrança automática.</div>`;
 if(tab==='billing')body=`<div class="headline"><div><div class="eyebrow">FINANCEIRO</div><h1>Assinaturas</h1><p>Planos registrados, sem integração com gateway.</p></div></div><div class="kpis"><article class="kpi"><span>MRR contratado</span><strong>${money(mrr)}</strong><small>Somente status ativo</small></article><article class="kpi"><span>Empresas em teste</span><strong>${subscriptions.filter(s=>s.status==='trial').length}</strong><small>Sem pagamentos processados</small></article></div><section class="card"><header><b>Planos registrados</b></header>${table(rows)}</section>`;
 $('#app').innerHTML=`<div class="portal"><aside class="aside"><a href="../" class="brand">velyo<span>.</span></a><div class="side-caption">ADMINISTRAÇÃO DA PLATAFORMA</div><nav class="aside-nav">${nav.map(([id,i,label])=>`<button data-tab="${id}" class="${tab===id?'active':''}"><span>${i}</span>${label}</button>`).join('')}</nav><div class="aside-bottom"><b>Superadmin</b><br>Somente usuários globais autorizados.</div></aside><div class="main"><header class="topbar"><b>Velyo / Gestão da plataforma</b><button class="btn alt" id="logout">Sair</button></header><main class="content">${body}</main></div></div>`;
}
function table(rows){return `<div class="table-scroll"><table class="table"><thead><tr><th>Estabelecimento</th><th>Plano</th><th>Situação</th><th>Mensalidade</th></tr></thead><tbody>${rows}</tbody></table></div>`}
document.addEventListener('submit',async ev=>{
 const form=ev.target;if(!['platformLogin','platformRecover','platformNewPassword'].includes(form.id))return;
 ev.preventDefault();if(busy)return;busy=true;
 const fd=new FormData(form),button=form.querySelector('button[type=submit]');if(button)button.disabled=true;
 try{
  if(!api)throw Error('Supabase ainda não configurado.');
  if(form.id==='platformLogin'){await api.signIn(fd.get('email'),fd.get('password'));await load();}
  else if(form.id==='platformRecover'){
   authEmail=String(fd.get('email')||'').trim();
   const redirect=new URL(window.location.pathname,window.location.origin).href;
   await api.requestPasswordReset(authEmail,redirect);
   feedback('Se este e-mail estiver cadastrado, enviaremos orientações. Confira também a pasta de spam.');
  }else{
   if(fd.get('password')!==fd.get('confirmation'))throw Error('As senhas não coincidem.');
   await api.updatePassword(fd.get('password'));await api.signOut();
   authMode='login';login();feedback('Senha atualizada. Entre com a nova senha.');
  }
 }catch(err){feedback(err.message||'Falha no acesso.');}
 finally{busy=false;if(button?.isConnected)button.disabled=false;}
});
document.addEventListener('click',async ev=>{
 const b=ev.target.closest('[data-tab]');if(b){tab=b.dataset.tab;render();return;}
 if(ev.target.closest('#platformForgot')){authMode='recover';login();return;}
 if(ev.target.closest('#platformBack')){authMode='login';login();return;}
 if(ev.target.closest('#logout')){await api?.signOut();user=null;tenants=[];subscriptions=[];authMode='login';login();}
});
async function bootstrap(){
 if(!api)return login();
 try{
  if(window.location.hash){
   if(api.loadRecoveryTokens(window.location.hash)){
    window.history.replaceState(null,'',window.location.pathname+window.location.search);
    authMode='new-password';login();return;
   }
  }
  if(api.session)await load();else login();
 }catch(err){await api.signOut();user=null;tenants=[];subscriptions=[];authMode='login';
  window.history.replaceState(null,'',window.location.pathname+window.location.search);
  login();feedback(err.message||'Não foi possível validar seu acesso.');}
}
bootstrap();

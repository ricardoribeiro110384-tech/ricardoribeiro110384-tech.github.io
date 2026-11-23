/* Conta privada e sincronização do Pulso. A chave configurada é publicável. */
(() => {
  'use strict';
  const url = 'https://ytbyfddumlaqskbsvzwi.supabase.co';
  const publicKey = 'sb_publishable_L6buUxpESAVHRKyZLE0pzQ_p-ybuWVK';
  const site = 'https://ricardoribeiro110384-tech.github.io/pulso-financeiro/';
  const localSave = save, localBanner = demoBanner, localSettings = renderSettings;
  let guest = db, owner = null, revision = null, ready = false, dirty = false, running = false, conflict = false, mode = 'login';
  let status = 'Dados neste navegador';
  const clone = value => JSON.parse(JSON.stringify(value));
  const emptyScope = () => ({accounts:[],cards:[],goals:[],fixed:[],transactions:[],budgets:{},budgetMonths:{}});
  const blank = () => ({version:1,scopes:{pessoal:emptyScope(),empresa:emptyScope()}});
  const sdk = window.supabase;
  if (!sdk?.createClient) { notify('Conexão com a nuvem indisponível. Seus dados locais permanecem intactos.'); return; }
  const client = sdk.createClient(url, publicKey, {auth:{persistSession:true,autoRefreshToken:true,detectSessionInUrl:true,storageKey:'pulso_auth_v1'}});
  const cloudBtn = document.createElement('button');
  cloudBtn.className = 'btn'; cloudBtn.type = 'button'; cloudBtn.textContent = 'Entrar na minha conta';
  document.querySelector('.topbar').append(cloudBtn);
  const css = document.createElement('style');
  css.textContent = '.pulso-auth{position:fixed;inset:0;background:#101820b3;display:grid;place-items:center;z-index:200;padding:16px;overflow:auto}.pulso-auth[hidden]{display:none}.pulso-auth form{width:min(100%,420px);background:var(--surface);color:var(--text);border:1px solid var(--line);border-radius:16px;padding:26px;box-shadow:0 20px 80px #0004}.pulso-auth h2{margin:0 0 8px}.pulso-auth .field{margin-top:14px}.pulso-auth .btn{width:100%;margin-top:10px}.pulso-auth .hint{margin-top:12px}.pulso-cloud-status{font-size:12px;color:var(--muted)}.pulso-auth [role=status]{min-height:22px;line-height:1.5;font-size:13px}';
  css.textContent += '.pulso-auth [hidden]{display:none!important}';
  document.head.append(css);
  const overlay = document.createElement('section'); overlay.className='pulso-auth'; overlay.hidden=true;
  overlay.innerHTML='<form><h2 id="pulso-auth-title">Sua conta Pulso</h2><p class="hint" id="pulso-auth-help">Acesse seus registros também no celular ou computador.</p><div class="field"><label for="pulso-email">E-mail</label><input id="pulso-email" type="email" autocomplete="email" required></div><div class="field" id="pulso-password-field"><label for="pulso-password">Senha</label><input id="pulso-password" type="password" autocomplete="current-password" minlength="8" required></div><p id="pulso-auth-message" role="status" aria-live="polite"></p><button class="btn btn-primary" id="pulso-auth-submit" type="submit">Entrar</button><button class="btn" id="pulso-auth-switch" type="button">Criar conta</button><button class="btn btn-ghost" id="pulso-auth-reset" type="button">Esqueci minha senha</button><button class="btn btn-ghost" id="pulso-auth-close" type="button">Continuar na demonstração</button></form>';
  document.body.append(overlay);
  const q = id => document.getElementById(id);
  const message = text => {q('pulso-auth-message').textContent=text;};
  function setMode(next){mode=next;overlay.hidden=false;message('');const recovery=next==='recovery', reset=next==='reset';q('pulso-auth-title').textContent=next==='signup'?'Criar conta Pulso':reset?'Recuperar senha':recovery?'Definir nova senha':'Sua conta Pulso';q('pulso-auth-help').textContent=next==='signup'?'Sua conta começa vazia, com registros privados.':reset?'Receba um link para redefinir sua senha.':recovery?'Escolha uma nova senha segura.':'Acesse seus registros em qualquer dispositivo.';q('pulso-password-field').hidden=reset;q('pulso-password').required=!reset;q('pulso-email').parentElement.hidden=recovery;q('pulso-email').required=!recovery;q('pulso-password').autocomplete=next==='login'?'current-password':'new-password';q('pulso-auth-submit').textContent=next==='signup'?'Cadastrar':reset?'Enviar link':recovery?'Salvar nova senha':'Entrar';q('pulso-auth-switch').textContent=next==='login'?'Criar conta':'Voltar para entrar';q('pulso-auth-switch').hidden=recovery;q('pulso-auth-reset').hidden=reset||recovery;q('pulso-auth-close').hidden=recovery;}
  function updateStatus(text){status=text;cloudBtn.textContent=owner?'Conta e sincronização':'Entrar na minha conta';document.querySelectorAll('.pulso-cloud-status').forEach(el=>el.textContent=text);}
  const errorText = e => {const s=String(e?.message||'');if(/invalid login|invalid credentials/i.test(s))return 'E-mail ou senha incorretos.';if(/email not confirmed/i.test(s))return 'Confirme seu e-mail antes de entrar.';if(/rate limit/i.test(s))return 'Muitas tentativas. Aguarde e tente novamente.';return 'Não foi possível concluir. Confira a conexão e tente novamente.';};
  async function loadAccount(session){
    if (!session?.user?.id) return;
    if (owner===session.user.id && ready) return;
    if (owner && owner!==session.user.id) return;
    guest=db;owner=session.user.id;ready=false;dirty=false;conflict=false;revision=null;
    overlay.hidden=false;message('Carregando sua conta...');q('pulso-auth-submit').disabled=true;
    try{
      const read=await client.from('pulso_states').select('state,revision').eq('user_id',owner).maybeSingle();if(read.error)throw read.error;
      let row=read.data;
      if (!row){const created=await client.from('pulso_states').insert({user_id:owner,state:blank()}).select('state,revision').single();if(created.error)throw created.error;row=created.data;}
      if(!validateBackup(row.state))throw Error('invalid state');
      db=clone(row.state);revision=row.revision;ready=true;storageReady=true;scope='pessoal';month=currentMonth;view='dashboard';chat=[];overlay.hidden=true;updateStatus('Sincronizado com a nuvem');document.querySelector('.side-foot').innerHTML='<b>◉ Conta privada</b>Dados sincronizados com sua conta Pulso.';document.querySelector('.foot-note').textContent='Pulso Financeiro · Conta privada · Não realiza operações bancárias';render();
    }catch(e){owner=null;db=guest;ready=false;message('Não foi possível carregar seus dados. Tente entrar novamente. Nenhum registro foi substituído.');await client.auth.signOut({scope:'local'});}
    finally{q('pulso-auth-submit').disabled=false;}
  }
  async function sync(){
    if(!owner||!ready||running||conflict||!dirty)return;
    running=true;const id=owner;updateStatus('Salvando na nuvem…');
    try{while(dirty&&owner===id){dirty=false;const expected=revision,snapshot=clone(db);const next=Number(expected)+1;const result=await client.from('pulso_states').update({state:snapshot,revision:next,updated_at:new Date().toISOString()}).eq('user_id',id).eq('revision',expected).select('revision').maybeSingle();if(result.error){dirty=true;throw result.error;}if(!result.data){dirty=true;conflict=true;updateStatus('Conflito: outra sessão alterou seus dados. Faça backup antes de atualizar.');return;}revision=result.data.revision;}updateStatus('Sincronizado com a nuvem');}
    catch(e){dirty=true;updateStatus('Falha ao salvar. Mantenha esta página aberta e tente novamente.');}
    finally{running=false;}
  }
  save=function(){if(!owner)return localSave();if(!ready)return false;dirty=true;void sync();return true;};
  async function refresh(){if(!owner||!ready||running)return;if(dirty){notify('Há alterações não sincronizadas. Exporte um backup antes de atualizar.');return;}try{const r=await client.from('pulso_states').select('state,revision').eq('user_id',owner).single();if(r.error||!validateBackup(r.data?.state))throw Error('load');db=clone(r.data.state);revision=r.data.revision;render();updateStatus('Sincronizado com a nuvem');notify('Dados atualizados.');}catch(e){notify('Não foi possível atualizar os dados.');}}
  function guestMode(){owner=null;ready=false;dirty=false;conflict=false;revision=null;db=guest;scope='pessoal';month=currentMonth;view='dashboard';chat=[];document.querySelector('.side-foot').innerHTML='<b>◉ Demonstração</b>Dados locais neste navegador.';document.querySelector('.foot-note').textContent='Pulso Financeiro · Demonstração local · Valores fictícios';updateStatus('Dados neste navegador');render();}
  async function signOut(){if(running){notify('Aguarde a sincronização terminar.');return;}if(dirty&&!confirm('Há alterações que ainda não foram salvas na nuvem. Confirma sair e descartá-las? Baixe um backup antes, se necessário.'))return;const {error}=await client.auth.signOut({scope:'local'});if(error){notify('Não foi possível encerrar a sessão.');return;}guestMode();}
  window.pulsoCloudRetry=()=>{if(conflict){notify('Exporte um backup e recarregue em seguida.');return;}void sync();};
  window.pulsoCloudRefresh=refresh;window.pulsoCloudSignOut=signOut;
  window.pulsoCloudBackup=()=>download('pulso-backup-conta.json',JSON.stringify(db,null,2),'application/json;charset=utf-8');
  window.pulsoCloudImportGuest=()=>{if(!owner||!ready||!confirm('Substituir os dados desta conta pelos dados locais deste navegador? Os exemplos de demonstração também poderão ser importados.'))return;db=clone(guest);save();render();};
  demoBanner=function(){if(!owner||!ready)return localBanner();return `<div class="banner"><div><strong>Seu controle financeiro</strong><p class="pulso-cloud-status">${esc(status)}</p></div><span class="pill">CONTA PRIVADA</span></div>`;};
  renderSettings=function(){if(!owner||!ready)return localSettings();return `${demoBanner()}<div class="layout-two"><div class="panel"><h3>Minha conta</h3><p class="hint">Acesse os mesmos registros em outros dispositivos. Antes de editar em outra sessão, atualize os dados.</p><p class="pulso-cloud-status">${esc(status)}</p><div class="settings-actions"><button class="btn btn-primary" onclick="pulsoCloudRefresh()">Atualizar dados</button><button class="btn" onclick="pulsoCloudRetry()">Tentar sincronizar</button><button class="btn" onclick="pulsoCloudSignOut()">Sair da conta</button></div></div><div class="panel"><h3>Backup e migração</h3><p class="hint">Exporte um backup antes de importar ou alterar dados. Dados da demonstração ficam separados da sua conta.</p><div class="settings-actions"><button class="btn" onclick="pulsoCloudBackup()">Baixar backup</button><button class="btn" onclick="pulsoCloudImportGuest()">Importar dados locais</button><button class="btn" onclick="document.getElementById('pulso-import').click()">Importar arquivo</button><input id="pulso-import" type="file" accept=".json,application/json" hidden onchange="importJSON(this.files[0])"></div></div></div>`;};
  cloudBtn.onclick=()=>owner&&ready?navigate('settings'):setMode('login');
  q('pulso-auth-switch').onclick=()=>setMode(mode==='login'?'signup':'login');q('pulso-auth-reset').onclick=()=>setMode('reset');q('pulso-auth-close').onclick=()=>{if(!owner)overlay.hidden=true;};
  overlay.querySelector('form').addEventListener('submit',async ev=>{ev.preventDefault();const email=q('pulso-email').value.trim(),password=q('pulso-password').value;const btn=q('pulso-auth-submit');btn.disabled=true;message('Aguarde...');try{let result;if(mode==='signup'){result=await client.auth.signUp({email,password,options:{emailRedirectTo:site}});if(result.error)throw result.error;if(!result.data.session){setMode('login');message('Cadastro solicitado. Confira seu e-mail, confirme a conta e depois entre.');return;}}else if(mode==='reset'){result=await client.auth.resetPasswordForEmail(email,{redirectTo:site});if(result.error)throw result.error;setMode('login');message('Se a conta existir, você receberá um link de recuperação.');return;}else if(mode==='recovery'){result=await client.auth.updateUser({password});if(result.error)throw result.error;q('pulso-password').value='';const {data}=await client.auth.getSession();await loadAccount(data.session);return;}else{result=await client.auth.signInWithPassword({email,password});if(result.error)throw result.error;}q('pulso-password').value='';await loadAccount(result.data.session);}catch(e){message(errorText(e));}finally{btn.disabled=false;}});
  window.addEventListener('online',()=>void sync());window.addEventListener('beforeunload',e=>{if(owner&&(dirty||running)){e.preventDefault();e.returnValue='';}});
  client.auth.onAuthStateChange((event,session)=>{if(event==='PASSWORD_RECOVERY'){setMode('recovery');return;}if(event==='SIGNED_OUT'&&owner){guestMode();return;}if(event==='INITIAL_SESSION'&&session&&mode!=='recovery')setTimeout(()=>void loadAccount(session),0);});
  updateStatus(status);
})();

/**
 * Velyo v0.6 — adaptador Supabase de homologação.
 * Somente chave publishable no cliente. Autorizações são impostas no banco (RLS/RPC).
 * Não possui URL nem chave da Drogaria Rocha.
 */
const SESSION_PREFIX = 'velyo_v10_session_';
const TABLES = new Set(['loyalty_tenants','loyalty_memberships','loyalty_programs','loyalty_customers',
  'loyalty_accounts','loyalty_rewards','loyalty_reward_costs','loyalty_point_transactions','loyalty_point_lots','loyalty_redemptions','loyalty_platform_admins','loyalty_subscriptions']);
const RFC_UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
function rejectUnknownTable(table) { if(!TABLES.has(table)) throw Error('Tabela não autorizada no cliente'); }
function objectOrError(response, value) {
  if(response.ok) return value;
  const reason = typeof value === 'object' && value !== null ? (value.msg || value.message || value.error_description || value.error || value.hint) : null;
  throw Error(String(reason || `Falha HTTP ${response.status}`).slice(0,240));
}
function validConfig(config){
  if(!config?.supabaseUrl || !config?.publishableKey) return false;
  let parsed;try {parsed = new URL(config.supabaseUrl)} catch {return false;}
  return parsed.protocol === 'https:' && parsed.hostname.endsWith('.supabase.co') &&
    /^sb_publishable_[A-Za-z0-9_-]+$/.test(config.publishableKey);
}
export class VelyoBackend {
  constructor(config, {fetchImpl=globalThis.fetch, storage=globalThis.sessionStorage, scope='geral'}={}){
    if(!validConfig(config)) throw Error('Configure apenas o projeto Supabase independente do Velyo.');
    this.base = new URL(config.supabaseUrl).origin;
    this.key = config.publishableKey;
    this.fetch = (...args) => fetchImpl(...args);
    this.storage = storage;
    if(!/^(geral|admin|balcao|cliente|plataforma)$/.test(scope)) throw Error('Escopo de login inválido');
    this.sessionKey = SESSION_PREFIX + scope;
    this.session = null;
    try {const value=JSON.parse(storage?.getItem(this.sessionKey)||'null');if(value?.access_token && value?.refresh_token)this.session=value;} catch {}
  }
  saveSession(data){
    this.session = data ? {access_token:data.access_token,refresh_token:data.refresh_token,expires_at:data.expires_at||0} : null;
    if(this.session) this.storage?.setItem(this.sessionKey,JSON.stringify(this.session));
    else this.storage?.removeItem(this.sessionKey);
  }
  async http(path,{method='GET',body,authenticated=true,headers={},retry=true}={}){
    const h={apikey:this.key,Accept:'application/json',...headers};
    if(authenticated){if(!this.session?.access_token)throw Error('Sessão encerrada. Entre novamente.');
      if(this.session.expires_at && Date.now() > this.session.expires_at * 1000 - 60000) await this.refresh();
      h.Authorization=`Bearer ${this.session.access_token}`;
    }
    if(body !== undefined)h['Content-Type']='application/json';
    let res;
    try {res=await this.fetch(`${this.base}${path}`,{method,headers:h,body:body===undefined?undefined:JSON.stringify(body)});}
    catch {throw Error('Sem conexão com o banco. Verifique a internet.');}
    if(res.status===401 && authenticated && retry){await this.refresh();return this.http(path,{method,body,authenticated,headers,retry:false});}
    const raw=await res.text();let parsed=null;
    if(raw){try{parsed=JSON.parse(raw);}catch{parsed=raw}}
    return objectOrError(res,parsed);
  }
  async signIn(email,password){
    if(!email?.includes('@')||!password)throw Error('Informe e-mail e senha.');
    const s=await this.http('/auth/v1/token?grant_type=password',{method:'POST',authenticated:false,body:{email:email.trim(),password}});
    this.saveSession(s);return s;
  }
  async signInPhone(phone,password){
    if(!/^\+[1-9]\d{7,14}$/.test(phone)||!password)throw Error('Informe celular com DDI e senha.');
    const s=await this.http('/auth/v1/token?grant_type=password',{method:'POST',authenticated:false,body:{phone,password}});
    this.saveSession(s);return s;
  }
  async requestPasswordReset(email,redirectUrl){
    const normalizedEmail=String(email||'').trim();
    if(!/^\S+@\S+\.\S+$/.test(normalizedEmail)) throw Error('Informe um e-mail válido.');
    let redirect;
    try {redirect=new URL(redirectUrl);if(!['https:','http:'].includes(redirect.protocol))throw Error();}
    catch {throw Error('Endereço de recuperação inválido.');}
    // URLs de redirecionamento precisam estar autorizadas no Supabase Auth.
    const p=new URLSearchParams({redirect_to:redirect.href});
    return this.http(`/auth/v1/recover?${p}`,{method:'POST',authenticated:false,body:{email:normalizedEmail}});
  }
  loadRecoveryTokens(hash){
    const raw=String(hash||'').replace(/^#/,'');
    const h=new URLSearchParams(raw);
    if(h.get('type')!=='recovery')return false;
    const access_token=h.get('access_token'),refresh_token=h.get('refresh_token');
    if(!access_token||!refresh_token)throw Error('Link de recuperação inválido ou expirado.');
    const exp=Number(h.get('expires_in'));
    this.saveSession({access_token,refresh_token,expires_at:Date.now()/1000+(Number.isFinite(exp)&&exp>0?exp:3600)});
    return true;
  }
  async updatePassword(password){
    if(typeof password!=='string'||password.length<12||password.length>128)throw Error('Use uma senha com 12 a 128 caracteres.');
    return this.http('/auth/v1/user',{method:'PUT',body:{password}});
  }
  async refresh(){
    if(!this.session?.refresh_token) {this.saveSession(null);throw Error('Sessão expirada. Entre novamente.');}
    const old=this.session.refresh_token;
    let r;
    try {r=await this.http('/auth/v1/token?grant_type=refresh_token',{method:'POST',authenticated:false,body:{refresh_token:old}})}
    catch(e){this.saveSession(null);throw e;}
    this.saveSession(r);return r;
  }
  async getUser(){return this.http('/auth/v1/user');}
  async signOut(){
    try{if(this.session?.access_token)await this.http('/auth/v1/logout',{method:'POST'});}catch{}
    this.saveSession(null);
  }
  async select(table,tenantId=null,{cols='*',filters={},order=null,limit=500}={}){
    rejectUnknownTable(table);
    const params=new URLSearchParams();params.set('select',cols);
    if(tenantId!==null)params.set(table==='loyalty_tenants'?'id':'tenant_id',`eq.${tenantId}`);
    for(const [key,value] of Object.entries(filters))params.set(key,`eq.${value}`);
    if(order)params.set('order',order);
    params.set('limit',String(limit));
    return this.http(`/rest/v1/${table}?${params}`);
  }
  async insert(table,data){
    rejectUnknownTable(table);
    if(!['loyalty_tenants','loyalty_customers'].includes(table))throw Error('Gravação direta proibida.');
    return this.http(`/rest/v1/${table}?select=*`,{method:'POST',body:data,headers:{Prefer:'return=representation'}});
  }
  async rpc(fn,args){
    if(!['loyalty_credit_purchase','loyalty_redeem_reward','loyalty_current_balance','loyalty_create_reward','loyalty_claim_customer','loyalty_claim_customer_by_slug'].includes(fn))throw Error('Operação RPC não autorizada');
    return this.http(`/rest/v1/rpc/${fn}`,{method:'POST',body:args});
  }
  async listTenants(){
    return this.select('loyalty_tenants',null,{cols:'id,name,slug,business_sector,is_active',order:'created_at.desc'});
  }
  async createTenant(name,slug,userId){
    return this.insert('loyalty_tenants',{name,slug,business_sector:'general',owner_user_id:userId});
  }
  async bundle(tenantId){
    if(!RFC_UUID.test(tenantId))throw Error('Identificador da empresa inválido');
    const cfg=[
      ['loyalty_memberships',{cols:'tenant_id,user_id,role,is_active'}],
      ['loyalty_programs',{cols:'tenant_id,points_per_brl,expiry_days,is_active'}],
      ['loyalty_customers',{cols:'id,tenant_id,name,phone_e164,birth_date,marketing_opt_in,created_at',order:'created_at.desc'}],
      ['loyalty_accounts',{cols:'tenant_id,customer_id,balance_points'}],
      ['loyalty_rewards',{cols:'id,tenant_id,title,points_required,stock,is_active'}],
      ['loyalty_reward_costs',{cols:'tenant_id,reward_id,unit_cost_cents'}],
      ['loyalty_point_transactions',{cols:'id,tenant_id,customer_id,kind,delta_points,amount_cents,reward_id,request_id,created_at',order:'created_at.desc',limit:1000}],
      ['loyalty_point_lots',{cols:'id,tenant_id,customer_id,remaining_points,expires_at'}],
      ['loyalty_redemptions',{cols:'id,tenant_id,transaction_id,unit_cost_cents'}],
    ];
    const values=await Promise.all(cfg.map(([table,opts])=>this.select(table,tenantId,opts)));
    const result=Object.fromEntries(cfg.map(([table],i)=>[table,values[i]]));
    const costByReward=new Map(result.loyalty_reward_costs.map(r=>[r.reward_id,r.unit_cost_cents]));
    result.loyalty_rewards=result.loyalty_rewards.map(r=>({...r,unit_cost_cents:costByReward.has(r.id)?costByReward.get(r.id):null}));
    return result;
  }
  async bundleForCounter(tenantId){
    if(!RFC_UUID.test(tenantId)) throw Error('Identificador da empresa inválido');
    const [loyalty_customers,loyalty_rewards]=await Promise.all([
      this.select('loyalty_customers',tenantId,{cols:'id,tenant_id,name,phone_e164',order:'name.asc',limit:500}),
      this.select('loyalty_rewards',tenantId,{cols:'id,tenant_id,title,points_required,stock,is_active',limit:500})
    ]);
    return {loyalty_customers,loyalty_rewards};
  }
  async createCustomer(tenantId,name,phone){return this.insert('loyalty_customers',{tenant_id:tenantId,name:name.trim(),phone_e164:phone.trim()});}
  async createReward(tenantId,title,points,stock,unitCostCents){
    return this.rpc('loyalty_create_reward',{p_tenant:tenantId,p_title:title.trim(),p_points:points,p_stock:stock,p_unit_cost_cents:unitCostCents});
  }
  async claimCustomerBySlug(slug){return this.rpc('loyalty_claim_customer_by_slug',{p_slug:slug});}
  async credit(tenantId,customerId,amountCents,requestId){
    return this.rpc('loyalty_credit_purchase',{p_tenant:tenantId,p_customer:customerId,p_amount_cents:amountCents,p_request_id:requestId});
  }
  async redeem(tenantId,customerId,rewardId,requestId){
    return this.rpc('loyalty_redeem_reward',{p_tenant:tenantId,p_customer:customerId,p_reward:rewardId,p_request_id:requestId});
  }
  async balance(tenantId,customerId){return this.rpc('loyalty_current_balance',{p_tenant:tenantId,p_customer:customerId});}
}
export function mapBundleForReports(bundle,tenantId){
  const costs=new Map(bundle.loyalty_redemptions.map(r=>[r.transaction_id,r.unit_cost_cents]));
  return {
    customers:bundle.loyalty_customers.map(c=>({id:c.id,tenant:c.tenant_id,name:c.name,phone:c.phone_e164,optIn:c.marketing_opt_in})),
    rewards:bundle.loyalty_rewards.map(r=>({id:r.id,tenant:r.tenant_id,title:r.title,points:r.points_required,unitCostCents:r.unit_cost_cents})),
    transactions:bundle.loyalty_point_transactions.map(t=>({id:t.id,tenant:t.tenant_id,customerId:t.customer_id,kind:t.kind,points:Number(t.delta_points),amountCents:t.amount_cents===null?null:Number(t.amount_cents),rewardId:t.reward_id,createdAt:t.created_at,rewardCostCents:costs.has(t.id)?costs.get(t.id):null})),
    lots:bundle.loyalty_point_lots.map(l=>({id:l.id,tenant:l.tenant_id,customerId:l.customer_id,remaining:Number(l.remaining_points),expiresAt:l.expires_at})),
  };
}
export function parseReais(text){
  const s=String(text||'').trim().replace(/\s/g,'').replace(/^R\$/,'');
  if(s.includes(',')){
    if(!(/^\d+,\d{1,2}$/.test(s)||/^\d{1,3}(\.\d{3})+,\d{1,2}$/.test(s)))throw Error('Informe um valor como 89,90.');
  }
  const x=s.includes(',')?s.replace(/\./g,'').replace(',','.'):s;
  if(!/^\d+(\.\d{1,2})?$/.test(x))throw Error('Informe um valor como 89,90.');
  const val=Math.round(Number(x)*100);
  if(!Number.isSafeInteger(val) || val<1 || val>10000000)throw Error('Valor fora do intervalo permitido.');
  return val;
}

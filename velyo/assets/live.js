import {VelyoBackend,mapBundleForReports,parseReais} from './backend.js';
import {managementMetrics,isVerifiedPurchase} from './management.js';
import {renderAuth} from './auth-view.js';

const $ = (q) => document.querySelector(q);
const e = (s) => String(s??'').replace(/[&<>"']/g,ch=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[ch]));
const curr = c => (Number(c||0)/100).toLocaleString('pt-BR',{style:'currency',currency:'BRL'});
const fmt = n => Number(n||0).toLocaleString('pt-BR');
const dateBR = s => s ? new Date(s).toLocaleDateString('pt-BR') : '—';
const pct = n => n == null ? '—' : `${n.toLocaleString('pt-BR',{maximumFractionDigits:1})}%`;
const uuid = () => crypto.randomUUID();
let api=null, user=null, tenants=[], tenantId='',bundle=null, view='dashboard', period=30, busy=false, error='', filter='', consentOnly=false, memberships=[], membership=null;
const PORTAL=document.body.dataset.portal==='balcao'?'balcao':'admin';
const allowedViews=PORTAL==='balcao'?new Set(['counter']):new Set(['dashboard','customers','purchases','redemptions','rewards','reports','salesAccess','whatsappBusiness','program','movements']);
view=PORTAL==='balcao'?'counter':'dashboard';
const pending=new Map();
let toastTimer = null;
let editingRewardId='',selectedCustomerId='',rewardPhotoPreviewURL='';
let authMode='login', authEmail='';
const NAV_GROUPS=PORTAL==='balcao'
 ?[{title:'ATENDIMENTO',items:[['counter','⇄','Operação do balcão']]}]
 :[
  {title:'PAINEL',items:[['dashboard','⌂','Visão geral']]},
  {title:'OPERAÇÃO',items:[['customers','♧','Clientes'],['purchases','↗','Compras e pontos'],['redemptions','⇄','Resgates'],['rewards','✦','Brindes e vouchers']]},
  {title:'ANÁLISE',items:[['reports','▥','Relatórios']]},
  {title:'SISTEMA',items:[['salesAccess','♙','Acesso Vendas'],['program','⚙','Configurações'],['whatsappBusiness','◉','WhatsApp Business']]}
 ];
function isConfigReady(){return !!window.VELYO_CONFIG?.supabaseUrl && !!window.VELYO_CONFIG?.publishableKey}
function toast(msg,kind='ok'){
  const node=$('#toast'); if(!node)return;
  node.innerText=msg;node.className=kind==='error'?'show error':'show';node.hidden=false;
  if(toastTimer)clearTimeout(toastTimer);
  toastTimer=setTimeout(()=>{node.className='';node.hidden=true},4500);
}
function title(t,sub,actions=''){return `<div class="live-heading"><div><p class="live-eyebrow">VELYO / HOMOLOGAÇÃO</p><h1>${t}</h1><p>${sub}</p></div><div class="live-row">${actions}</div></div>`}
function stat(label,value,hint,tone){return `<article class="live-stat ${tone}"><span>${label}</span><strong>${value}</strong><small>${hint}</small></article>`}
function panel(t,sub,content){return `<article class="live-panel"><div class="panel-heading"><div><b>${t}</b><p>${sub}</p></div></div>${content}</article>`}
function table(cols,rows){return `<div class="live-table-wrap"><table class="live-table"><thead><tr>${cols.map(c=>`<th>${c}</th>`).join('')}</tr></thead><tbody>${rows||`<tr><td colspan="${cols.length}" class="live-empty">Sem registros para este período.</td></tr>`}</tbody></table></div>`}
function makeStats(){let state=mapBundleForReports(bundle,tenantId);return managementMetrics(state,tenantId,period)}
function activeTenant(){return tenants.find(t=>t.id===tenantId)}
function memberRole(){return membership?.role||''}
function isManager(){return ['owner','admin'].includes(memberRole())}
function custName(id){return bundle.loyalty_customers.find(x=>x.id===id)?.name||'Cliente'}
function rewardOptions(){return bundle.loyalty_rewards.filter(r=>r.is_active && (r.stock===null||r.stock>0)).map(r=>`<option value="${e(r.id)}">${e(r.title)} · ${fmt(r.points_required)} pts</option>`).join('')}
function zeroOrLimited(){const n=bundle.loyalty_point_transactions.length;return n>=1000?`<div class="live-alert">Este painel exibe até 1.000 transações recentes. Os relatórios ficam parciais quando esse limite é atingido; paginação será necessária antes de usar com alto volume.</div>`:'';}
function onboarding(){
 const customers=bundle.loyalty_customers.length;
 const rewards=bundle.loyalty_rewards.filter(r=>r.is_active).length;
 const transactions=bundle.loyalty_point_transactions.length;
 if(customers>0&&rewards>0&&transactions>0)return '';
 return `<section class="live-start">
  <div class="live-start-head"><span class="live-start-tag">PRIMEIROS PASSOS</span><h2>Prepare seu programa de fidelidade</h2><p>As métricas começam a aparecer quando houver clientes e compras pontuadas. Nenhum dado será inventado.</p></div>
  <div class="live-start-steps">
   <button type="button" data-view="program" class="live-start-step"><b>1 · Programa de pontos</b><span>Defina quantos pontos valem R$ 1,00 e a validade.</span><small>Configurar →</small></button>
   <button type="button" data-view="rewards" class="live-start-step"><b>2 · Cadastrar brindes</b><span>${rewards} recompensa(s) ativa(s) no catálogo.</span><small>Gerenciar brindes →</small></button>
   <button type="button" data-view="customers" class="live-start-step"><b>3 · Cadastrar clientes</b><span>${customers} cliente(s) cadastrado(s) nesta empresa.</span><small>Abrir clientes →</small></button>
   <a href="../balcao/" class="live-start-step" target="_blank" rel="noopener noreferrer"><b>4 · Registrar compras</b><span>${transactions} movimentação(ões) registrada(s).</span><small>Abrir Balcão →</small></a>
  </div>
 </section>`;
}
function dashboard(){
  const m=makeStats();const total=bundle.loyalty_customers.length;
  const rows=m.risks.slice(0,5).map(r=>`<tr><td><b>${e(r.name)}</b></td><td>${r.daysSince} dias</td><td>${curr(r.registeredSpendCents)}</td><td><span class="live-tag ${r.optIn?'':'warn'}">${r.optIn?'Autorizou comunicação':'Sem autorização'}</span></td></tr>`).join('');
  const recent=bundle.loyalty_point_transactions.slice(0,7).map(t=>`<tr><td>${dateBR(t.created_at)}</td><td>${e(custName(t.customer_id))}</td><td>${t.kind==='credit'?'Compra pontuada':t.kind==='redemption'?'Resgate':'Vencimento'}</td><td>${Number(t.delta_points)>0?'+':''}${fmt(t.delta_points)} pts</td></tr>`).join('');
  return `${title('Visão executiva',`Dados da empresa ${e(activeTenant()?.name)} · últimos ${period} dias`,rangeControl())}
    <section class="live-banner"><div><b>Decisões com base em compras registradas.</b><p>Sem estimativas artificiais: compras importadas sem valor não são tratadas como receita; métricas com poucos dados podem estar vazias.</p></div><span class="live-tag">Ambiente de homologação</span></section>
    ${onboarding()}
    ${zeroOrLimited()}
    <div class="live-stats">${stat('Clientes registrados',fmt(total),'Base do estabelecimento','purple')}${stat('Volume de compras pontuadas',curr(m.periodVolumeCents),'Não representa faturamento total','teal')}${stat('Taxa de recompra',pct(m.repurchaseRate),`${m.repeatBuyers} de ${m.activeBuyers} compradores do período`,'orange')}${stat('Clientes em risco',fmt(m.riskCount),'≥2 compras · ≥30 dias sem compra','rose')}</div>
    <div class="live-grid">${panel('Recorrência','Recompras dentre os compradores com registros no período',`<div class="content"><div class="live-line"><span>Compraram uma vez</span><b>${fmt(m.activeBuyers-m.repeatBuyers)}</b></div><div class="live-bar"><i style="width:${m.activeBuyers?100*(m.activeBuyers-m.repeatBuyers)/m.activeBuyers:0}%"></i></div><div class="live-line"><span>Compraram duas ou mais vezes</span><b>${fmt(m.repeatBuyers)}</b></div><div class="live-bar"><i style="width:${m.repurchaseRate||0}%;background:linear-gradient(90deg,#14b8a6,#63cfbe)"></i></div><p class="live-note">Esta é a recompra observada entre compradores do período, não a taxa de retenção de toda a base.</p></div>`)}
    ${panel('Custo conhecido do programa','Recompensas efetivamente resgatadas',`<div class="content"><div class="live-line"><span>Resgates registrados</span><b>${fmt(m.redemptions)}</b></div><div class="live-line"><span>Custo informado</span><b>${curr(m.knownCostCents)}</b></div><div class="live-line"><span>Resgates sem custo</span><b>${fmt(m.unpricedRedemptions)}</b></div><p class="live-note">${m.unpricedRedemptions?'Custo parcial — há resgates sem preço de custo.':'Custos históricos dos resgates registrados; não representam lucro ou ROI.'}</p></div>`)}</div>
    ${panel('Clientes que merecem atenção','Critério: duas ou mais compras e pelo menos 30 dias sem voltar',table(['Cliente','Última compra','Valor histórico','Contato'],rows))}
    ${panel('Movimentações recentes','Dados reais apenas do ambiente escolhido',table(['Data','Cliente','Operação','Pontos'],recent))}`;
}
function rangeControl(){return `<label class="live-field">Período <select id="period" class="live-select">${[7,30,90].map(x=>`<option value="${x}" ${period===x?'selected':''}>${x} dias</option>`).join('')}</select></label>`}
function reports(){
 const m=makeStats();const pstate=mapBundleForReports(bundle,tenantId);
 const risks=m.risks.filter(r=>!consentOnly||r.optIn);
 const rows=risks.map(r=>`<tr><td><b>${e(r.name)}</b></td><td>${dateBR(r.lastPurchase)}</td><td>${fmt(r.purchases)}</td><td>${curr(r.registeredSpendCents)}</td><td>${r.optIn?'Sim':'Não'}</td></tr>`).join('');
 const costRows=m.rewardRows.map(r=>`<tr><td>${e(r.name)}</td><td>${fmt(r.quantity)}</td><td>${curr(r.knownCostCents)}</td><td>${fmt(r.unpriced)}</td></tr>`).join('');
 return `${title('Relatórios gerenciais','Três relatórios úteis, sem métricas fictícias.',rangeControl())}${onboarding()}${zeroOrLimited()}
   <div class="live-stats">${stat('Compras registradas',fmt(m.purchaseCount),'Compras com valor e pontos','purple')}${stat('Compradores',fmt(m.activeBuyers),'Com ao menos uma compra','teal')}${stat('Taxa de recompra',pct(m.repurchaseRate),'Duas ou mais compras no período','orange')}${stat('Custo de recompensas',curr(m.knownCostCents),m.unpricedRedemptions?'Total parcial':'Custos informados','rose')}</div>
   ${panel('Recompra no período','Definição: compradores com ≥2 compras ÷ compradores com ≥1 compra',`<div class="content"><div class="live-line"><span>Compradores com recompra</span><b>${fmt(m.repeatBuyers)}</b></div><div class="live-bar"><i style="width:${m.repurchaseRate||0}%"></i></div><p class="live-note">${fmt(m.noPurchaseHistory)} clientes ainda não têm histórico de compra com valor, logo não são classificados.</p></div>`)}
   ${panel('Clientes para revisão','Mínimo de duas compras registradas; 30 dias sem nova compra',`<div class="content"><label class="live-row" style="font-size:12px;color:#62718c"><input id="consent" type="checkbox" ${consentOnly?'checked':''}> Mostrar somente quem autorizou mensagens</label><p class="live-note">A classificação indica oportunidade de contato, não prevê abandono. Só envie mensagens respeitando autorização e finalidade.</p></div>${table(['Cliente','Última compra','Compras','Valor registrado','Consentiu'],rows)}`)}
   ${panel('Custo dos benefícios','Custos informados no momento do resgate, sem estimativa de lucro',table(['Recompensa','Resgates','Custo conhecido','Sem custo'],costRows))}`;
}
function customers(){
 const list=bundle.loyalty_customers.filter(c=>`${c.name} ${c.phone_e164}`.toLowerCase().includes(filter.toLowerCase()));
 const rows=list.map(c=>{
  const ac=bundle.loyalty_accounts.find(a=>a.customer_id===c.id),tx=bundle.loyalty_point_transactions.filter(t=>t.customer_id===c.id&&t.kind==='credit');
  return `<tr><td><b>${e(c.name)}</b></td><td>${e(c.phone_e164)}</td><td>${fmt(ac?.balance_points)} pts*</td><td>${fmt(tx.length)}</td><td><button type="button" class="live-btn secondary live-small-btn" data-show-customer="${e(c.id)}">Ver extrato</button></td></tr>`;
 }).join('');
 const selected=bundle.loyalty_customers.find(c=>c.id===selectedCustomerId);
 let details='';
 if(selected){
  const rows=bundle.loyalty_point_transactions.filter(t=>t.customer_id===selected.id).slice(0,50).map(t=>`<tr><td>${dateBR(t.created_at)}</td><td>${e(t.kind==='credit'?'Compra pontuada':t.kind==='redemption'?'Resgate':t.kind==='expiry'?'Vencimento':t.kind)}</td><td>${t.amount_cents==null?'—':curr(t.amount_cents)}</td><td>${Number(t.delta_points)>0?'+':''}${fmt(t.delta_points)}</td></tr>`).join('');
  details=panel(`Extrato de ${e(selected.name)}`,`Telefone: ${e(selected.phone_e164)} · até 50 movimentações recentes`,`<div class="content"><div class="live-row"><button type="button" class="live-btn" data-balance-customer="${e(selected.id)}">Consultar saldo atualizado</button><button type="button" class="live-btn ghost" id="closeCustomer">Fechar extrato</button></div><p id="customerBalanceResult" class="live-note" role="status">Clique em consultar para descontar eventuais pontos vencidos e verificar o saldo atual.</p></div>${table(['Data','Operação','Valor da compra','Pontos'],rows)}`);
 }
 return `${title('Clientes e pontos',`${fmt(bundle.loyalty_customers.length)} cliente(s) cadastrado(s) nesta empresa`)}
 <div class="live-grid">
 ${panel('Pesquisar clientes','Localize pelo nome ou telefone',`<div class="content"><label class="live-field">Buscar <input id="search" value="${e(filter)}" placeholder="Nome ou telefone"></label><p class="live-note">Clique em “Ver extrato” para acompanhar o saldo e as movimentações.</p></div>`)}
 ${panel('Cadastrar cliente','O cadastro pertence exclusivamente a esta empresa',`<form id="createCustomer" class="live-form"><label class="live-field">Nome completo <input name="name" required minlength="2" maxlength="120"></label><label class="live-field">Telefone com DDD <input type="tel" name="phone" required inputmode="tel" maxlength="24" placeholder="(89) 99999-9999"></label><button type="submit" class="live-btn">Cadastrar cliente</button></form>`)}
 </div>
 ${details}
 ${panel('Base de clientes',list.length?'Selecione “Ver extrato” para consultar os pontos.':'Ainda não há clientes cadastrados ou sua busca não retornou resultados.',table(['Nome','Telefone','Saldo registrado*','Compras','Ações'],rows))}
 <p class="live-note">*Saldo registrado pode incluir pontos vencidos ainda não processados. Consulte o saldo atualizado no extrato. Histórico limitado aos 1.000 registros recentes carregados.</p>`;
}
function program(){
 const p=bundle.loyalty_programs[0];
 if(!p)return `${title('Programa de pontos','Configurações desta empresa')}${panel('Sem programa','O programa ainda não foi inicializado para esta empresa.','<p class="live-note" style="padding:20px">Verifique a criação da empresa no painel do proprietário.</p>')}`;
 const rate=Number(p.points_per_brl),expiry=Number(p.expiry_days);
 return `${title('Configurações','Defina as regras de acumulação e validade do programa de fidelidade.')}
 <div class="live-stats">
 ${stat('Pontos por R$ 1,00',fmt(rate),'Válido para novas compras','purple')}
 ${stat('Validade',`${fmt(expiry)} dias`,'Contados a partir do crédito','teal')}
 ${stat('Situação',p.is_active?'Ativo':'Pausado','Pontuação de novas compras','orange')}
 ${stat('Brindes ativos',fmt(bundle.loyalty_rewards.filter(r=>r.is_active).length),'Catálogo disponível','rose')}
 </div>
 ${panel('Regras do programa','Apenas proprietário e administradores autorizados podem modificar',isManager()?`
 <form id="saveProgram" class="live-form live-config-form">
 <label class="live-field">Pontos por R$ 1,00 gasto <input type="number" name="rate" min="0.01" max="1000" step="0.01" required value="${e(rate)}"></label>
 <label class="live-field">Validade dos novos pontos (dias) <input type="number" name="expiry" min="1" max="3650" step="1" required value="${e(expiry)}"></label>
 <label class="live-field">Situação <select name="enabled"><option value="true" ${p.is_active?'selected':''}>Ativo</option><option value="false" ${!p.is_active?'selected':''}>Pausado</option></select></label>
 <div class="live-form-actions"><button type="submit" class="live-btn">Salvar configurações</button></div>
 <p class="live-note">As novas regras de pontuação e validade se aplicam às compras futuras. Os pontos já emitidos mantêm suas condições anteriores.</p>
 </form>`:'<div class="content"><p>Somente gestores podem alterar as regras do programa.</p></div>')}
 ${panel('Funcionamento do programa','Valores usados no Balcão',`<div class="content"><p>Ao registrar uma compra de R$ 100,00, com a regra atual de ${fmt(rate)} ponto(s) por real, a pontuação prevista é ${fmt(Math.floor(100*rate))} pontos.</p><p>O saldo é validado no banco no momento do resgate, incluindo pontos vencidos. O programa pode ser pausado pelo gestor.</p></div>`)}`;
}
function movements(){
 const since=Date.now()-period*86400000;
 const rows=bundle.loyalty_point_transactions.filter(t=>new Date(t.created_at).getTime()>=since);
 const kinds={credit:'Compra pontuada',redemption:'Resgate',expiry:'Vencimento',expire:'Vencimento',adjustment:'Ajuste'};
 const html=rows.slice(0,150).map(t=>`<tr><td>${dateBR(t.created_at)}</td><td>${e(custName(t.customer_id))}</td><td>${e(kinds[t.kind]||t.kind)}</td><td>${t.amount_cents!=null?curr(t.amount_cents):'—'}</td><td><b>${Number(t.delta_points)>0?'+':''}${fmt(t.delta_points)}</b></td></tr>`).join('');
 return `${title('Movimentações de pontos','Histórico de créditos, resgates e vencimentos da empresa.',rangeControl())}
 ${zeroOrLimited()}
 <div class="live-stats">
 ${stat('Movimentações',fmt(rows.length),'Exibidas no período','purple')}
 ${stat('Créditos',fmt(rows.filter(x=>Number(x.delta_points)>0).reduce((v,t)=>v+Number(t.delta_points),0)),'Pontos lançados','teal')}
 ${stat('Débitos',fmt(rows.filter(x=>Number(x.delta_points)<0).reduce((v,t)=>v-Math.abs(Number(t.delta_points)),0)),'Pontos resgatados/vencidos','orange')}
 ${stat('Clientes com movimentação',fmt(new Set(rows.map(t=>t.customer_id)).size),'No período','rose')}
 </div>
 ${panel('Extrato das operações',rows.length?'Exibindo até 150 operações recentes filtradas':'Ainda não há operações neste período.',table(['Data','Cliente','Operação','Valor da compra','Pontos'],html))}
 <p class="live-note">Histórico disponível: até 1.000 registros recentes carregados por empresa. Valores de compra aparecem apenas nos créditos registrados com valor.</p>`;
}
function counter(){
 const rewards=rewardOptions();
 const available=bundle.loyalty_rewards.filter(r=>r.is_active&&(r.stock===null||r.stock>0));
 const gallery=available.length?`<div class="reward-pick-grid" role="group" aria-label="Brindes disponíveis">${available.slice(0,60).map(r=>`<button type="button" class="reward-pick-card" data-pick-reward="${e(r.id)}" aria-pressed="false">${rewardImage(r,'md')}<span><b>${e(r.title)}</b><small>${fmt(r.points_required)} pontos</small></span></button>`).join('')}</div>`:'<p class="live-note">Nenhum brinde disponível. Cadastre brindes na Administração.</p>';
 const phoneField=id=>`<label class="live-field">Telefone do cliente (com DDD) <input type="tel" inputmode="tel" autocomplete="off" name="phone" id="${id}" required maxlength="24" placeholder="Ex.: (89) 99999-9999"></label>`;
 return `${title('Atendimento no balcão','Localize o cliente pelo número do telefone para pontuar e resgatar brindes.')}
 <div class="live-banner"><div><b>Atendimento rápido por telefone.</b><p>Não é preciso selecionar o cliente em uma lista. Informe o número com DDD e confirme o nome antes de concluir. As operações continuam protegidas contra duplicação.</p></div></div>
 <div class="live-forms">
 ${panel('Pontuar compra','Informe o telefone e o valor da compra.',`<form id="creditForm" class="live-form">${phoneField('creditPhone')}<label class="live-field">Valor da compra (R$) <input name="amount" required placeholder="Ex.: 75,90" inputmode="decimal"></label><button class="live-btn" type="submit">Pontuar compra</button><p class="live-note">O nome do cliente aparece para confirmação. Pontos e validade são definidos no banco; setor farmacêutico sujeito à validação de elegibilidade.</p></form>`)}
 ${panel('Resgatar brinde','Escolha o brinde pela foto e informe o telefone.',`<form id="redeemForm" class="live-form">${phoneField('redeemPhone')}<label class="live-field">Brinde <select required name="reward" id="rewardSelector"><option value="">Selecione o brinde</option>${rewards}</select></label>${gallery}<button class="live-btn secondary" type="button" id="checkBalance">Consultar saldo pelo telefone</button><div id="balanceResult" class="live-note" role="status"></div><button class="live-btn teal" type="submit">Confirmar resgate</button></form>`)}
 </div>
 ${panel('Cadastro rápido de cliente','Se o telefone ainda não estiver cadastrado, registre o cliente antes da operação.',`<form id="createCustomer" class="live-form" style="grid-template-columns:repeat(auto-fit,minmax(190px,1fr));align-items:end"><label class="live-field">Nome <input name="name" required minlength="2" maxlength="120"></label><label class="live-field">Telefone com DDD <input type="tel" inputmode="tel" name="phone" required maxlength="24" placeholder="Ex.: (89) 99999-9999"></label><button class="live-btn" type="submit">Cadastrar cliente</button></form>`)}
 `;
}

function rewardImage(r,size='sm'){
 const url=api?.rewardImageUrl(r.image_path);
 return url?`<span class="reward-thumb ${size}"><img src="${e(url)}" alt="Foto de ${e(r.title)}" loading="lazy"></span>`:
 `<span class="reward-thumb ${size} reward-thumb-empty" role="img" aria-label="Sem foto">🎁</span>`;
}

function releaseRewardPhotoPreview(){
 if(rewardPhotoPreviewURL){URL.revokeObjectURL(rewardPhotoPreviewURL);rewardPhotoPreviewURL='';}
}

function fileFromRewardForm(form){
 const file=form.querySelector('input[type="file"][name="photo"]')?.files?.[0]||null;
 if(file)api.validateRewardImage(file);
 return file;
}

function rewards(){
 const active=bundle.loyalty_rewards.filter(r=>r.is_active).length;
 const depleted=bundle.loyalty_rewards.filter(r=>r.is_active&&r.stock===0).length;
 const chosen=bundle.loyalty_rewards.find(r=>r.id===editingRewardId);
 const rows=bundle.loyalty_rewards.map(r=>`<tr><td>${rewardImage(r,'sm')}</td><td><b>${e(r.title)}</b></td><td>${fmt(r.points_required)}</td><td>${r.stock===null?'Ilimitado':fmt(r.stock)}</td><td>${r.unit_cost_cents===null?'Não informado':curr(r.unit_cost_cents)}</td><td><span class="live-tag ${r.is_active?'':'gray'}">${r.is_active?'Ativo':'Inativo'}</span></td><td>${isManager()?`<button type="button" data-edit-reward="${e(r.id)}" class="live-btn secondary live-small-btn">Editar</button>`:'—'}</td></tr>`).join('');
 const photoField=`<label class="live-field reward-photo-field">Foto do brinde (opcional)
 <input type="file" name="photo" data-reward-photo accept="image/jpeg,image/png,image/webp">
 <small>JPG, PNG ou WEBP · máximo 2 MB</small>
 </label>`;
 const create=isManager()?panel('Cadastrar brinde','Escolha nome, pontuação, estoque e, se desejar, uma foto.',`<form id="createReward" class="live-form live-config-form">
 <label class="live-field">Nome do brinde <input name="title" required minlength="2" maxlength="120" placeholder="Caneca personalizada"></label>
 <label class="live-field">Pontos necessários <input type="number" name="points" required min="1" step="1" placeholder="50"></label>
 <label class="live-field">Estoque (vazio = ilimitado) <input type="number" name="stock" min="0" step="1" placeholder="10"></label>
 <label class="live-field">Custo unitário (R$), opcional <input name="cost" inputmode="decimal" placeholder="4,50"></label>
 <div class="reward-upload"><div class="reward-photo-preview">${rewardImage({title:'Novo brinde'},'lg')}</div>${photoField}</div>
 <div class="live-form-actions"><button type="submit" class="live-btn">Cadastrar brinde</button></div></form>`):'';
 const edit=chosen&&isManager()?panel(`Editar: ${e(chosen.title)}`,'Altere o brinde, substitua a foto ou remova a imagem atual.',`<form id="saveReward" class="live-form live-config-form">
 <input type="hidden" name="rewardId" value="${e(chosen.id)}">
 <label class="live-field">Nome do brinde <input name="title" minlength="2" maxlength="120" required value="${e(chosen.title)}"></label>
 <label class="live-field">Pontos necessários <input type="number" name="points" min="1" step="1" required value="${e(chosen.points_required)}"></label>
 <label class="live-field">Estoque disponível (vazio = ilimitado) <input type="number" name="stock" min="0" step="1" value="${chosen.stock===null?'':e(chosen.stock)}"></label>
 <label class="live-field">Status <select name="enabled"><option value="true" ${chosen.is_active?'selected':''}>Ativo</option><option value="false" ${!chosen.is_active?'selected':''}>Inativo</option></select></label>
 <div class="reward-upload"><div class="reward-photo-preview">${rewardImage(chosen,'lg')}</div><div>${photoField}${chosen.image_path?`<label class="reward-remove-photo"><input type="checkbox" name="removePhoto"> Remover foto atual</label>`:''}</div></div>
 <div class="live-form-actions"><button type="submit" class="live-btn">Salvar alterações</button><button type="button" class="live-btn ghost" id="cancelEditReward">Cancelar</button></div></form>`):'';
 return `${title('Brindes e vouchers','Cadastre brindes com imagem e gerencie as recompensas que seus clientes poderão resgatar.')}
 <div class="live-stats">${stat('Cadastrados',fmt(bundle.loyalty_rewards.length),'Total do catálogo','purple')}${stat('Ativos',fmt(active),'Disponíveis','teal')}${stat('Sem estoque',fmt(depleted),'Reposição necessária','orange')}${stat('Inativos',fmt(bundle.loyalty_rewards.length-active),'Não resgatáveis','rose')}</div>
 ${create}${edit}
 <p class="live-note">As fotos são opcionais. Vouchers de desconto com regras específicas ainda não foram implementados.</p>
 ${panel('Catálogo de brindes',bundle.loyalty_rewards.length?'Use “Editar” para alterar foto, estoque, pontos ou desativar um brinde.':'Nenhum brinde cadastrado. Use o formulário acima para criar o primeiro.',table(['Foto','Brinde','Pontos','Estoque','Custo unitário','Status','Ações'],rows))}`;
}

function purchases(){
 const since=Date.now()-period*86400000;
 const transactions=bundle.loyalty_point_transactions.filter(t=>t.kind==='credit'&&new Date(t.created_at).getTime()>=since);
 const totalCents=transactions.reduce((s,t)=>s+Number(t.amount_cents||0),0);
 const points=transactions.reduce((s,t)=>s+Number(t.delta_points||0),0);
 const html=transactions.slice(0,150).map(t=>`<tr><td>${dateBR(t.created_at)}</td><td>${e(custName(t.customer_id))}</td><td>${t.amount_cents!=null?curr(t.amount_cents):'—'}</td><td><b>+${fmt(t.delta_points)} pts</b></td></tr>`).join('');
 return `${title('Compras e pontos','Consulte as compras que geraram pontos nesta empresa.',rangeControl())}
 ${zeroOrLimited()}
 <div class="live-stats">${stat('Compras pontuadas',fmt(transactions.length),'Movimentações do período','purple')}${stat('Valor registrado',curr(totalCents),'Não equivale ao faturamento total','teal')}${stat('Pontos creditados',fmt(points),'Pontos concedidos no período','orange')}${stat('Clientes atendidos',fmt(new Set(transactions.map(t=>t.customer_id)).size),'Clientes distintos','rose')}</div>
 ${panel('Histórico de compras','Compras lançadas pela equipe de balcão; até 150 registros exibidos',table(['Data','Cliente','Valor da compra','Pontos creditados'],html))}
 <div class="live-action-row"><a class="live-btn" target="_blank" rel="noopener noreferrer" href="../balcao/">Abrir Balcão para pontuar uma compra</a><button class="live-btn secondary" type="button" data-view="movements">Ver todas as movimentações</button></div>
 <p class="live-note">A pontuação é registrada pelo Balcão com o telefone do cliente. Pontos já emitidos não são alterados ao modificar a regra do programa.</p>`;
}

function redemptions(){
 const since=Date.now()-period*86400000;
 const tx=bundle.loyalty_point_transactions.filter(t=>t.kind==='redemption'&&new Date(t.created_at).getTime()>=since);
 const costs=new Map(bundle.loyalty_redemptions.map(r=>[r.transaction_id,r.unit_cost_cents]));
 const names=new Map(bundle.loyalty_rewards.map(r=>[r.id,r.title]));
 const priced=tx.filter(t=>costs.has(t.id)&&costs.get(t.id)!=null);
 const cost=priced.reduce((sum,t)=>sum+Number(costs.get(t.id)||0),0);
 const points=tx.reduce((sum,t)=>sum+Math.abs(Number(t.delta_points||0)),0);
 const html=tx.slice(0,150).map(t=>`<tr><td>${dateBR(t.created_at)}</td><td>${e(custName(t.customer_id))}</td><td>${e(names.get(t.reward_id)||'Brinde indisponível no catálogo')}</td><td>${fmt(Math.abs(Number(t.delta_points||0)))}</td><td>${costs.has(t.id)&&costs.get(t.id)!=null?curr(costs.get(t.id)):'Não informado'}</td></tr>`).join('');
 return `${title('Resgates','Acompanhe os brindes efetivamente resgatados pelos clientes.',rangeControl())}
 ${zeroOrLimited()}
 <div class="live-stats">${stat('Resgates realizados',fmt(tx.length),'No período selecionado','purple')}${stat('Pontos utilizados',fmt(points),'Débitos de resgate','teal')}${stat('Custo conhecido',curr(cost),priced.length===tx.length?'Custo histórico informado':'Custo parcial','orange')}${stat('Sem custo informado',fmt(tx.length-priced.length),'Não estimados','rose')}</div>
 ${panel('Histórico de resgates','Movimentações confirmadas pelo banco; até 150 registros exibidos',table(['Data','Cliente','Brinde','Pontos utilizados','Custo informado'],html))}
 <div class="live-action-row"><a class="live-btn" target="_blank" rel="noopener noreferrer" href="../balcao/">Abrir Balcão para resgatar um brinde</a><button class="live-btn secondary" data-view="rewards" type="button">Gerenciar brindes</button></div>
 <p class="live-note">O sistema não utiliza códigos para resgate: o atendente identifica o cliente pelo telefone e confirma a operação. Os indicadores só exibem resgates efetivamente registrados.</p>`;
}

function salesAccess(){
 const roster=bundle.loyalty_memberships.filter(m=>m.is_active);
 const staff=roster.filter(m=>m.role==='staff').length;
 const managers=roster.filter(m=>m.role==='admin'||m.role==='owner').length;
 const rows=roster.map(m=>`<tr><td>${m.user_id===user.id?'Conta atual':`Usuário ${e(m.user_id.slice(0,8))}…`}</td><td>${m.role==='owner'?'Proprietário':m.role==='admin'?'Administrador':m.role==='staff'?'Atendente':e(m.role)}</td><td><span class="live-tag">Ativo</span></td></tr>`).join('');
 return `${title('Acesso Vendas','Área de acesso da equipe que opera o Balcão Velyo.')}
 <div class="live-stats">${stat('Acessos ativos',fmt(roster.length),'Vinculados a esta empresa','purple')}${stat('Gestores',fmt(managers),'Proprietários e administradores','teal')}${stat('Atendentes',fmt(staff),'Contas de balcão ativas','orange')}${stat('Empresa',e(activeTenant()?.name||'—'),'Ambiente selecionado','rose')}</div>
 ${panel('Equipe autorizada','Os vínculos registrados no Supabase estão isolados por empresa',table(['Usuário','Permissão','Situação'],rows))}
 ${panel('Operação de atendimento','Acesse o portal exclusivo para pontuação e resgates',`<div class="content"><p>Os atendentes usam o portal Balcão com suas próprias contas. Um administrador não deve compartilhar sua senha com funcionários.</p><a class="live-btn" target="_blank" rel="noopener noreferrer" href="../balcao/">Abrir Balcão Velyo</a><p class="live-note">O cadastro e o convite de novos funcionários ainda não estão disponíveis nesta tela. A inclusão exige uma conta autenticada e a concessão segura de acesso à empresa.</p></div>`)}`;
}

function whatsappBusiness(){
 return `${title('WhatsApp Business','Canal de comunicação com os clientes — configuração futura.')}
 ${panel('Integração não ativada','Nenhuma mensagem é enviada automaticamente pelo Velyo',`<div class="content"><div class="live-status-line"><span class="live-status-dot"></span><b>Não configurado</b></div><p>Esta seção acompanha a organização do painel Vale+, mas não está conectada ao WhatsApp Business. Não há QR Code, sessão vinculada ou disparos automáticos configurados.</p><p>Antes de ativar mensagens de cadastro, aniversário e pontos, será necessário definir um canal seguro de envio, consentimento dos clientes e regras de privacidade.</p></div>`)}
 ${panel('Próximas integrações','Funcionalidades previstas, ainda indisponíveis',`<div class="content"><p>Confirmação de compras pontuadas, aviso de vencimento de pontos e mensagens de aniversário — sempre considerando a autorização do cliente para comunicação.</p></div>`)}`;
}

function layout(){
 const nav=NAV_GROUPS.map(section=>`<section class="live-nav-group" aria-label="${e(section.title)}"><p class="live-nav-title">${e(section.title)}</p>${section.items.map(([id,ico,label])=>`<button type="button" data-view="${id}" aria-current="${view===id?'page':'false'}" class="${view===id?'active':''}"><span class="symbol" aria-hidden="true">${ico}</span><span class="nav-text">${e(label)}</span></button>`).join('')}</section>`).join('');
 const page = ({dashboard, reports, customers, counter, rewards, program, movements, purchases, redemptions, salesAccess, whatsappBusiness})[allowedViews.has(view)?view:(PORTAL==='balcao'?'counter':'dashboard')];
 $('#app').innerHTML=`<div class="live-shell"><div class="live-scrim" id="scrim"></div><aside class="live-sidebar" id="sidebar"><div class="live-logo">velyo<span>.</span><small>${PORTAL==='balcao'?'ATENDIMENTO':'ADMINISTRAÇÃO'}</small></div><nav class="live-nav" aria-label="Menu principal">${nav}</nav><div class="live-bottom"><strong>Velyo · Gestão</strong>${PORTAL==='balcao'?'Área operacional. Relatórios e dados gerenciais não aparecem aqui.':'Painel exclusivo de gestores. Dados separados por estabelecimento.'}</div></aside><div class="live-main"><header class="live-topbar"><div class="live-row"><button class="live-mobile-menu" type="button" id="mobileMenu" aria-label="Abrir menu">☰</button><strong><span class="workspace-label">Workspace / </span>${e(activeTenant()?.name||'Empresa')}</strong></div><div class="right"><select id="tenantSelector" class="live-select" aria-label="Selecionar empresa">${tenants.map(t=>`<option value="${e(t.id)}" ${t.id===tenantId?'selected':''}>${e(t.name)}</option>`).join('')}</select><span class="email">${e(user?.email)}</span><button class="live-btn ghost" id="logout" type="button">Sair</button></div></header><div class="live-body">${page()}</div></div></div>`;
}
function login(){
 $('#app').innerHTML=renderAuth({configured:isConfigReady(),mode:authMode,email:authEmail,area:PORTAL});
}
function showAuthFeedback(message,type='success'){
 const area=$('#authFeedback');if(!area)return;
 area.textContent=message;area.hidden=false;area.className=type==='error'?'auth-feedback error':'auth-feedback';
}
function setAuthMode(mode){
 authEmail=$('#authEmail')?.value||authEmail;
 authMode=mode;login();
 if(mode==='recover')$('#authEmail')?.focus();
 if(mode==='login')$('#authEmail')?.focus();
 if(mode==='new-password')$('#newPassword')?.focus();
}
async function runAuth(form,work){
 if(busy)return;
 busy=true;
 const button=form.querySelector('button[type="submit"]');
 if(button)button.disabled=true;
 try{await work();}catch(err){showAuthFeedback(err.message||'Não foi possível concluir a operação.','error');}
 finally{busy=false;if(button?.isConnected)button.disabled=false;}
}
function accessDenied(){
 const target=PORTAL==='admin'?'administração':'balcão';
 $('#app').innerHTML=`<main class="access-denied"><div class="access-denied-card"><div class="denied-icon">!</div><h1>Acesso não autorizado</h1><p>Esta conta não tem permissão ativa para a área de ${target}. Peça ao responsável para habilitar sua conta.</p><p>Você não está visualizando dados de nenhuma empresa.</p><button class="live-btn ghost" id="logout" type="button">Sair da conta</button></div></main>`;
}
function show(){
 if(!isConfigReady())return login();
 if(authMode==='new-password')return login();
 if(!user)return login();
 if(!tenants.length||!membership)return accessDenied();
 if(!bundle)return $('#app').innerHTML='<div class="connecting">Carregando dados protegidos do estabelecimento…</div>';
 layout();
}
async function load(){
 user=await api.getUser();
 // As empresas são enumeradas por RLS; a seleção é filtrada também pela função do perfil.
 const allTenants=await api.listTenants();
 memberships=(await api.select('loyalty_memberships',null,{
  cols:'tenant_id,user_id,role,is_active',filters:{user_id:user.id},limit:500
 })).filter(m=>m.is_active&&m.user_id===user.id);
 const validIds=new Set(memberships.filter(m=>PORTAL==='balcao'||['owner','admin'].includes(m.role)).map(m=>m.tenant_id));
 tenants=allTenants.filter(t=>validIds.has(t.id)&&t.is_active);
 if(!tenants.some(t=>t.id===tenantId))tenantId=tenants[0]?.id||'';
 membership=memberships.find(m=>m.tenant_id===tenantId)||null;
 if(tenants.length){bundle=PORTAL==='balcao'?await api.bundleForCounter(tenantId):await api.bundle(tenantId)}
 else bundle=null;
 show();
}
async function run(task){if(busy)return;busy=true;try{await task();}catch(err){toast(err.message||'Falha na operação.','error')}finally{busy=false;}}
function requestFor(kind,fields){const stamp=JSON.stringify(fields);let item=pending.get(kind);if(!item||item.stamp!==stamp){item={id:uuid(),stamp};pending.set(kind,item)}return item.id;}
async function reload(){bundle=PORTAL==='balcao'?await api.bundleForCounter(tenantId):await api.bundle(tenantId);show();}
async function onAdminClick(ev){
 const edit=ev.target.closest('[data-edit-reward]');
 if(edit&&PORTAL==='admin'){
  releaseRewardPhotoPreview();editingRewardId=edit.dataset.editReward;view='rewards';show();
  $('#saveReward')?.scrollIntoView({behavior:'smooth',block:'center'});
  return true;
 }
 if(ev.target.closest('#cancelEditReward')){releaseRewardPhotoPreview();editingRewardId='';show();return true;}
 const customer=ev.target.closest('[data-show-customer]');
 if(customer&&PORTAL==='admin'){
  selectedCustomerId=customer.dataset.showCustomer;view='customers';show();
  $('#customerBalanceResult')?.scrollIntoView({behavior:'smooth',block:'center'});
  return true;
 }
 if(ev.target.closest('#closeCustomer')){selectedCustomerId='';show();return true;}
 const bal=ev.target.closest('[data-balance-customer]');
 if(bal&&PORTAL==='admin'){
  const found=bundle.loyalty_customers.find(c=>c.id===bal.dataset.balanceCustomer);
  if(!found){toast('Cliente não encontrado nesta empresa.','error');return true;}
  await run(async()=>{
   const pts=await api.balance(tenantId,found.id);
   const node=$('#customerBalanceResult');
   if(node)node.textContent=`Saldo atualizado de ${found.name}: ${fmt(pts)} pontos válidos.`;
  });
  return true;
 }
 return false;
}
document.addEventListener('click',async ev=>{
 if(await onAdminClick(ev))return;
 const picked=ev.target.closest('[data-pick-reward]');
 if(picked&&PORTAL==='balcao'){
  const selector=$('#rewardSelector');
  if(selector){selector.value=picked.dataset.pickReward;selector.dispatchEvent(new Event('change',{bubbles:true}));}
  return;
 }
 const viewButton=ev.target.closest('[data-view]');if(viewButton){if(!allowedViews.has(viewButton.dataset.view))return;view=viewButton.dataset.view;filter='';show();$('#sidebar')?.classList.remove('open');$('#scrim')?.classList.remove('open');return;}
 if(ev.target.closest('#mobileMenu')){$('#sidebar')?.classList.add('open');$('#scrim')?.classList.add('open');return;}
 if(ev.target.closest('#scrim')){$('#sidebar')?.classList.remove('open');$('#scrim')?.classList.remove('open');return;}
 if(ev.target.closest('#togglePassword')){
  const input=$('#authPassword');const toggle=$('#togglePassword');
  if(input&&toggle){const visible=input.type==='password';input.type=visible?'text':'password';toggle.setAttribute('aria-pressed',String(visible));toggle.setAttribute('aria-label',visible?'Ocultar senha':'Mostrar senha');}return;
 }
 if(ev.target.closest('#forgotPassword')){setAuthMode('recover');return;}
 if(ev.target.closest('#backToLogin')){setAuthMode('login');return;}
 if(ev.target.closest('#logout')){await run(async()=>{await api.signOut();user=null;tenants=[];tenantId='';bundle=null;membership=null;memberships=[];show();});return;}
 if(ev.target.closest('#checkBalance')){
  const phone=$('#redeemPhone')?.value;
  if(!phone)return toast('Informe o telefone do cliente.','error');
  await run(async()=>{
   const customer=await api.lookupCustomerByPhone(tenantId,phone);
   const points=await api.balance(tenantId,customer.id);
   const output=$('#balanceResult');
   if(output)output.textContent=`${customer.name} · Saldo disponível: ${fmt(points)} pontos.`;
  });
  return;
 }
});
document.addEventListener('change',async ev=>{
 if(ev.target.matches('[data-reward-photo]')){
  const input=ev.target,form=input.closest('form'),preview=form?.querySelector('.reward-photo-preview');
  releaseRewardPhotoPreview();
  const file=input.files?.[0];
  if(!file){if(preview)preview.innerHTML=rewardImage({title:'Brinde'},'lg');return;}
  try{api.validateRewardImage(file);}catch(err){input.value='';toast(err.message,'error');return;}
  rewardPhotoPreviewURL=URL.createObjectURL(file);
  if(preview)preview.innerHTML=`<span class="reward-thumb lg"><img src="${e(rewardPhotoPreviewURL)}" alt="Prévia da foto selecionada"></span>`;
  const remove=form?.querySelector('input[name="removePhoto"]');if(remove)remove.checked=false;
  return;
 }

 if(ev.target.id==='rewardSelector'){
  const chosen=ev.target.value;
  document.querySelectorAll('[data-pick-reward]').forEach(node=>node.setAttribute('aria-pressed',String(node.dataset.pickReward===chosen)));
  return;
 }
 if(ev.target.id==='tenantSelector'){tenantId=ev.target.value;view=PORTAL==='balcao'?'counter':'dashboard';editingRewardId='';selectedCustomerId='';bundle=null;show();await run(async()=>{await load()});return;}
 if(ev.target.id==='period'){period=Number(ev.target.value);show();return;}
 if(ev.target.id==='consent'){consentOnly=ev.target.checked;show();return;}
});
document.addEventListener('input',ev=>{
 if(ev.target.id==='search'){const focus=ev.target.selectionStart;filter=ev.target.value;show();const search=$('#search');if(search){search.focus();search.setSelectionRange(focus,focus);}return;}
 if(ev.target.id==='redeemPhone'){const output=$('#balanceResult');if(output)output.textContent='';return;}
});
document.addEventListener('submit',async ev=>{
 const form=ev.target;const fd=new FormData(form);ev.preventDefault();
 if(form.id==='loginForm'){
  if(!isConfigReady())return showAuthFeedback('O login ainda não está conectado ao novo Supabase. A demonstração do painel continua disponível.','error');
  await runAuth(form,async()=>{await api.signIn(fd.get('email'),fd.get('password'));authMode='login';await load();});return;
 }
 if(form.id==='recoverForm'){
  if(!isConfigReady())return showAuthFeedback('A recuperação só poderá enviar e-mails após a configuração do banco de homologação.','error');
  await runAuth(form,async()=>{
   authEmail=fd.get('email');
   const redirect=new URL(window.location.pathname,window.location.origin).href;
   await api.requestPasswordReset(authEmail,redirect);
   showAuthFeedback('Se esse e-mail estiver cadastrado, você receberá orientações de recuperação. Verifique também a pasta de spam.');
  });return;
 }
 if(form.id==='newPasswordForm'){
  const pw=fd.get('password'),confirm=fd.get('confirmation');
  if(pw!==confirm)return showAuthFeedback('As senhas não coincidem.','error');
  await runAuth(form,async()=>{
   await api.updatePassword(pw);
   await api.signOut();user=null;tenants=[];tenantId='';bundle=null;
   setAuthMode('login');showAuthFeedback('Senha alterada. Entre com sua nova senha.');
  });return;
 }
 

 if(form.id==='saveProgram'){
  if(PORTAL!=='admin'||!isManager())return toast('Apenas gestores podem configurar pontos.','error');
  await run(async()=>{
   await api.updateProgram(tenantId,fd.get('rate'),Number(fd.get('expiry')),fd.get('enabled')==='true');
   await reload();
   toast('Regras de pontuação salvas. As novas regras valem para as próximas compras.');
  });return;
 }
 if(form.id==='saveReward'){
  if(PORTAL!=='admin'||!isManager())return toast('Apenas gestores podem editar brindes.','error');
  await run(async()=>{
   const id=String(fd.get('rewardId')||'');
   const old=bundle.loyalty_rewards.find(r=>r.id===id);
   if(!old)throw Error('Brinde não encontrado na empresa.');
   const photo=fileFromRewardForm(form),remove=fd.has('removePhoto')&&!photo;
   const raw=String(fd.get('stock')??'').trim();
   let uploaded='',dataSaved=false;
   try{
    if(photo)uploaded=await api.uploadRewardPhoto(tenantId,photo);
    await api.updateReward(tenantId,id,{
     title:fd.get('title'),points:Number(fd.get('points')),
     stock:raw===''?null:Number(raw),isActive:fd.get('enabled')==='true'
    });
    dataSaved=true;
    if(uploaded)await api.setRewardPhoto(tenantId,id,uploaded);
    else if(remove&&old.image_path)await api.setRewardPhoto(tenantId,id,null);
   }catch(err){
    if(uploaded)await api.removeRewardPhoto(uploaded).catch(()=>{});
    releaseRewardPhotoPreview();
    if(dataSaved){await reload();throw Error('As informações do brinde foram salvas, mas não foi possível alterar sua foto. Tente novamente.');}
    throw err;
   }
   const oldPath=old.image_path;
   releaseRewardPhotoPreview();
   editingRewardId='';
   await reload();
   if((uploaded||remove)&&oldPath){
    try{await api.removeRewardPhoto(oldPath);}catch{toast('Brinde salvo, mas a imagem antiga não pôde ser excluída do armazenamento.','error');return;}
   }
   toast(uploaded?'Brinde atualizado com nova foto.':remove?'Foto removida e brinde atualizado.':'Brinde atualizado com sucesso.');
  });return;
 }
 if(form.id==='createCustomer'){await run(async()=>{await api.createCustomer(tenantId,fd.get('name'),fd.get('phone'));await reload();toast('Cliente cadastrado.');});return;}
 if(form.id==='createReward'){
  if(PORTAL!=='admin'||!isManager())return toast('Sem permissão para configurar recompensas.','error');
  await run(async()=>{
   const photo=fileFromRewardForm(form);
   const points=Number(fd.get('points')),raw=String(fd.get('stock')??'').trim();
   const stock=raw===''?null:Number(raw),cost=String(fd.get('cost')??'').trim()?parseReais(fd.get('cost')):null;
   let uploaded='',created=false;
   try{
    if(photo)uploaded=await api.uploadRewardPhoto(tenantId,photo);
    const result=await api.createReward(tenantId,fd.get('title'),points,stock,cost);
    created=true;
    if(uploaded)await api.setRewardPhoto(tenantId,result.reward_id,uploaded);
   }catch(err){
    if(uploaded)await api.removeRewardPhoto(uploaded).catch(()=>{});
    releaseRewardPhotoPreview();
    if(created){await reload();throw Error('O brinde foi cadastrado, mas a foto não pôde ser associada. Abra Editar e tente novamente.');}
    throw err;
   }
   releaseRewardPhotoPreview();
   await reload();
   toast(photo?'Brinde e foto cadastrados com sucesso.':'Brinde cadastrado. Você pode adicionar a foto em Editar.');
  });return;
 }
 if(form.id==='creditForm'){
  if(PORTAL!=='balcao')return toast('Use o painel do balcão.','error');
  await run(async()=>{
   const customer=await api.lookupCustomerByPhone(tenantId,fd.get('phone'));
   const amount=parseReais(fd.get('amount'));
   if(!Number.isSafeInteger(amount)||amount<=0)throw Error('Informe o valor válido da compra.');
   if(!window.confirm(`Confirmar compra de ${curr(amount)} para ${customer.name} (${customer.phone_e164})?`))return;
   const fields={tenantId,customer:customer.id,amount};
   const rid=requestFor('credit',fields);
   const response=await api.credit(tenantId,customer.id,amount,rid);
   pending.delete('credit');
   await reload();
   toast(response.replayed?'Solicitação já processada — sem duplicar pontos.':`${fmt(response.credited_points)} pontos creditados para ${customer.name}.`);
  });
  return;
 }
 if(form.id==='redeemForm'){
  if(PORTAL!=='balcao')return toast('Use o painel do balcão.','error');
  await run(async()=>{
   const customer=await api.lookupCustomerByPhone(tenantId,fd.get('phone'));
   const reward=bundle.loyalty_rewards.find(r=>r.id===fd.get('reward')&&r.is_active&&(r.stock===null||r.stock>0));
   if(!reward)throw Error('Brinde indisponível. Atualize a página.');
   const points=await api.balance(tenantId,customer.id);
   if(Number(points)<Number(reward.points_required))throw Error(`Saldo insuficiente: ${customer.name} tem ${fmt(points)} pontos e o brinde exige ${fmt(reward.points_required)}.`);
   if(!window.confirm(`Confirmar resgate de "${reward.title}" (${fmt(reward.points_required)} pontos) para ${customer.name} (${customer.phone_e164})? Saldo: ${fmt(points)} pontos.`))return;
   const fields={tenantId,customer:customer.id,reward:reward.id};
   const rid=requestFor('redeem',fields);
   const response=await api.redeem(tenantId,customer.id,reward.id,rid);
   pending.delete('redeem');
   await reload();
   toast(response.replayed?'Resgate já registrado — não duplicado.':`Brinde resgatado para ${customer.name}.`);
  });
  return;
 }
});
async function bootstrap(){
 if(!isConfigReady()){show();return;}
 try {
  api=new VelyoBackend(window.VELYO_CONFIG,{scope:PORTAL});
  if(window.location.hash){
   try {if(api.loadRecoveryTokens(window.location.hash)){
     window.history.replaceState(null,'',window.location.pathname+window.location.search);
     authMode='new-password';show();return;
   }}catch(err){window.history.replaceState(null,'',window.location.pathname+window.location.search);authMode='login';show();showAuthFeedback(err.message,'error');return;}
  }
  if(api.session)await load();else show();
 }
 catch(err){if(api){await api.signOut();user=null;}login();toast(err.message,'error');}
}
bootstrap();

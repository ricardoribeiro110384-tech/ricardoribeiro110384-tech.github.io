/**
 * Indicadores gerenciais do Velyo — somente operações registradas.
 * As funções não alteram estado e recebem a data de referência para testes reproduzíveis.
 * Compras de migração sem valor NÃO são inferidas como vendas.
 */
export const DAY_MS = 86400000;
export const isVerifiedPurchase = (t) => t?.kind === 'credit' && Number.isSafeInteger(t.amountCents) && t.amountCents > 0 && !t.reversedAt;
const validDate = x => Number.isFinite(Date.parse(x));
const inWindow = (t, since, until) => validDate(t.createdAt) && Date.parse(t.createdAt) >= since && Date.parse(t.createdAt) <= until;

export function managementMetrics(state, tenantId, periodDays = 30, at = Date.now()) {
  if(!Number.isFinite(at) || !Number.isInteger(periodDays) || periodDays<1) throw Error('Período inválido');
  const since = at - periodDays * DAY_MS;
  const clients = state.customers.filter(c => c.tenant === tenantId);
  const identities = new Set(clients.map(c => c.id));
  const purchases = state.transactions.filter(t => t.tenant === tenantId && identities.has(t.customerId) && isVerifiedPurchase(t) && validDate(t.createdAt) && Date.parse(t.createdAt) <= at);
  const current = purchases.filter(t => inWindow(t, since, at));
  const purchaseByClient = new Map();
  const periodByClient = new Map();
  for(const p of purchases){
    const group = purchaseByClient.get(p.customerId) || [];
    group.push(p); purchaseByClient.set(p.customerId, group);
  }
  for(const p of current) periodByClient.set(p.customerId, (periodByClient.get(p.customerId)||0) + 1);
  const activeBuyers = periodByClient.size;
  const repeatBuyers = [...periodByClient.values()].filter(n=>n>=2).length;
  const noPurchaseHistory = clients.filter(c => !purchaseByClient.has(c.id)).length;
  const risks=[];
  for(const c of clients){
    const hist = purchaseByClient.get(c.id);
    if(!hist || hist.length < 2) continue;
    const last = Math.max(...hist.map(t => Date.parse(t.createdAt)));
    const elapsedDays = Math.floor((at - last)/DAY_MS);
    if(elapsedDays < 30) continue;
    const sum = hist.reduce((v,t)=>v+t.amountCents,0);
    risks.push({id:c.id,name:c.name,phone:c.phone,daysSince:elapsedDays,purchases:hist.length,registeredSpendCents:sum,lastPurchase:new Date(last).toISOString(),optIn:c.optIn===true,status:elapsedDays>=90?'Inativo 90+ dias':'Atenção 30–89 dias'});
  }
  risks.sort((a,b)=>b.registeredSpendCents-a.registeredSpendCents || b.daysSince-a.daysSince);
  const rewards = new Map(state.rewards.filter(r=>r.tenant===tenantId).map(r=>[r.id,r]));
  const redeems = state.transactions.filter(t=>t.tenant===tenantId && t.kind==='redemption' && identities.has(t.customerId) && !t.reversedAt && inWindow(t,since,at));
  const rewardRows=new Map();
  let knownCostCents=0, unpricedRedemptions=0;
  for(const r of redeems){
    const rew = rewards.get(r.rewardId);
    // Só confiamos em custos registrados no momento do resgate.
    const cost = Number.isSafeInteger(r.rewardCostCents)&&r.rewardCostCents>=0 ? r.rewardCostCents : null;
    if(cost===null)unpricedRedemptions++; else knownCostCents+=cost;
    const key = r.rewardId || r.rewardTitle || 'Desconhecido';
    const row = rewardRows.get(key) || {id:key,name:r.rewardTitle || rew?.title || 'Recompensa',quantity:0,knownCostCents:0,unpriced:0};
    row.quantity++;
    if(cost===null)row.unpriced++; else row.knownCostCents+=cost;
    rewardRows.set(key,row);
  }
  const outstanding = state.lots.filter(l => l.tenant===tenantId && l.remaining>0 && validDate(l.expiresAt) && Date.parse(l.expiresAt)>at);
  const expiringPoints30 = outstanding.filter(l=>Date.parse(l.expiresAt)<=at+30*DAY_MS).reduce((sum,l)=>sum+l.remaining,0);
  const periodVolumeCents = current.reduce((sum,t)=>sum+t.amountCents,0);
  return {
    periodDays, since: new Date(since).toISOString(), totalClients:clients.length,
    purchaseCount:current.length, activeBuyers, repeatBuyers,
    repurchaseRate: activeBuyers ? 100*repeatBuyers/activeBuyers : null,
    periodVolumeCents, avgTicketCents:current.length ? Math.round(periodVolumeCents/current.length):null,
    noPurchaseHistory, risks, riskCount:risks.length,
    redemptions:redeems.length, knownCostCents, unpricedRedemptions,
    costComplete:unpricedRedemptions===0, costCoverage:redeems.length ? (redeems.length-unpricedRedemptions)/redeems.length : null,
    rewardRows:[...rewardRows.values()].sort((a,b)=>b.knownCostCents-a.knownCostCents),
    outstandingPoints:outstanding.reduce((sum,l)=>sum+l.remaining,0), expiringPoints30,
    // O valor conhecido dos benefícios não representa lucro, CAC nem ROI.
  };
}

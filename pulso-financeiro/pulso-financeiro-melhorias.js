/* Pulso Financeiro — Etapa 1: regras financeiras, faturas e movimentações.
   Compatível com os dados locais e backups anteriores (versão 1).
   Ainda é uma demonstração: sem autenticação, servidor ou integração bancária. */
'use strict';
const pfToday = `${today.getFullYear()}-${String(today.getMonth()+1).padStart(2,'0')}-${String(today.getDate()).padStart(2,'0')}`;
const pfOldDashboard = renderDashboard;
const pfOldReports = renderReports;
const pfOldSettings = renderSettings;
const pfOldOpenModal = openModal;
const pfOldSubmitModal = submitModal;
const pfOldBudget = renderBudget;
const pfOldDeleteFixed = deleteFixed;

function pfShiftMonth(ym, offset=1){const [y,m]=ym.split('-').map(Number);return localMonth(new Date(y,m-1+offset,1))}
function pfValidDate(value){if(!/^\d{4}-\d{2}-\d{2}$/.test(value||''))return false;const [y,m,d]=value.split('-').map(Number);const dt=new Date(y,m-1,d);return dt.getFullYear()===y&&dt.getMonth()===m-1&&dt.getDate()===d}
function pfTodayInMonth(){return month===currentMonth?pfToday:isoDate(1,month)}
function pfCents(n){return Math.round(Number(n)*100)}
function pfInstallmentAmounts(total,n){const cents=pfCents(total),base=Math.floor(cents/n);return Array.from({length:n},(_,i)=>(i===0?cents-base*(n-1):base)/100)}
function pfInvoiceMonth(date,card){return pfShiftMonth(date.slice(0,7),Number(date.slice(-2))>Number(card.closing||5)?1:0)}
function pfDueDate(card,billMonth){const closing=Number(card.closing||5),due=Number(card.due||Math.min(28,closing+7));return isoDate(due,pfShiftMonth(billMonth,due<=closing?1:0))}
function pfCardItems(card,data=D()){
  const rows=[];
  for(const t of data.transactions){if(t.type!=='expense'||t.method!=='credit'||t.cardId!==card.id)continue;
    const n=Math.max(1,Math.min(24,Math.trunc(Number(t.installments)||1))),first=pfInvoiceMonth(t.date,card),parts=pfInstallmentAmounts(t.amount,n);
    for(let i=0;i<n;i++)rows.push({billMonth:pfShiftMonth(first,i),amount:parts[i],index:i+1,count:n,title:t.title,purchaseId:t.id,date:t.date,category:t.category});
  }
  return rows;
}
function pfInvoice(card,billMonth,data=D()){
  const entries=pfCardItems(card,data).filter(t=>t.billMonth===billMonth);
  const total=pfCents(sum(entries,t=>t.amount))/100;
  const payments=data.transactions.filter(t=>t.type==='card_payment'&&t.cardId===card.id&&t.billMonth===billMonth);
  const paid=pfCents(sum(payments,t=>t.amount))/100;
  return {entries,total,paid,remaining:Math.max(0,pfCents(total-paid))/100,due:pfDueDate(card,billMonth),payments};
}
function pfCardOutstanding(card,data=D()){
  const purchases=sum(pfCardItems(card,data),i=>i.amount);
  const payments=sum(data.transactions.filter(t=>t.type==='card_payment'&&t.cardId===card.id),t=>+t.amount);
  return Math.max(0,pfCents(purchases-payments))/100;
}
function pfValidInvoices(data=D()){
  for(const card of data.cards){const months=new Set(pfCardItems(card,data).map(i=>i.billMonth));
    data.transactions.filter(t=>t.type==='card_payment'&&t.cardId===card.id).forEach(t=>months.add(t.billMonth));
    for(const ym of months){const bill=pfInvoice(card,ym,data);if(pfCents(bill.paid)>pfCents(bill.total))return false;}
  }return true;
}
function pfDateForAccount(t){return pfValidDate(t.date)&&t.date<=pfToday}
// Transfers and card settlements change cash balances, not expenses.
accBalance = function(a){const start=pfCents(a.balance);let delta=0;for(const t of D().transactions){if(!pfDateForAccount(t))continue;const value=pfCents(t.amount);if(t.type==='transfer'){
    if(t.transferType==='account'){if(t.accountId===a.id)delta-=value;if(t.toAccountId===a.id)delta+=value;}
    else if(t.accountId===a.id)delta+=t.transferType==='goal_withdrawal'?value:-value;
  }else if(t.type==='card_payment'){if(t.accountId===a.id)delta-=value;}
  else if(t.method!=='credit'&&t.accountId===a.id)delta+=t.type==='income'?value:t.type==='expense'?-value:0;
  }return (start+delta)/100;};

function pfRecordLabel(t){if(t.type==='card_payment')return 'Pagamento de fatura';if(t.type==='transfer')return t.transferType==='account'?'Entre contas':t.transferType==='goal_withdrawal'?'Resgate de cofrinho':'Depósito em cofrinho';return t.method==='credit'?'Cartão':'Conta'}
function pfRecordValue(t){return `${t.type==='income'?'+':t.type==='transfer'?'↔':'−'} ${fmt(t.amount)}`}
function pfSafeName(id){return esc(id)}
function pfMessage(msg){const saved=save();closeModal();render();notify(saved?msg:'Alterado nesta sessão; armazenamento local indisponível.')}
function pfError(message){notify(message);return false}
function pfActiveBudgets(){return {...D().budgets,...(D().budgetMonths?.[month]||{})}}

renderDashboard = function(){const credit=D().cards.reduce((n,c)=>n+pfInvoice(c,month).remaining,0),debt=sum(D().cards,pfCardOutstanding);
  const box=`${topSection('Faturas e compromissos',monthLabel())}<div class="stat-grid">${stat('Faturas do período',credit,'Saldo das faturas selecionadas','var(--purple)','▱')}${stat('Dívida nos cartões',debt,'Inclui parcelas futuras','var(--red)','↘')}${stat('Disponível nas contas',accTotal(),'Caixa atual, sem faturas futuras','var(--green)','▣')}${stat('Posição líquida',accTotal()+allGoals()-debt,'Contas + metas − cartões','var(--orange)','≋')}</div><p class="hint">Compras no crédito entram na despesa no mês da compra; o pagamento da fatura altera apenas a conta bancária. Os gastos fixos pendentes não entram no resultado até serem pagos.</p>`;
  return pfOldDashboard()+box;
};

renderTransactions=function(){const ts=[...monthTx()].filter(t=>(txFilter==='all'||t.type===txFilter||txFilter==='transfer'&&t.type==='card_payment')&&(!search||t.title.toLowerCase().includes(search.toLowerCase())||String(t.category||'').toLowerCase().includes(search.toLowerCase()))).sort((a,b)=>b.date.localeCompare(a.date)),v=monthly();
  const row=t=>`<tr><td><b>${esc(t.title)}</b>${t.method==='credit'?`<div class="text-muted">${Number(t.installments)||1}x no crédito</div>`:''}</td><td>${esc(t.category||'Movimentação')}</td><td>${dateBR(t.date)}</td><td class="text-muted">${pfRecordLabel(t)}</td><td class="${t.type==='income'?'type-in':t.type==='transfer'||t.type==='card_payment'?'type-transfer':'type-out'}">${pfRecordValue(t)}</td><td>${(t.type==='income'||t.type==='expense')&&!t.fixedId?`<button class="little-btn" onclick="openModal('transaction-edit','${pfSafeName(t.id)}')">Editar</button> `:''}<button class="little-btn" onclick="deleteTransaction('${pfSafeName(t.id)}')">Excluir</button></td></tr>`;
  const mobile=t=>`<article class="mobile-entry"><div class="mobile-head"><b>${esc(t.title)}</b><b class="${t.type==='income'?'type-in':t.type==='expense'?'type-out':'type-transfer'}">${pfRecordValue(t)}</b></div><div class="text-muted">${dateBR(t.date)} · ${esc(t.category||'Movimentação')} · ${pfRecordLabel(t)}${t.method==='credit'?' · '+(Number(t.installments)||1)+'x':''}</div><div class="mobile-actions">${(t.type==='expense'||t.type==='income')&&!t.fixedId?`<button class="little-btn" onclick="openModal('transaction-edit','${pfSafeName(t.id)}')">Editar</button>`:''}<button class="little-btn" onclick="deleteTransaction('${pfSafeName(t.id)}')">Excluir</button></div></article>`;
  return `${demoBanner()}<div class="stat-grid">${stat('Receitas',v.income,'Recebimentos do mês','var(--green)','↗')}${stat('Despesas',v.out,'Compras registradas no período','var(--red)','↘')}${stat('Resultado',v.result,'Receitas − despesas','var(--blue)','≋')}${stat('Caixa atual',accTotal(),'Contas até hoje','var(--purple)','▣')}</div>${topSection('Movimentações')}<div class="panel"><div class="toolbar"><div class="fields"><input id="search" class="input-surface" placeholder="Pesquisar lançamento" value="${esc(search)}" oninput="setSearch(this.value)"/><select class="input-surface" onchange="setFilter(this.value)"><option value="all" ${txFilter==='all'?'selected':''}>Todos</option><option value="income" ${txFilter==='income'?'selected':''}>Receitas</option><option value="expense" ${txFilter==='expense'?'selected':''}>Despesas</option><option value="transfer" ${txFilter==='transfer'?'selected':''}>Transferências e pagamentos</option></select></div><div class="toolbar-actions"><button class="btn" onclick="openModal('transfer')">↔ Transferir</button><button class="btn btn-primary" onclick="openModal('transaction')">＋ Novo lançamento</button></div></div>${ts.length?`<div class="desktop-entries table-scroll"><table class="data-table"><thead><tr><th>Descrição</th><th>Categoria</th><th>Data</th><th>Meio</th><th>Valor</th><th>Ações</th></tr></thead><tbody>${ts.map(row).join('')}</tbody></table></div><div class="mobile-entries">${ts.map(mobile).join('')}</div>`:empty('Nada encontrado','Adicione um lançamento ou altere os filtros.')}</div><p class="hint">Despesas no crédito são contabilizadas no mês da compra, independentemente das parcelas. Pagamentos de fatura e transferências aparecem apenas como movimentações de caixa, sem duplicar despesas.</p>`;
};

renderAccounts=function(){const cards=D().cards,debt=sum(cards,pfCardOutstanding);return `${demoBanner()}${topSection('Contas bancárias e caixa','',`<button class="btn btn-primary" onclick="openModal('account')">＋ Nova conta</button>`)}<div class="items-grid">${D().accounts.map(a=>`<div class="item-card"><div class="item-top"><span class="symbol">▣</span><span>Saldo atual</span></div><h3>${esc(a.name)}</h3><div class="big">${fmt(accBalance(a))}</div><p>Saldo inicial: ${fmt(a.balance)}. Entradas, pagamentos de fatura, transferências e resgates até hoje.</p><button class="btn" onclick="openModal('transaction','${pfSafeName(a.id)}')">＋ Movimentar</button><button class="btn" onclick="openModal('transfer','${pfSafeName(a.id)}')">↔ Transferir</button></div>`).join('')||empty('Sem contas','Cadastre sua primeira conta.')}</div>${topSection('Posição financeira atual')}<div class="stat-grid">${stat('Saldo nas contas',accTotal(),'Disponível hoje','var(--blue)','▣')}${stat('Nos cofrinhos',allGoals(),'Alocado em metas','var(--green)','◎')}${stat('Dívidas de cartões',debt,'Parcelas não pagas','var(--red)','▱')}${stat('Posição líquida',accTotal()+allGoals()-debt,'Contas + cofrinhos − cartões','var(--orange)','≋')}</div><p class="hint">O saldo considera movimentos com data até hoje. Não representa patrimônio total e não inclui outros empréstimos, investimentos ou bens.</p>`};

renderCards=function(){const cards=D().cards;return `${demoBanner()}${topSection('Cartões e faturas','',`<button class="btn btn-primary" onclick="openModal('card')">＋ Cadastrar cartão</button>`)}<div class="items-grid">${cards.map(c=>{const bill=pfInvoice(c,month),debt=pfCardOutstanding(c),free=Number(c.limit)-debt;return `<div class="item-card"><div class="item-top"><span class="symbol">▱</span><span>Fecha dia ${c.closing} · Vence dia ${c.due||Math.min(28,+c.closing+7)}</span></div><h3>${esc(c.name)}</h3><div class="big">${fmt(bill.remaining)}</div><p>Fatura de ${monthLabel()} · Vencimento ${dateBR(bill.due)}<br>Faturado: ${fmt(bill.total)} · Pago: ${fmt(bill.paid)}</p>${progress(debt,c.limit,free<0?'var(--red)':'var(--purple)')}<p>Comprometido: ${fmt(debt)} · Limite disponível estimado: ${fmt(free)}</p><button class="btn btn-primary" onclick="openModal('transaction','','${pfSafeName(c.id)}')">＋ Nova compra</button><button class="btn" onclick="openModal('cardpay','${pfSafeName(c.id)}','${month}')" ${bill.remaining<=0?'disabled':''}>Pagar fatura</button><button class="btn" onclick="openModal('card-edit','${pfSafeName(c.id)}')">Editar dados do cartão</button></div>`}).join('')||empty('Nenhum cartão','Cadastre um cartão com fechamento e vencimento.')}</div>${topSection('Detalhamento da fatura de '+monthLabel())}${cards.map(c=>{const bill=pfInvoice(c,month);return `<div class="panel" style="margin-bottom:14px"><div class="panel-head"><div><h3>${esc(c.name)}</h3><p>Vencimento em ${dateBR(bill.due)} · ${bill.remaining===0?'Quitada ou sem compras':bill.due<pfToday?'Vencida':'Pendente'}</p></div><strong>${fmt(bill.remaining)}</strong></div>${bill.entries.length?`<div class="table-scroll"><table class="data-table"><thead><tr><th>Compra</th><th>Data</th><th>Parcela</th><th>Valor</th></tr></thead><tbody>${bill.entries.map(i=>`<tr><td>${esc(i.title)}</td><td>${dateBR(i.date)}</td><td>${i.index}/${i.count}</td><td>${fmt(i.amount)}</td></tr>`).join('')}</tbody></table></div>`:empty('Sem compras nesta fatura','Escolha outro mês no seletor superior.')}${bill.payments.length?`<p class="hint">Pagamentos: ${bill.payments.map(p=>`${dateBR(p.date)} — ${fmt(p.amount)}`).join('; ')}</p>`:''}</div>`}).join('')}<p class="hint">Regras desta versão: compras fecham no dia configurado, parcelas são distribuídas nas faturas seguintes e o pagamento reduz a dívida e o saldo da conta, mas não é registrado como nova despesa. Limite disponível é uma estimativa baseada apenas nos lançamentos cadastrados, sem taxas, juros ou ajustes da instituição.</p>`};

renderGoals=function(){return `${demoBanner()}${topSection('Metas e cofrinhos','',`<button class="btn btn-primary" onclick="openModal('goal')">＋ Novo cofrinho</button>`)}<div class="items-grid">${D().goals.map(g=>`<div class="item-card"><div class="item-top"><span class="symbol">◎</span><span>${pct(g.saved,g.target)}% alcançado</span></div><h3>${esc(g.name)}</h3><div class="big" style="color:var(--green)">${fmt(g.saved)}</div><p>Objetivo: ${fmt(g.target)}</p>${progress(g.saved,g.target,'var(--green)')}<p>${g.saved>=g.target?'Meta concluída!':'Faltam '+fmt(Math.max(0,g.target-g.saved))}</p><button class="btn btn-primary" onclick="openModal('deposit','${pfSafeName(g.id)}')">＋ Guardar dinheiro</button><button class="btn" onclick="openModal('withdraw','${pfSafeName(g.id)}')" ${g.saved<=0?'disabled':''}>↩ Resgatar para uma conta</button></div>`).join('')||empty('Sem cofrinhos','Crie uma meta para começar.')}</div><p class="hint">Depósitos e resgates movem saldo entre as contas e as metas; nunca são contabilizados como receita ou despesa.</p>`};

renderFixed=function(){const fs=[...D().fixed].sort((a,b)=>a.day-b.day),paid=fs.filter(f=>f.paid?.[month]),pending=fs.filter(f=>!f.paid?.[month]),overdue=pending.filter(f=>isoDate(f.day,month)<pfToday);return `${demoBanner()}<div class="stat-grid">${stat('Previsão de gastos fixos',sum(fs,f=>+f.amount),'Previsto para o mês','var(--purple)','▦')}${stat('Já pagos',sum(paid,f=>+f.amount),`${paid.length} contas`,'var(--green)','✓')}${stat('A pagar',sum(pending,f=>+f.amount),`${pending.length} contas pendentes`,'var(--orange)','◷')}${stat('Em atraso',sum(overdue,f=>+f.amount),`${overdue.length} vencimentos`,'var(--red)','!')}</div>${topSection('Compromissos recorrentes','',`<button class="btn btn-primary" onclick="openModal('fixed')">＋ Cadastrar despesa</button>`)}<div class="panel">${fs.length?`<div class="table-scroll"><table class="data-table"><thead><tr><th>Descrição</th><th>Categoria</th><th>Vencimento</th><th>Valor</th><th>Situação</th><th>Ações</th></tr></thead><tbody>${fs.map(f=>{let done=Boolean(f.paid?.[month]),late=!done&&isoDate(f.day,month)<pfToday;return `<tr><td><b>${esc(f.name)}</b></td><td>${esc(f.category)}</td><td>${dateBR(isoDate(f.day,month))}</td><td>${fmt(f.amount)}</td><td style="color:${done?'var(--green)':late?'var(--red)':'var(--orange)'}">${done?'✓ Pago':late?'● Vencido':'◷ Pendente'}</td><td><button class="little-btn" onclick="toggleFixed('${pfSafeName(f.id)}')">${done?'Desfazer':'Pagar'}</button> <button class="little-btn" onclick="openModal('fixed-edit','${pfSafeName(f.id)}')">Editar</button> <button class="little-btn" onclick="deleteFixed('${pfSafeName(f.id)}')">Excluir</button></td></tr>`}).join('')}</tbody></table></div>`:empty('Sem gastos recorrentes','Cadastre as contas que se repetem todos os meses.')}</div><p class="hint">Uma conta recorrente só vira despesa realizada quando for marcada como paga. Ao desfazer o pagamento, o lançamento automático é removido. Alterações no cadastro não mudam pagamentos históricos.</p>`};

renderBudget=function(){const original=D().budgets;D().budgets=pfActiveBudgets();try{return pfOldBudget().replace('Limites de gastos por categoria','Limites por categoria para '+monthLabel()).replace('Compare o limite que definiu com o gasto efetivo','Limites deste mês, sem alterar os anteriores')}finally{D().budgets=original}};
renderReports=function(){return pfOldReports()+`<div class="alert" style="margin-top:16px">Receitas e despesas mostram movimentações econômicas do mês, inclusive o valor total das compras no crédito na data da compra. Faturas pagas e transferências são movimentos de caixa e não entram novamente como despesas.</div>`};
renderSettings=function(){return pfOldSettings().replace('Sem conciliação de cartão','Cartões controlados localmente').replace('Não calcula parcelas, fechamento de faturas ou pagamento de cartão. Compras são apenas registradas no mês.','Parcelas, fechamento e pagamentos são calculados com base nos registros inseridos. Não há importação bancária, juros ou conciliação com extratos.');};

function pfTextField(id,label,value='',type='text'){return field(id,label,type,value,id==='title'?'full':'')}
function pfSelect(id,label,opts,val){return selectField(id,label,opts,val)}
function pfShowModal(html,type,id=''){modalType=type;modalId=id;document.getElementById('modal-root').innerHTML=html;document.querySelector('.modal input:not([disabled])')?.focus();}
function pfTransFields(existing=null,acc='',card=''){
  const cat=CATEGORIES.map(c=>[c,c]),accounts=accountOpts(),cards=cardOpts();const isCredit=existing?existing.method==='credit':!!card;
  return `${field('title','Descrição','text',existing?.title||'','full')}${pfSelect('type','Tipo',[['expense','Despesa'],['income','Receita']],existing?.type||'expense')}${field('amount','Valor total (R$)','number',existing?.amount||'')}${field('date','Data','date',existing?.date||pfTodayInMonth())}${pfSelect('category','Categoria',cat,existing?.category||'Outros')}${selectField('method','Forma de registro',[['account','Conta / caixa'],['credit','Cartão de crédito']],isCredit?'credit':'account','onchange="updateMethodFields()"')}${pfSelect('accountId','Conta',accounts.length?accounts:[['','Cadastre uma conta']],existing?.accountId||acc||accounts[0]?.[0]||'')}${pfSelect('cardId','Cartão',cards.length?cards:[['','Cadastre um cartão']],existing?.cardId||card||cards[0]?.[0]||'')}${field('installments','Parcelas (1 a 24)','number',existing?.installments||1)}`;
}
openModal=function(type,id='',extra=''){
  const d=D(),cat=CATEGORIES.map(c=>[c,c]);
  if(type==='transaction'||type==='transaction-edit'){
    const existing=type==='transaction-edit'?d.transactions.find(t=>t.id===id):null;
    if(type==='transaction-edit'&&!existing)return;
    if(existing&&(existing.fixedId||!['expense','income'].includes(existing.type)))return pfError('Este lançamento deve ser ajustado pela ação que o originou.');
    pfShowModal(modalHTML(existing?'Editar lançamento':'Novo lançamento',pfTransFields(existing,id,extra),`<p class="hint">Para compras no cartão, o total aparece no mês da compra e as parcelas nas faturas. Pagamentos de fatura não duplicam despesas.</p>`),type,id);updateMethodFields();document.getElementById('f-type').onchange=updateMethodFields;return;
  }
  if(type==='transfer'){
    if(d.accounts.length<2)return pfError('Cadastre pelo menos duas contas para transferir entre elas.');
    const from=id||d.accounts[0].id,to=d.accounts.find(a=>a.id!==from)?.id||'';
    pfShowModal(modalHTML('Transferir entre contas',`${field('amount','Valor (R$)','number')}${field('date','Data','date',pfTodayInMonth())}${pfSelect('accountId','De qual conta?',accountOpts(),from)}${pfSelect('toAccountId','Para qual conta?',accountOpts(),to)}`,`<p class="hint">Movimentação interna, não é receita nem despesa.</p>`),type,id);return;
  }
  if(type==='withdraw'){
    const goal=d.goals.find(g=>g.id===id);if(!goal)return;
    pfShowModal(modalHTML('Resgatar do cofrinho',`<div class="field full"><label>Meta</label><input value="${esc(goal.name)}" disabled></div>${field('amount','Valor (R$)','number')}${pfSelect('accountId','Depositar na conta',accountOpts(),d.accounts[0]?.id||'')}`,`<p class="hint">Disponível para resgatar: ${fmt(goal.saved)}</p>`),type,id);return;
  }
  if(type==='cardpay'){
    const c=d.cards.find(x=>x.id===id);if(!c)return;const ym=extra||month,bill=pfInvoice(c,ym);if(bill.remaining<=0)return pfError('Não há saldo desta fatura para pagar.');
    pfShowModal(modalHTML('Pagar fatura',`<div class="field full"><label>Cartão e fatura</label><input value="${esc(c.name)} · ${monthLabel(ym)}" disabled></div>${field('amount','Valor do pagamento (R$)','number',bill.remaining)}${field('date','Data do pagamento','date',pfToday)}${pfSelect('accountId','Debitar da conta',accountOpts(),d.accounts[0]?.id||'')}`,`<p class="hint">Saldo em aberto: ${fmt(bill.remaining)} · Vencimento: ${dateBR(bill.due)}. Pagamento parcial é permitido.</p>`),type,`${id}|${ym}`);return;
  }
  if(type==='card'||type==='card-edit'){
    const c=type==='card-edit'?d.cards.find(x=>x.id===id):null;
    if(type==='card-edit'&&!c)return;
    pfShowModal(modalHTML(c?'Editar cartão':'Novo cartão',`${field('name','Nome do cartão','text',c?.name||'','full')}${field('limit','Limite total (R$)','number',c?.limit||'')}${field('closing','Dia de fechamento (1 a 28)','number',c?.closing||5)}${field('due','Dia de vencimento (1 a 28)','number',c?.due||12)}`,`<p class="hint">Alterar o dia de fechamento recalcula as faturas das compras registradas. Um fechamento novo pode exigir corrigir pagamentos antigos.</p>`),type,id);return;
  }
  if(type==='fixed'||type==='fixed-edit'){
    const f=type==='fixed-edit'?d.fixed.find(x=>x.id===id):null;if(type==='fixed-edit'&&!f)return;
    pfShowModal(modalHTML(f?'Editar gasto fixo':'Novo gasto fixo',`${field('name','Descrição','text',f?.name||'','full')}${field('amount','Valor mensal (R$)','number',f?.amount||'')}${field('day','Dia de vencimento (1 a 28)','number',f?.day||10)}${pfSelect('category','Categoria',cat,f?.category||'Moradia')}${pfSelect('accountId','Conta para o pagamento',accountOpts(),f?.accountId||'')}`,`<p class="hint">Alterações no cadastro não reescrevem pagamentos já feitos.</p>`),type,id);return;
  }
  if(type==='deposit'){
    const g=d.goals.find(x=>x.id===id);if(!g)return;
    pfShowModal(modalHTML('Guardar no cofrinho',`<div class="field full"><label>Meta</label><input value="${esc(g.name)}" disabled></div>${field('amount','Valor (R$)','number')}${pfSelect('accountId','Retirar da conta',accountOpts(),d.accounts[0]?.id||'')}`,`<p class="hint">O depósito não é despesa e apenas movimenta recursos da conta para o cofrinho.</p>`),type,id);return;
  }
  if(type==='budget'){
    const budgets=pfActiveBudgets();pfShowModal(modalHTML('Orçamento para '+monthLabel(),`${pfSelect('category','Categoria',cat,id||'Alimentação')}${field('amount','Limite (R$)','number',id?budgets[id]||'':'')}`,`<p class="hint">Este valor altera somente o mês escolhido.</p>`),type,id);return;
  }
  return pfOldOpenModal(type,id,extra);
};

updateMethodFields=function(){const method=document.getElementById('f-method')?.value,credit=method==='credit',acc=document.getElementById('f-accountId'),card=document.getElementById('f-cardId'),parts=document.getElementById('f-installments'),kind=document.getElementById('f-type');
  if(acc){acc.parentNode.style.display=credit?'none':'flex';acc.disabled=credit}
  if(card){card.parentNode.style.display=credit?'flex':'none';card.disabled=!credit}
  if(parts){parts.parentNode.style.display=credit?'flex':'none';parts.disabled=!credit}
  if(kind){const inc=kind.querySelector('option[value="income"]');if(inc)inc.disabled=credit;if(credit)kind.value='expense'}
};
function pfCanSubtractFrom(accountId,value){const a=D().accounts.find(x=>x.id===accountId);return a&&accBalance(a)+.00001>=value}
submitModal=function(event){
  if(!['transaction','transaction-edit','transfer','withdraw','deposit','cardpay','card','card-edit','fixed','fixed-edit','budget'].includes(modalType))return pfOldSubmitModal(event);
  event.preventDefault();const obj=getform(event.target),d=D(),n=Number(obj.amount),type=modalType;
  if('amount' in obj&&(!Number.isFinite(n)||n<=0||pfCents(n)<1))return pfError('Informe valor válido, maior que zero.');
  if(type==='transaction'||type==='transaction-edit'){
    if(!obj.title?.trim()||!pfValidDate(obj.date))return pfError('Informe descrição e data válidas.');
    if(!['expense','income'].includes(obj.type))return pfError('Tipo inválido.');
    if(!['account','credit'].includes(obj.method))return pfError('Forma inválida.');
    if(obj.method==='credit'&&(obj.type!=='expense'||!d.cards.some(c=>c.id===obj.cardId)))return pfError('Escolha um cartão válido para a compra.');
    if(obj.method==='account'&&!d.accounts.some(a=>a.id===obj.accountId))return pfError('Escolha uma conta válida.');
    const installments=obj.method==='credit'?Number(obj.installments):1;
    if(!Number.isInteger(installments)||installments<1||installments>24)return pfError('Informe de 1 a 24 parcelas.');
    const original=type==='transaction-edit'?d.transactions.find(x=>x.id===modalId):null;
    if(type==='transaction-edit'&&!original)return pfError('Lançamento não encontrado.');
    if(original?.fixedId)return pfError('Desfaça o pagamento recorrente antes de editá-lo.');
    const candidate={id:original?.id||uid(),title:obj.title.trim().slice(0,100),type:obj.type,amount:pfCents(n)/100,date:obj.date,category:obj.category,method:obj.method,accountId:obj.method==='account'?obj.accountId:'',cardId:obj.method==='credit'?obj.cardId:'',installments};
    const old=d.transactions;d.transactions=old.filter(x=>x.id!==candidate.id).concat(candidate);
    if(!pfValidInvoices(d)){d.transactions=old;return pfError('Esta alteração deixaria uma fatura paga com valor superior ao devido. Desfaça pagamentos antes.');}
    if(original&&obj.type==='income'&&obj.method==='account'&&obj.date<=pfToday&&accBalance(d.accounts.find(a=>a.id===obj.accountId))<0){/* saldos negativos são permitidos: não inventamos bloqueio de despesas */}
  }else if(type==='transfer'){
    if(!pfValidDate(obj.date)||obj.date>pfToday)return pfError('Use uma data válida até hoje.');
    if(!obj.accountId||!obj.toAccountId||obj.accountId===obj.toAccountId)return pfError('Selecione duas contas diferentes.');
    if(!d.accounts.some(a=>a.id===obj.toAccountId)||!pfCanSubtractFrom(obj.accountId,n))return pfError('Conta de origem inválida ou saldo insuficiente.');
    d.transactions.push({id:uid(),title:'Transferência entre contas',type:'transfer',transferType:'account',amount:pfCents(n)/100,date:obj.date,category:'Transferência',method:'account',accountId:obj.accountId,toAccountId:obj.toAccountId});
  }else if(type==='deposit'||type==='withdraw'){
    const g=d.goals.find(x=>x.id===modalId);if(!g||!d.accounts.some(a=>a.id===obj.accountId))return pfError('Escolha uma meta e uma conta válidas.');
    if(type==='deposit'&&!pfCanSubtractFrom(obj.accountId,n))return pfError('Saldo insuficiente para guardar esse valor.');
    if(type==='withdraw'&&pfCents(g.saved)<pfCents(n))return pfError('O cofrinho não tem saldo suficiente para resgatar.');
    g.saved=pfCents(g.saved+(type==='deposit'?n:-n))/100;
    d.transactions.push({id:uid(),title:(type==='deposit'?'Depósito: ':'Resgate: ')+g.name,type:'transfer',transferType:type==='withdraw'?'goal_withdrawal':'goal_deposit',amount:pfCents(n)/100,date:pfToday,category:'Cofrinho',method:'account',accountId:obj.accountId,goalId:g.id});
  }else if(type==='cardpay'){
    const [cardId,ym]=modalId.split('|'),card=d.cards.find(c=>c.id===cardId),bill=card&&pfInvoice(card,ym);
    if(!bill||pfCents(n)>pfCents(bill.remaining))return pfError('O valor excede o saldo da fatura.');
    if(!pfValidDate(obj.date)||obj.date>pfToday)return pfError('Pagamento deve ter data válida até hoje.');
    if(!pfCanSubtractFrom(obj.accountId,n))return pfError('Conta sem saldo suficiente para o pagamento.');
    d.transactions.push({id:uid(),title:`Fatura ${card.name} (${monthLabel(ym)})`,type:'card_payment',amount:pfCents(n)/100,date:obj.date,billMonth:ym,category:'Cartão',method:'account',accountId:obj.accountId,cardId});
  }else if(type==='card'||type==='card-edit'){
    const closing=Number(obj.closing),due=Number(obj.due),limit=Number(obj.limit);
    if(!obj.name?.trim()||!Number.isFinite(limit)||limit<=0||![closing,due].every(x=>Number.isInteger(x)&&x>=1&&x<=28))return pfError('Confira o nome, o limite e os dias (1 a 28).');
    const existing=type==='card-edit'?d.cards.find(c=>c.id===modalId):null;if(type==='card-edit'&&!existing)return pfError('Cartão não encontrado.');
    if(existing){const before={...existing};Object.assign(existing,{name:obj.name.trim(),limit,closing,due});if(!pfValidInvoices(d)){Object.assign(existing,before);return pfError('Alteração incompatível com faturas já pagas. Desfaça os pagamentos ou mantenha o fechamento.');}}
    else d.cards.push({id:uid(),name:obj.name.trim(),limit,closing,due});
  }else if(type==='fixed'||type==='fixed-edit'){
    const day=Number(obj.day);if(!obj.name?.trim()||!Number.isInteger(day)||day<1||day>28||!d.accounts.some(a=>a.id===obj.accountId))return pfError('Confira descrição, conta e vencimento de 1 a 28.');
    const existing=type==='fixed-edit'?d.fixed.find(f=>f.id===modalId):null;if(type==='fixed-edit'&&!existing)return pfError('Gasto não encontrado.');
    const values={name:obj.name.trim().slice(0,100),amount:pfCents(n)/100,day,category:obj.category,accountId:obj.accountId};
    if(existing)Object.assign(existing,values);else d.fixed.push({id:uid(),...values,paid:{}});
  }else if(type==='budget'){
    d.budgetMonths=d.budgetMonths||{};d.budgetMonths[month]=d.budgetMonths[month]||{};d.budgetMonths[month][obj.category]=pfCents(n)/100;
  }
  pfMessage('Registro salvo.');
};

deleteTransaction=function(id){const d=D(),t=d.transactions.find(x=>x.id===id);if(!t)return;if(!confirm(`Excluir “${t.title}”?`))return;
  const former=d.transactions;d.transactions=former.filter(x=>x.id!==id);
  if(!pfValidInvoices(d)){d.transactions=former;return pfError('Não é possível excluir essa compra: existe pagamento de fatura vinculado. Exclua primeiro o pagamento.');}
  if(t.type==='transfer'&&t.goalId){const g=d.goals.find(g=>g.id===t.goalId);if(g){const delta=t.transferType==='goal_withdrawal'?Number(t.amount):-Number(t.amount);const newSaved=pfCents(g.saved+delta)/100;if(newSaved<0){d.transactions=former;return pfError('Resgate não pode ser excluído: o saldo já foi utilizado.');}g.saved=newSaved;}}
  if(t.fixedId){const f=d.fixed.find(f=>f.id===t.fixedId);if(f)for(const [ym,tid] of Object.entries(f.paid||{}))if(tid===id)delete f.paid[ym];}
  pfMessage('Lançamento excluído.');
};

toggleFixed=function(id){const f=D().fixed.find(x=>x.id===id);if(!f)return;f.paid=f.paid||{};
  if(f.paid[month]){const txId=f.paid[month];D().transactions=D().transactions.filter(t=>t.id!==txId);delete f.paid[month];return pfMessage('Pagamento desfeito.');}
  if(month>currentMonth)return pfError('Não é possível marcar um pagamento de mês futuro como realizado.');
  const date=month===currentMonth?pfToday:isoDate(f.day,month),tid=uid();
  D().transactions.push({id:tid,title:f.name,type:'expense',amount:f.amount,category:f.category,date,method:'account',accountId:f.accountId,fixedId:f.id});f.paid[month]=tid;
  pfMessage('Pagamento registrado.');
};
exportCSV=function(){const columns=['Data','Descrição','Tipo','Categoria','Valor','Conta','Cartão','Parcelas','Fatura','Conta destino'];const rows=[columns,...D().transactions.map(t=>[t.date,t.title,t.type,t.category,t.amount,t.accountId||'',t.cardId||'',t.installments||'',t.billMonth||'',t.toAccountId||''])];const csv='\ufeff'+rows.map(r=>r.map(v=>'"'+String(v??'').replace(/"/g,'""')+'"').join(';')).join('\r\n');download('pulso-lancamentos-'+scope+'.csv',csv,'text/csv;charset=utf-8');notify('CSV exportado.');};

// Use the same database and storage key to preserve the user's existing records.
const pfStyle=document.createElement('style');pfStyle.textContent=`.toolbar-actions{display:flex;gap:8px;flex-wrap:wrap}.mobile-entries{display:none}.mobile-entry{border:1px solid var(--line);border-radius:12px;padding:13px;margin:10px 0;background:var(--surface-2);font-size:12px}.mobile-head{display:flex;justify-content:space-between;gap:12px;align-items:start;margin-bottom:8px}.mobile-head b:last-child{white-space:nowrap}.mobile-actions{display:flex;gap:8px;margin-top:10px}@media(max-width:680px){.mobile-entries{display:block}.desktop-entries{display:none}.toolbar-actions{width:100%}.toolbar-actions .btn{flex:1}}`;document.head.appendChild(pfStyle);
render();

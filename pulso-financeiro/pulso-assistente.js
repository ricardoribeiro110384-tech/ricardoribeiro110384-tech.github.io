/* Pulso Financeiro — Assistente 2.0
   Analise local: sem chamadas de rede, sem chaves, sem IA remota.
   Todas as respostas derivam somente dos dados do perfil e periodo selecionados. */
(function(){
"use strict";
const conversations={pessoal:[],empresa:[]};
const suggestions=[
 "Faça um diagnóstico do meu mês",
 "Onde mais gastei?",
 "Como estão minhas faturas?",
 "O que está vencido?",
 "Compare com o mês anterior",
 "Ultrapassei algum orçamento?",
 "Onde posso economizar?",
 "Como estão minhas metas?"
];
function normalize(v){return String(v||"").normalize("NFD").replace(/[\u0300-\u036f]/g,"").toLowerCase().replace(/\s+/g," ").trim()}
function number(v){const n=Number(v);return Number.isFinite(n)?n:0}
function money(v){return fmt(number(v))}
function amount(arr){return sum(arr,x=>number(x.amount))}
function monthName(ym){return monthLabel(ym)}
function period(q){return /mes passado|mes anterior|ultimo mes|mes retrasado/.test(q)?pfShiftMonth(month,/retrasado/.test(q)?-2:-1):month}
function state(ym){
 const ts=D().transactions.filter(t=>typeof t.date==="string"&&t.date.slice(0,7)===ym);
 const incomes=ts.filter(t=>t.type==="income"), expenses=ts.filter(t=>t.type==="expense");
 const income=amount(incomes),out=amount(expenses),cats={};
 expenses.forEach(t=>{const k=t.category||"Outros";cats[k]=(cats[k]||0)+number(t.amount)});
 const rank=Object.entries(cats).sort((a,b)=>b[1]-a[1]);
 const fixed=D().fixed||[], pending=fixed.filter(f=>!f.paid?.[ym]).map(f=>({...f,dueDate:isoDate(Number(f.day)||1,ym)}));
 const overdue=pending.filter(f=>f.dueDate<pfToday);
 const budgets={...D().budgets,...(D().budgetMonths?.[ym]||{})};
 const budgetRows=Object.entries(budgets).map(([category,limit])=>({category,limit:number(limit),used:number(cats[category]||0)}));
 const cards=(D().cards||[]).map(c=>({card:c,bill:pfInvoice(c,ym),debt:pfCardOutstanding(c)}));
 return {ym,ts,incomes,expenses,income,out,result:income-out,rank,pending,overdue,budgetRows,cards};
}
function topRows(s,n){return s.rank.slice(0,n).map(([name,val],i)=>(i+1)+". "+name+": "+money(val)).join("\n")}
function coverage(s){return s.ts.length===0?"Não há lançamentos cadastrados para "+monthName(s.ym)+". Sem dados suficientes, não é possível avaliar o mês.":"Os números consideram apenas os registros cadastrados; não há conexão com bancos."}
function highestItems(s){return [...s.expenses].sort((a,b)=>number(b.amount)-number(a.amount)).slice(0,5).map((t,i)=>(i+1)+". "+t.title+" ("+dateBR(t.date)+"): "+money(t.amount)).join("\n")}
function budgetDetail(s,cat){
 const b=s.budgetRows.find(x=>normalize(x.category)===normalize(cat));
 if(!b)return "Não encontrei orçamento definido para "+cat+" em "+monthName(s.ym)+". Cadastre um limite em Orçamento para acompanhar essa categoria.";
 return "Orçamento de "+cat+" em "+monthName(s.ym)+": limite "+money(b.limit)+", despesas "+money(b.used)+". "+(b.used>b.limit?"Limite ultrapassado em "+money(b.used-b.limit)+".":"Restam "+money(Math.max(0,b.limit-b.used))+" no limite previsto.");
}
function budgetSummary(s){
 if(!s.budgetRows.length)return "Não há limites de orçamento definidos. Cadastre limites nas categorias que deseja controlar.";
 const exceeded=s.budgetRows.filter(x=>x.used>x.limit).sort((a,b)=>(b.used-b.limit)-(a.used-a.limit));
 const near=s.budgetRows.filter(x=>x.limit>0&&x.used<=x.limit&&x.used/x.limit>=.8).sort((a,b)=>b.used/b.limit-a.used/a.limit);
 if(!exceeded.length&&!near.length)return "Nenhum dos "+s.budgetRows.length+" limites cadastrados foi ultrapassado em "+monthName(s.ym)+". Isso não cobre despesas de categorias sem orçamento.";
 let out=[];
 if(exceeded.length)out.push("Acima do orçamento:\n"+exceeded.map(x=>"• "+x.category+": "+money(x.used)+" de "+money(x.limit)+" (excesso "+money(x.used-x.limit)+")").join("\n"));
 if(near.length)out.push("Próximo do limite:\n"+near.map(x=>"• "+x.category+": "+Math.round(x.used/x.limit*100)+"% utilizado").join("\n"));
 return out.join("\n\n")+"\n\nConfira lançamentos e limites antes de ajustar o planejamento.";
}
function fixedSummary(s,overdueOnly){
 const arr=(overdueOnly?s.overdue:s.pending).slice().sort((a,b)=>a.dueDate.localeCompare(b.dueDate));
 if(!arr.length)return overdueOnly?"Nenhum gasto fixo cadastrado está vencido e sem pagamento no mês selecionado.":"Não há gastos fixos cadastrados como pendentes em "+monthName(s.ym)+".";
 return (overdueOnly?"Vencidos":"Pendentes")+" em "+monthName(s.ym)+": "+arr.length+" compromisso(s), "+money(amount(arr))+".\n"+
 arr.slice(0,8).map(f=>"• "+dateBR(f.dueDate)+" — "+f.name+": "+money(f.amount)+(f.dueDate<pfToday?" (vencido)":"")).join("\n")+
 (arr.length>8?"\n... e mais "+(arr.length-8)+".":"")+
 "\n\nA situação é baseada nos pagamentos marcados no aplicativo.";
}
function cardSummary(s,q){
 if(!s.cards.length)return "Não há cartões cadastrados neste perfil.";
 let cards=s.cards;
 const matched=cards.find(x=>normalize(q).includes(normalize(x.card.name)));
 if(matched)cards=[matched];
 const total=sum(cards,x=>x.bill.remaining),debt=sum(cards,x=>x.debt);
 let lines=cards.map(x=>"• "+x.card.name+": fatura de "+monthName(s.ym)+" "+money(x.bill.total)+", pago "+money(x.bill.paid)+", restante "+money(x.bill.remaining)+", vence "+dateBR(x.bill.due)+(x.bill.remaining>0&&x.bill.due<pfToday?" (vencida)":""));
 return "Faturas de "+monthName(s.ym)+":\n"+lines.join("\n")+"\n\nTotal ainda a pagar nessas faturas: "+money(total)+". Dívida registrada nos cartões"+(matched?" selecionados":"")+" (inclui parcelas futuras): "+money(debt)+".\n\nO valor é uma estimativa dos lançamentos, sem juros, taxas ou conciliação bancária.";
}
function accountSummary(q){
 const accounts=D().accounts||[];
 const chosen=accounts.find(a=>normalize(q).includes(normalize(a.name)));
 if(chosen)return "Saldo calculado da conta "+chosen.name+": "+money(accBalance(chosen))+". São considerados apenas os movimentos cadastrados até hoje.";
 if(!accounts.length)return "Nenhuma conta foi cadastrada neste perfil.";
 return "Saldo calculado nas contas: "+money(accTotal())+".\n"+accounts.map(a=>"• "+a.name+": "+money(accBalance(a))).join("\n")+
 "\nCofrinhos: "+money(allGoals())+". Dívidas de cartões: "+money(sum(D().cards||[],pfCardOutstanding))+
 ".\nO saldo não considera movimentos bancários que não foram registrados.";
}
function goalsSummary(){
 const goals=D().goals||[];
 if(!goals.length)return "Você ainda não cadastrou cofrinhos ou metas.";
 return "Metas cadastradas: "+goals.length+". Guardado: "+money(allGoals())+".\n"+
 goals.map(g=>"• "+g.name+": "+money(g.saved)+" de "+money(g.target)+" ("+pct(g.saved,g.target)+"%); faltam "+money(Math.max(0,number(g.target)-number(g.saved)))).join("\n")+
 "\n\nValores registrados no aplicativo; não representam saldo de uma instituição financeira.";
}
function previousSummary(s){
 const prior=state(pfShiftMonth(s.ym,-1));
 if(!s.ts.length||!prior.ts.length)return "Não há lançamentos suficientes nos dois meses para comparar "+monthName(s.ym)+" com "+monthName(prior.ym)+". Registre dados de ambos os períodos.";
 const change=s.out-prior.out;
 const label=change>0?"aumentaram":change<0?"diminuíram":"ficaram iguais";
 const percent=prior.out>0?" ("+Math.abs(change/prior.out*100).toFixed(1).replace(".",",")+"%)":"";
 return "Comparativo: "+monthName(prior.ym)+" → "+monthName(s.ym)+".\n"+
 "Receitas: "+money(prior.income)+" → "+money(s.income)+".\n"+
 "Despesas: "+money(prior.out)+" → "+money(s.out)+".\n"+
 "Resultado: "+money(prior.result)+" → "+money(s.result)+".\n"+
 "As despesas "+label+" em "+money(Math.abs(change))+percent+".\n"+
 "Atenção: um mês ainda em andamento pode parecer artificialmente menor.";
}
function savings(s){
 if(!s.ts.length)return coverage(s);
 const discretionary=["Lazer","Compras","Assinaturas","Alimentação","Transporte","Outros"];
 const options=s.rank.filter(([cat,v])=>discretionary.includes(cat)&&v>0);
 if(!options.length)return "Ainda não há gastos nas categorias com margem mais comum para ajustes. Analise os lançamentos individualmente antes de definir uma meta de economia.";
 const [cat,val]=options[0],saving=Math.round(val*10)/10;
 return "Uma hipótese para testar: reduzir em 10% os gastos de "+cat+" ("+money(val)+") representaria aproximadamente "+money(saving)+" por mês.\n"+
 "Comece revisando os maiores lançamentos dessa categoria. Isso é uma simulação, não uma economia garantida, e não significa cortar despesas essenciais.\n"+
 "Resultado atual registrado: "+money(s.result)+".";
}
function diagnose(s){
 if(!s.ts.length)return coverage(s);
 const lines=["Diagnóstico de "+monthName(s.ym)+" ("+(scope==="pessoal"?"pessoal":"empresa")+"):",
 "• Receitas: "+money(s.income),
 "• Despesas: "+money(s.out),
 "• Resultado dos lançamentos: "+money(s.result),
 "• Saldo atual nas contas: "+money(accTotal())];
 if(s.rank.length)lines.push("• Maior categoria: "+s.rank[0][0]+" ("+money(s.rank[0][1])+")");
 const over=s.budgetRows.filter(b=>b.used>b.limit);
 if(over.length)lines.push("• Orçamentos ultrapassados: "+over.map(x=>x.category).join(", "));
 if(s.overdue.length)lines.push("• Gastos fixos vencidos: "+s.overdue.length+" ("+money(amount(s.overdue))+")");
 else if(s.pending.length)lines.push("• Gastos fixos pendentes: "+s.pending.length+" ("+money(amount(s.pending))+")");
 const due=sum(s.cards,x=>x.bill.remaining);if(due>0)lines.push("• Faturas não quitadas no período: "+money(due));
 if(s.result<0)lines.push("\nPrioridade: revisar as maiores despesas e registrar receitas faltantes antes de assumir novos compromissos.");
 else if(over.length)lines.push("\nPrioridade: verificar as categorias acima do orçamento.");
 else if(s.overdue.length)lines.push("\nPrioridade: conferir e regularizar os vencimentos.");
 else lines.push("\nPrioridade: acompanhar gastos e manter as categorias completas.");
 lines.push("\nReceitas e despesas incluem a compra inteira no crédito, enquanto a fatura afeta o caixa no pagamento. O resultado não é o saldo bancário.");
 return lines.join("\n");
}
function parseCategory(q){
 const options=(typeof CATEGORIES!=="undefined"?CATEGORIES:[]).slice().sort((a,b)=>b.length-a.length);
 const aliases={"mercado":"Alimentação","supermercado":"Alimentação","comida":"Alimentação","alimentacao":"Alimentação","combustivel":"Transporte","gasolina":"Transporte","uber":"Transporte","transporte":"Transporte","aluguel":"Moradia","moradia":"Moradia","restaurante":"Lazer","farmacia":"Saúde","saude":"Saúde","educacao":"Educação","lazer":"Lazer","assinatura":"Assinaturas"};
 const pairs=[...options.map(c=>[normalize(c),c]),...Object.entries(aliases)];
 const match=pairs.find(([term])=>new RegExp("(^|[^a-z])"+term+"([^a-z]|$)").test(q));
 return match?match[1]:null;
}
function answer(question){
 const q=normalize(question).slice(0,300),s=state(period(q));
 if(!q)return "Escreva uma pergunta sobre os seus registros financeiros.";
 if(/(apague|exclua|delete|transfira|registre|crie uma|pague por mim|faca um pagamento)/.test(q))return "Posso analisar e explicar os dados, mas não altero registros nem faço pagamentos pelo chat. Use Lançamentos, Gastos fixos, Cartões ou Cofrinhos para executar uma operação.";
 if(/(compar|evolu|versus|diferenca entre meses|aumentou|diminuiu)/.test(q))return previousSummary(state(month));
 if(/(diagnostic|resum|analise|saude financ|como estao minhas financ)/.test(q))return diagnose(s);
 if(/(economiz|reduz|cortar|poupar|onde posso melhorar|conselho|recomend)/.test(q))return savings(s);
 if(/(fatura(?!mento)|cartao|parcel|credito|limite do cartao)/.test(q))return cardSummary(s,q);
 if(/(vencid|atrasad)/.test(q))return fixedSummary(s,true);
 if(/(fixo|venciment|pendente|contas a pagar|boleto)/.test(q))return fixedSummary(s,false);
 if(/(meta|cofrinh|objetivo|guardar dinheiro)/.test(q))return goalsSummary();
 const cat=parseCategory(q);
 if(/(orcament|limite|planej|quanto posso gastar)/.test(q))return cat?budgetDetail(s,cat):budgetSummary(s);
 if(/(compar|evolu|versus)/.test(q))return previousSummary(state(month));
 if(cat&&/(gast|despes|quanto|total|categoria)/.test(q)){
   const value=number(s.rank.find(x=>normalize(x[0])===normalize(cat))?.[1]);
   return "Gastos registrados em "+cat+" em "+monthName(s.ym)+": "+money(value)+". "+(value?"Esse valor representa "+(s.out?Math.round(value/s.out*100):0)+"% das despesas registradas.":"Não encontrei despesas nessa categoria no período.")+"\n"+coverage(s);
 }
 if(/(maior(es)? (gast|despes)|lancament.*maior|compra.*maior)/.test(q))return s.expenses.length?"Maiores lançamentos de despesa:\n"+highestItems(s):coverage(s);
 if(/(gast|despes|consum|saida|onde gasto)/.test(q)){
  return "Despesas registradas em "+monthName(s.ym)+": "+money(s.out)+"."+(s.rank.length?"\nRanking:\n"+topRows(s,5):"\nNão há despesas cadastradas.")+"\n\n"+coverage(s);
 }
 if(/(receit|entrada|ganho|faturamento|venda|salario)/.test(q))return "Receitas registradas em "+monthName(s.ym)+": "+money(s.income)+". Resultado após despesas: "+money(s.result)+".\n"+coverage(s);
 if(/(sobra|resultado|lucro|deficit|superavit|negativo)/.test(q))return "Resultado dos lançamentos em "+monthName(s.ym)+": "+money(s.result)+" (receitas "+money(s.income)+" − despesas "+money(s.out)+"). Não equivale ao saldo bancário ou ao lucro contábil.";
 if(/(saldo|dinheiro|banco|minha conta|contas)/.test(q))return accountSummary(q);
 return "Não entendi exatamente o que deseja analisar. Posso calcular gastos por categoria, receita e resultado, comparar meses, mostrar faturas, orçamentos, vencimentos e metas.\nExperimente: “Quanto gastei com alimentação?” ou “Faça um diagnóstico do meu mês”.";
}
function priorityCards(s){
 let items=[];
 const over=s.budgetRows.filter(x=>x.used>x.limit).sort((a,b)=>b.used-b.limit-a.used+a.limit);
 if(s.overdue.length)items.push({head:"Vencimentos",value:s.overdue.length+" vencido(s)",body:money(amount(s.overdue))+" em gastos fixos sem baixa"});
 if(over.length)items.push({head:"Orçamento",value:over.length+" categoria(s) acima",body:over.slice(0,2).map(x=>x.category).join(", ")});
 const due=sum(s.cards,x=>x.bill.remaining);if(due>0)items.push({head:"Cartões",value:money(due),body:"Faturas não quitadas do mês"});
 if(s.result<0&&s.ts.length)items.push({head:"Resultado",value:money(s.result),body:"Despesas maiores que receitas"});
 if(!items.length)items.push({head:"Visão do mês",value:s.ts.length?s.rank[0]?.[0]||"Sem despesas":"Sem lançamentos",body:s.ts.length?"Maior categoria ou ponto de acompanhamento":"Cadastre movimentações para gerar alertas"});
 return items.slice(0,3);
}
function history(){return conversations[scope]||(conversations[scope]=[])}
function renderMessages(rows){return rows.map(x=>'<div class="bubble '+(x.from==="me"?"me":"agent")+'">'+esc(x.msg)+'</div>').join("")}
function chip(label){return '<button type="button" onclick="ask(this.textContent)">'+esc(label)+'</button>'}
function summaryPanel(s){
 return priorityCards(s).map(x=>'<div class="insight"><h4>'+esc(x.head)+'</h4><p><strong>'+esc(x.value)+'</strong></p><p>'+esc(x.body)+'</p></div>').join("");
}
answerQuestion=function(question){return answer(question)};
renderAssistant=function(){
 const s=state(month),rows=history();
 if(!rows.length)rows.push({from:"agent",msg:"Olá! Eu analiso seus lançamentos de "+monthName(month)+" e mostro de onde vêm meus cálculos. Selecione Pessoal ou Empresa e escolha o mês no topo. Suas perguntas não saem deste navegador."});
 return demoBanner()+
 '<div class="layout-two"><div class="panel">'+
 '<div class="panel-head"><div><h3>Assistente financeiro</h3><p>Diagnósticos e respostas sobre seus próprios números</p></div><span class="pill">ANÁLISE LOCAL · SEM IA REMOTA</span></div>'+
 '<p class="hint">Perfil: <b>'+esc(scope)+'</b> · Período selecionado: <b>'+esc(monthName(month))+'</b>. As respostas não são acesso bancário nem consultoria profissional.</p>'+
 '<div id="chat" class="chat" aria-live="polite">'+renderMessages(rows)+'</div>'+
 '<div class="chips">'+suggestions.map(chip).join("")+'</div>'+
 '<form class="chat-form" onsubmit="event.preventDefault();ask(document.getElementById(\'chat-input\').value)"><input id="chat-input" class="input-surface" maxlength="300" autocomplete="off" placeholder="Ex.: quanto gastei com alimentação?" aria-label="Pergunte sobre suas finanças" required/><button class="btn btn-primary" type="submit">Enviar</button></form>'+
 '<div style="display:flex;justify-content:space-between;align-items:center;gap:8px;flex-wrap:wrap;margin-top:12px"><small class="text-muted">Não altera dados nem envia perguntas a servidores.</small><button class="little-btn" type="button" onclick="pfAssistantClear()">Limpar conversa</button></div>'+
 '</div><div class="panel"><div class="panel-head"><div><h3>Pontos de atenção</h3><p>Atualizados conforme os lançamentos</p></div></div><div class="stack-list">'+summaryPanel(s)+'</div><p class="hint" style="margin-top:16px">Compras no crédito contam como despesas na compra; faturas pagas só reduzem o saldo da conta. Gastos fixos ainda não pagos são compromissos previstos.</p></div></div>';
};
ask=function(q){
 q=String(q||"").trim().slice(0,300);if(!q)return;
 const rows=history();rows.push({from:"me",msg:q},{from:"agent",msg:answer(q)});
 if(rows.length>42)rows.splice(1,rows.length-42);
 render();const el=document.getElementById("chat");if(el)el.scrollTop=el.scrollHeight;
 const input=document.getElementById("chat-input");if(input)input.focus();
};
window.pfAssistantClear=function(){conversations[scope]=[];if(view==="assistant")render()};
const oldDashboard=renderDashboard;
renderDashboard=function(){
 return oldDashboard()+'<div class="panel" style="margin-top:16px;display:flex;align-items:center;justify-content:space-between;gap:12px;flex-wrap:wrap"><div><h3 style="margin:0 0 5px">Assistente financeiro</h3><p class="hint" style="margin:0">Analise suas despesas, faturas, orçamento e oportunidades de economia.</p></div><button class="btn btn-primary" onclick="navigate(\'assistant\')">✧ Analisar minhas finanças</button></div>';
};
})();
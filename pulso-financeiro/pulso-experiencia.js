/* Pulso: interface e agenda de compromissos, sem mudar os registros existentes. */
(() => {
  'use strict';
  const root = document.documentElement;
  let preference = 'light';
  try { preference = localStorage.getItem('pulso_theme') || 'light'; } catch (_) {}
  const style = document.createElement('style');
  style.textContent = `
    :root[data-pulso-theme=light]{color-scheme:light;--bg:#f5f6f8;--surface:#fff;--surface-2:#f3f4f6;--surface-3:#e9edf2;--line:#e1e5eb;--text:#202631;--muted:#606b7b;--orange:#c84b18;--orange2:#dd6b31;--green:#187a50;--red:#b4373c;--blue:#2865af;--purple:#7550b4;--radius:12px;--shadow:0 2px 10px #24304808}
    [data-pulso-theme=light] .sidebar{background:#c94c20}
    [data-pulso-theme=light] .input-surface,[data-pulso-theme=light] .field input,[data-pulso-theme=light] .field select,[data-pulso-theme=light] .input-surface option,[data-pulso-theme=light] .modal{background:var(--surface);color:var(--text);border-color:var(--line)}
    [data-pulso-theme=light] .btn-primary{background:#c94c20;color:#fff}
    [data-pulso-theme=light] .banner{background:#fff;border-color:var(--line)}
    [data-pulso-theme=light] .pill{color:#934016;background:#fff0e6;border-color:#f1c9b3}
    [data-pulso-theme=light] .gridline{stroke:#d5dbe3}
    [data-pulso-theme=light] .bar{background:#e8ebef}
    [data-pulso-theme=light] .data-table td{border-color:var(--line)}
    [data-pulso-theme=light] .category-tag,[data-pulso-theme=light] .field label{color:var(--muted);border-color:var(--line)}
    [data-pulso-theme=light] .alert{color:#853c13;background:#fff4ea;border-color:#f2d0b6}
    [data-pulso-theme=light] .insight{background:#ecf8f1;border-color:#c4e2d0}
    [data-pulso-theme=light] .insight h4,[data-pulso-theme=light] .insight p{color:#285340}
    [data-pulso-theme=light] .chat,[data-pulso-theme=light] .bubble.agent,[data-pulso-theme=light] .chips button,[data-pulso-theme=light] .close{background:#eef1f5;color:var(--text)}
    .sidebar{overflow-y:auto}.main{max-width:1600px}.stat,.panel,.item-card{box-shadow:var(--shadow)}.stat strong{font-variant-numeric:tabular-nums;white-space:normal;overflow-wrap:anywhere}
    .pf-agenda{margin:20px 0}.pf-agenda .panel-head{margin-bottom:12px}.pf-agenda-grid{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:9px;margin-bottom:15px}.pf-agenda-grid button{background:var(--surface-2);color:var(--text);border:1px solid var(--line);border-radius:10px;padding:12px;text-align:left;min-width:0}.pf-agenda-grid button[aria-pressed=true]{border:2px solid var(--orange);padding:11px}.pf-agenda-grid small{display:block;color:var(--muted);font-size:11px}.pf-agenda-grid strong{display:block;font-size:15px;margin-top:6px}.pf-agenda-row{display:flex;justify-content:space-between;gap:12px;padding:12px 0;border-top:1px solid var(--line);font-size:13px}.pf-agenda-row small{display:block;color:var(--muted);margin-top:4px}.pf-mobile-nav{display:none}
    @media(max-width:680px){.main{padding-bottom:100px}.topbar{gap:10px}.top-actions{display:grid;grid-template-columns:minmax(0,1fr) minmax(0,1fr);gap:8px}.top-actions>.btn-primary{grid-column:1/-1}.top-actions>.input-surface{width:100%}.stat-grid{grid-template-columns:repeat(2,minmax(0,1fr))}.stat strong{font-size:16px}.pf-agenda-grid{grid-template-columns:repeat(2,minmax(0,1fr))}.pf-mobile-nav{display:flex;position:fixed;bottom:0;left:0;right:0;z-index:35;background:var(--surface);border-top:1px solid var(--line);padding:7px 6px calc(7px + env(safe-area-inset-bottom));justify-content:space-around;gap:3px}.pf-mobile-nav button{flex:1;min-width:0;padding:6px 2px;color:var(--muted);border:0;border-radius:8px;background:transparent;font-size:10px;font-weight:650;min-height:44px}.pf-mobile-nav button span{display:block;font-size:20px;margin-bottom:2px}.pf-mobile-nav button[aria-current=page]{color:var(--orange);background:var(--surface-2)}.toast{bottom:85px}.topbar .pf-theme{margin-left:auto}}
  `;
  document.head.append(style);
  root.dataset.pulsoTheme = preference === 'dark' ? 'dark' : 'light';
  const theme = document.createElement('button');
  theme.className = 'btn pf-theme'; theme.type = 'button';
  function labelTheme(){theme.textContent = root.dataset.pulsoTheme === 'light' ? '☾ Escuro' : '☀ Claro';}
  labelTheme();
  theme.addEventListener('click', () => {root.dataset.pulsoTheme = root.dataset.pulsoTheme === 'light' ? 'dark' : 'light'; try{localStorage.setItem('pulso_theme',root.dataset.pulsoTheme)}catch(_){} labelTheme();});
  document.querySelector('.topbar').append(theme);
  const mobile = document.createElement('nav');
  mobile.className = 'pf-mobile-nav'; mobile.setAttribute('aria-label','Navegação rápida');
  const shortcuts = [['dashboard','▤','Início'],['transactions','↕','Movimentos'],['fixed','◷','Contas'],['cards','▱','Cartões'],['menu','☰','Mais']];
  shortcuts.forEach(([id,icon,label])=>{const b=document.createElement('button');b.type='button';b.dataset.view=id;b.innerHTML=`<span aria-hidden="true">${icon}</span>${label}`;b.addEventListener('click',()=>id==='menu'?setMenu(true):navigate(id));mobile.append(b)});
  document.body.append(mobile);
  let windowDays = '7';
  const dateKey = date => `${date.getFullYear()}-${String(date.getMonth()+1).padStart(2,'0')}-${String(date.getDate()).padStart(2,'0')}`;
  function agendaItems(){const now=new Date();now.setHours(0,0,0,0);const until=new Date(now);until.setDate(until.getDate()+30);const end=dateKey(until),periods=[];for(let cursor=new Date(now.getFullYear(),now.getMonth(),1);cursor<=until;cursor.setMonth(cursor.getMonth()+1))periods.push(localMonth(cursor));return periods.flatMap(ym=>D().fixed.filter(f=>!f.paid?.[ym]).map(f=>({...f,dueDate:isoDate(f.day,ym)}))).filter(f=>f.dueDate<=end).sort((a,b)=>a.dueDate.localeCompare(b.dueDate));}
  function filterAgenda(items,days){const limit=new Date();limit.setDate(limit.getDate()+Number(days||0));const today=dateKey(new Date());return items.filter(f=>days==='late'?f.dueDate<today:f.dueDate>=today&&f.dueDate<=dateKey(limit));}
  function agenda(){const items=agendaItems();const options=[['late','Vencidas'],['7','Até 7 dias'],['15','Até 15 dias'],['30','Até 30 dias']];const chosen=filterAgenda(items,windowDays);return `<section class="panel pf-agenda"><div class="panel-head"><div><h3>Agenda de contas a pagar</h3><p>Compromissos recorrentes previstos · a partir de hoje</p></div><button class="little-btn" onclick="openModal('fixed')">＋ Conta</button></div><div class="pf-agenda-grid">${options.map(([id,label])=>`<button type="button" aria-pressed="${id===windowDays}" onclick="window.pulsoAgenda('${id}')"><small>${label}</small><strong>${fmt(sum(filterAgenda(items,id),f=>Number(f.amount)))}</strong></button>`).join('')}</div>${chosen.length?chosen.map(f=>`<div class="pf-agenda-row"><div><b>${esc(f.name)}</b><small>${dateBR(f.dueDate)} · ${esc(f.category||'Outros')}</small></div><b>${fmt(f.amount)}</b></div>`).join(''):`<p class="hint">Nenhuma conta recorrente neste período.</p>`}</section>`;}
  window.pulsoAgenda = id => {windowDays=id;render();};
  const oldRender = render;
  render = function(){oldRender();mobile.querySelectorAll('button').forEach(b=>b.dataset.view===view?b.setAttribute('aria-current','page'):b.removeAttribute('aria-current'));if(view==='dashboard'||view==='fixed'){const grid=document.querySelector('#content .stat-grid');if(grid)grid.insertAdjacentHTML('afterend',agenda());}};
  render();
})();

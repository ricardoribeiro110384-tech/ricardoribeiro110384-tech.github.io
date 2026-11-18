(() => {
  const STORAGE_KEY = 'plano-financeiro-v1';
  const defaults = {
    salary: 3000,
    percentages: { essenciais: 50, lazer: 30, futuro: 20 },
    monthlyYield: 1.08,
    desiredPassiveIncome: 3000,
    reserveSaved: 0,
    capitalSaved: 0,
    entries: []
  };
  let state = loadState();
  let selectedMonth = currentMonthKey();
  let toastTimer;
  const $ = (selector, root = document) => root.querySelector(selector);
  const $$ = (selector, root = document) => [...root.querySelectorAll(selector)];
  const money = value => new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(Number(value) || 0);
  const round = value => Math.round((Number(value) + Number.EPSILON) * 100) / 100;
  const escapeHtml = value => String(value).replace(/[&<>"']/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[char]);
  function currentMonthKey() {
    const now = new Date();
    return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
  }
  const getMonthKey = date => String(date || '').slice(0, 7);
  const readNumber = selector => Math.max(0, Number($(selector)?.value) || 0);

  function loadState() {
    try {
      const saved = JSON.parse(localStorage.getItem(STORAGE_KEY) || 'null');
      if (!saved || typeof saved !== 'object') return structuredClone(defaults);
      return {
        ...structuredClone(defaults), ...saved,
        percentages: { ...defaults.percentages, ...(saved.percentages || {}) },
        entries: Array.isArray(saved.entries) ? saved.entries.filter(entry => entry && typeof entry === 'object' && entry.id) : []
      };
    } catch { return structuredClone(defaults); }
  }

  function persist() {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  }

  function showToast(message, isError = false) {
    const toast = $('#toast');
    toast.textContent = message;
    toast.classList.toggle('error', isError);
    toast.classList.add('show');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => toast.classList.remove('show'), 2500);
  }

  function monthName(key) {
    const [year, month] = key.split('-').map(Number);
    return new Intl.DateTimeFormat('pt-BR', { month: 'long', year: 'numeric' }).format(new Date(year, month - 1, 1));
  }

  function setupMonthFilter() {
    const select = $('#monthFilter');
    const now = new Date();
    const months = [];
    for (let index = 0; index < 12; index++) {
      const date = new Date(now.getFullYear(), now.getMonth() - index, 1);
      months.push(`${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`);
    }
    select.innerHTML = months.map(key => `<option value="${key}">${escapeHtml(monthName(key))}</option>`).join('');
    select.value = selectedMonth;
    select.addEventListener('change', () => { selectedMonth = select.value; render(); });
  }

  function monthEntries() {
    return state.entries.filter(entry => getMonthKey(entry.date) === selectedMonth).sort((a, b) => (b.date || '').localeCompare(a.date || '') || (b.createdAt || 0) - (a.createdAt || 0));
  }

  function amountsForMonth(entries) {
    return entries.reduce((sum, entry) => {
      const amount = Number(entry.amount) || 0;
      if (entry.type === 'entrada') sum.entries += amount;
      else {
        sum.expenses += amount;
        if (entry.category === 'futuro') sum.future += amount;
      }
      return sum;
    }, { entries: 0, expenses: 0, future: 0 });
  }

  function progressPercent(current, target) {
    return target > 0 ? Math.min(100, Math.max(0, current / target * 100)) : 0;
  }

  function setProgress(id, value) {
    const el = $(id);
    if (el) el.style.width = `${value}%`;
  }

  function render() {
    const entries = monthEntries();
    const totals = amountsForMonth(entries);
    const salary = Number(state.salary) || 0;
    const reserveTarget = salary * 6;
    const yieldRate = (Number(state.monthlyYield) || 0) / 100;
    const passiveTarget = yieldRate > 0 ? Number(state.desiredPassiveIncome || salary) / yieldRate : 0;
    $('#incomeValue').textContent = money(salary);
    $('#budgetIncome').textContent = money(salary);
    $('#spentValue').textContent = money(totals.expenses);
    $('#futureSavedValue').textContent = money(totals.future);
    $('#futurePercentText').textContent = `${state.percentages.futuro}% da sua renda mensal`;
    const remaining = salary - totals.expenses;
    $('#remainingText').textContent = totals.expenses === 0 ? 'Comece adicionando um lançamento' : remaining >= 0 ? `${money(remaining)} ainda não registrados em despesas` : `${money(Math.abs(remaining))} acima da renda mensal base`;
    $('#launchIncome').textContent = money(salary);
    $('#launchExpenses').textContent = money(totals.expenses);
    $('#launchEntries').textContent = money(totals.entries);
    renderBudget(entries, totals, salary);
    renderGoalSummaries(reserveTarget, passiveTarget);
    renderRecent(entries);
    renderTransactions(entries);
    renderGoals(reserveTarget, passiveTarget, yieldRate);
    renderSettings();
  }

  function renderBudget(entries, totals, salary) {
    const names = [
      { key: 'essenciais', label: 'Essenciais', icon: '⌂', fill: 'fixed-fill' },
      { key: 'lazer', label: 'Lazer e escolhas', icon: '✳', fill: 'leisure-fill' },
      { key: 'futuro', label: 'Futuro', icon: '↗', fill: 'future-fill' }
    ];
    $('#budgetList').innerHTML = names.map(item => {
      const target = salary * (Number(state.percentages[item.key]) || 0) / 100;
      const used = entries.filter(entry => entry.type === 'despesa' && entry.category === item.key).reduce((sum, entry) => sum + Number(entry.amount || 0), 0);
      const percentage = target > 0 ? Math.min(100, used / target * 100) : used > 0 ? 100 : 0;
      return `<div class="budget-row"><div class="budget-row-top"><div class="budget-name"><span class="legend-dot ${item.fill.replace('-fill', '')}"></span>${item.label}</div><div class="budget-amount">${money(target)}</div></div><div class="budget-used">${money(used)} usados · ${state.percentages[item.key]}% da renda</div><div class="budget-track"><span class="${item.fill}" style="width:${percentage}%"></span></div></div>`;
    }).join('');
  }

  function renderGoalSummaries(reserveTarget, passiveTarget) {
    const reservePct = progressPercent(state.reserveSaved, reserveTarget);
    const passivePct = progressPercent(state.capitalSaved, passiveTarget);
    $('#reserveProgress').style.width = `${reservePct}%`;
    $('#reserveProgressText').textContent = `${Math.round(reservePct)}%`;
    $('#reserveCaption').textContent = `${money(state.reserveSaved)} de ${money(reserveTarget)} · 6 meses da renda`;
    $('#passiveProgress').style.width = `${passivePct}%`;
    $('#passiveProgressText').textContent = `${Math.round(passivePct)}%`;
    $('#passiveCaption').textContent = `${money(state.capitalSaved)} de patrimônio registrado`;
  }

  function renderRecent(entries) {
    const recent = entries.slice(0, 4);
    if (!recent.length) {
      $('#recentList').innerHTML = '<div class="empty-recent">Seus lançamentos aparecerão aqui.</div>';
      return;
    }
    $('#recentList').innerHTML = recent.map(entry => {
      const positive = entry.type === 'entrada';
      const category = categoryLabel(entry.category);
      return `<div class="recent-row"><div class="transaction-icon ${positive ? 'positive' : ''}">${positive ? '＋' : categoryIcon(entry.category)}</div><div><div class="recent-name">${escapeHtml(entry.description)}</div><div class="recent-meta">${escapeHtml(category)} · ${formatDate(entry.date)}</div></div><div class="recent-value ${positive ? 'positive' : ''}">${positive ? '+' : '−'} ${money(entry.amount)}</div></div>`;
    }).join('');
  }

  function renderTransactions(entries) {
    const typeFilter = $('#typeFilter').value;
    const categoryFilter = $('#categoryFilter').value;
    const filtered = entries.filter(entry => (typeFilter === 'todos' || entry.type === typeFilter) && (categoryFilter === 'todas' || entry.category === categoryFilter));
    $('#transactionRows').innerHTML = filtered.length ? filtered.map(entry => {
      const positive = entry.type === 'entrada';
      const category = categoryLabel(entry.category);
      return `<tr><td><div class="table-description"><span class="transaction-icon ${positive ? 'positive' : ''}">${positive ? '＋' : categoryIcon(entry.category)}</span>${escapeHtml(entry.description)}</div></td><td><span class="category-chip ${entry.category}">${escapeHtml(category)}</span></td><td>${formatDate(entry.date)}</td><td class="${positive ? 'money-positive' : 'money-negative'}">${positive ? '+' : '−'} ${money(entry.amount)}</td><td><button class="delete-row" data-delete="${escapeHtml(entry.id)}" aria-label="Excluir ${escapeHtml(entry.description)}" title="Excluir lançamento">×</button></td></tr>`;
    }).join('') : '<tr class="no-data"><td colspan="5">Nenhum lançamento encontrado neste filtro.</td></tr>';
    const empty = entries.length === 0;
    $('#emptyTransactions').style.display = empty ? 'block' : 'none';
    $('.table-scroll').style.display = empty ? 'none' : 'block';
  }

  function renderGoals(reserveTarget, passiveTarget, yieldRate) {
    const reservePct = progressPercent(state.reserveSaved, reserveTarget);
    const passivePct = progressPercent(state.capitalSaved, passiveTarget);
    $('#reserveSavedFull').textContent = money(state.reserveSaved);
    $('#reserveTargetFull').textContent = money(reserveTarget);
    $('#reserveCaption').textContent = `${money(state.reserveSaved)} de ${money(reserveTarget)} · 6 meses da renda`;
    $('#reserveProgressFull').style.width = `${reservePct}%`;
    $('#reservePercentFull').textContent = `${Math.round(reservePct)}% concluído`;
    $('#reserveLeft').textContent = reservePct >= 100 ? 'Meta concluída! 🎉' : `Faltam ${money(Math.max(0, reserveTarget - state.reserveSaved))}`;
    $('#passiveCapitalValue').textContent = passiveTarget > 0 ? money(passiveTarget) : 'Informe uma taxa válida';
    $('#passiveMath').textContent = yieldRate > 0 ? `${money(state.desiredPassiveIncome)} por mês ÷ ${(yieldRate * 100).toLocaleString('pt-BR', { maximumFractionDigits: 2 })}% ao mês` : 'Taxa mensal precisa ser maior que zero';
    $('#capitalSavedFull').textContent = money(state.capitalSaved);
    $('#passiveIncomeFull').textContent = money(state.desiredPassiveIncome);
    $('#passiveProgressFull').style.width = `${passivePct}%`;
    $('#passivePercentFull').textContent = `${Math.round(passivePct)}% concluído`;
    $('#capitalLeft').textContent = passivePct >= 100 ? 'Meta alcançada! 🎉' : `Faltam ${money(Math.max(0, passiveTarget - state.capitalSaved))}`;
    $('#reserveInput').value = state.reserveSaved || '';
    $('#capitalInput').value = state.capitalSaved || '';
  }

  function renderSettings() {
    $('#salarySetting').value = state.salary;
    $('#fixedSetting').value = state.percentages.essenciais;
    $('#leisureSetting').value = state.percentages.lazer;
    $('#futureSetting').value = state.percentages.futuro;
    $('#yieldSetting').value = state.monthlyYield;
    const total = Number(state.percentages.essenciais) + Number(state.percentages.lazer) + Number(state.percentages.futuro);
    $('#percentMessage').textContent = `Total: ${total}%`;
    $('#percentMessage').classList.toggle('invalid', total !== 100);
  }

  function categoryLabel(category) {
    return ({ essenciais: 'Essenciais', lazer: 'Lazer', futuro: 'Futuro', outras: 'Outras entradas' })[category] || 'Outros';
  }
  function categoryIcon(category) { return ({ essenciais: '⌂', lazer: '✳', futuro: '↗', outras: '＋' })[category] || '•'; }
  function formatDate(value) {
    if (!value) return '—';
    const [year, month, day] = value.split('-').map(Number);
    return new Intl.DateTimeFormat('pt-BR', { day: '2-digit', month: 'short' }).format(new Date(year, month - 1, day)).replace('.', '');
  }

  const viewNames = { inicio: 'Resumo', lancamentos: 'Lançamentos', metas: 'Minhas metas', configuracoes: 'Configurações' };
  function changeView(name) {
    $$('.view').forEach(view => view.classList.toggle('active', view.id === `view-${name}`));
    $$('.nav-item[data-view]').forEach(button => button.classList.toggle('active', button.dataset.view === name));
    $('#breadcrumbCurrent').textContent = viewNames[name] || 'Resumo';
    $('#sidebar').classList.remove('open');
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  function openModal(type = 'despesa') {
    $('#launchModal').classList.add('open');
    $('#launchModal').setAttribute('aria-hidden', 'false');
    $('#dateInput').value = new Date().toLocaleDateString('en-CA');
    $('#launchForm').reset();
    $('#dateInput').value = new Date().toLocaleDateString('en-CA');
    setEntryType(type);
    setTimeout(() => $('#descriptionInput').focus(), 50);
  }
  function closeModal() {
    $('#launchModal').classList.remove('open');
    $('#launchModal').setAttribute('aria-hidden', 'true');
  }
  function setEntryType(type) {
    $('#entryType').value = type;
    $$('.toggle-tab').forEach(tab => tab.classList.toggle('active', tab.dataset.type === type));
    const category = $('#categoryInput');
    if (type === 'entrada') {
      category.innerHTML = '<option value="outras">Outras entradas</option><option value="futuro">Aporte para o futuro</option>';
      category.value = 'outras';
    } else {
      category.innerHTML = '<option value="essenciais">Essenciais</option><option value="lazer">Lazer</option><option value="futuro">Futuro</option>';
      category.value = 'essenciais';
    }
  }

  function bindEvents() {
    document.addEventListener('click', event => {
      const viewButton = event.target.closest('[data-view]');
      if (viewButton) changeView(viewButton.dataset.view);
      const deleteButton = event.target.closest('[data-delete]');
      if (deleteButton) {
        state.entries = state.entries.filter(entry => entry.id !== deleteButton.dataset.delete);
        persist(); render(); showToast('Lançamento excluído.');
      }
    });
    ['addLaunchTop', 'addLaunchPage', 'addLaunchEmpty'].forEach(id => $(`#${id}`).addEventListener('click', () => openModal()));
    $('#closeModal').addEventListener('click', closeModal);
    $('#cancelModal').addEventListener('click', closeModal);
    $('#launchModal').addEventListener('click', event => { if (event.target === $('#launchModal')) closeModal(); });
    document.addEventListener('keydown', event => { if (event.key === 'Escape') closeModal(); });
    $$('.toggle-tab').forEach(tab => tab.addEventListener('click', () => setEntryType(tab.dataset.type)));
    $('#launchForm').addEventListener('submit', event => {
      event.preventDefault();
      const amount = Number($('#amountInput').value);
      if (!Number.isFinite(amount) || amount <= 0) return showToast('Informe um valor maior que zero.', true);
      const entry = {
        id: crypto.randomUUID ? crypto.randomUUID() : `${Date.now()}-${Math.random().toString(16).slice(2)}`,
        description: $('#descriptionInput').value.trim(), type: $('#entryType').value,
        amount: round(amount), category: $('#categoryInput').value, date: $('#dateInput').value,
        createdAt: Date.now()
      };
      if (!entry.description || !entry.date) return showToast('Preencha a descrição e a data.', true);
      state.entries.push(entry);
      selectedMonth = getMonthKey(entry.date);
      setupMonthFilter(); persist(); render(); closeModal();
      showToast('Lançamento salvo com sucesso.');
    });
    $('#typeFilter').addEventListener('change', () => renderTransactions(monthEntries()));
    $('#categoryFilter').addEventListener('change', () => renderTransactions(monthEntries()));
    $('#menuToggle').addEventListener('click', () => $('#sidebar').classList.toggle('open'));
    $('#saveSalary').addEventListener('click', () => {
      const salary = readNumber('#salarySetting');
      if (salary <= 0) return showToast('Informe uma renda mensal maior que zero.', true);
      state.salary = round(salary); persist(); render(); showToast('Renda mensal atualizada.');
    });
    ['fixedSetting', 'leisureSetting', 'futureSetting'].forEach(id => $(`#${id}`).addEventListener('input', () => {
      const total = readNumber('#fixedSetting') + readNumber('#leisureSetting') + readNumber('#futureSetting');
      $('#percentMessage').textContent = `Total: ${total}%${total === 100 ? '' : ' · precisa somar 100%'}`;
      $('#percentMessage').classList.toggle('invalid', total !== 100);
    }));
    $('#savePercentages').addEventListener('click', () => {
      const percentages = { essenciais: readNumber('#fixedSetting'), lazer: readNumber('#leisureSetting'), futuro: readNumber('#futureSetting') };
      const total = Object.values(percentages).reduce((sum, value) => sum + value, 0);
      if (total !== 100) return showToast('Os percentuais precisam somar exatamente 100%.', true);
      state.percentages = percentages; persist(); render(); showToast('Divisão mensal atualizada.');
    });
    $('#saveYield').addEventListener('click', () => {
      const value = Number($('#yieldSetting').value);
      if (!Number.isFinite(value) || value <= 0 || value > 10) return showToast('Use uma taxa maior que zero e até 10% ao mês.', true);
      state.monthlyYield = value; persist(); render(); showToast('Premissa de rentabilidade atualizada.');
    });
    $('#saveReserve').addEventListener('click', () => {
      state.reserveSaved = round(readNumber('#reserveInput')); persist(); render(); showToast('Valor da reserva atualizado.');
    });
    $('#saveCapital').addEventListener('click', () => {
      state.capitalSaved = round(readNumber('#capitalInput')); persist(); render(); showToast('Patrimônio registrado.');
    });
    $('#exportData').addEventListener('click', () => {
      const blob = new Blob([JSON.stringify({ app: 'Plano 50-30-20', version: 1, exportedAt: new Date().toISOString(), data: state }, null, 2)], { type: 'application/json' });
      const link = document.createElement('a');
      link.href = URL.createObjectURL(blob); link.download = `plano-financeiro-${currentMonthKey()}.json`; link.click();
      URL.revokeObjectURL(link.href); showToast('Cópia dos dados baixada.');
    });
    $('#importData').addEventListener('change', async event => {
      const file = event.target.files?.[0]; if (!file) return;
      try {
        const backup = JSON.parse(await file.text());
        const imported = backup.data || backup;
        if (!imported || !Array.isArray(imported.entries) || !imported.percentages) throw new Error('invalid');
        if (!confirm('Importar esta cópia e substituir os dados atuais?')) return;
        state = { ...structuredClone(defaults), ...imported, percentages: { ...defaults.percentages, ...imported.percentages } };
        persist(); render(); showToast('Cópia importada com sucesso.');
      } catch { showToast('Não foi possível importar este arquivo.', true); }
      finally { event.target.value = ''; }
    });
    $('#clearData').addEventListener('click', () => {
      if (!confirm('Apagar renda, metas e lançamentos salvos neste aparelho? Esta ação não pode ser desfeita.')) return;
      state = structuredClone(defaults); selectedMonth = currentMonthKey(); persist(); setupMonthFilter(); render(); showToast('Dados apagados.');
    });
  }

  setupMonthFilter();
  bindEvents();
  render();
})();

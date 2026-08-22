function classify(ai){
  if(ai < 0)  return {text:"Cannot afford", cls:"red"};
  if(ai < 1)  return {text:"Not comfortably affordable", cls:"red"};
  if(ai < 2)  return {text:"Barely / moderately affordable", cls:"orange"};
  if(ai < 3)  return {text:"Affordable", cls:"yellow"};
  if(ai < 5)  return {text:"Comfortable", cls:"green"};
  return {text:"Very comfortable", cls:"green"};
}

function rawNumber(id){
  const v = document.getElementById(id).value.replace(/,/g, '');
  return parseFloat(v);
}

// Recommendation engine — Steps 1-8 of the algorithm
function getRecommendation(income, monthly_expenses, monthly_debt_payments, monthly_savings, liquid_savings, purchase_price, purchase_horizon){
  // STEP 1 — financial parameters
  const expense_ratio = monthly_expenses / income;
  const debt_ratio = monthly_debt_payments / income;
  const emergency_fund_months = monthly_expenses > 0 ? liquid_savings / monthly_expenses : Infinity;
  const savings_rate = monthly_savings / income;
  const monthly_free_cash_flow = income - monthly_expenses - monthly_debt_payments - monthly_savings;
  const free_cash_flow_ratio = monthly_free_cash_flow / income;

  // STEP 2 — affordability
  const emergency_fund_target = monthly_expenses * 6;
  const safe_savings = Math.max(0, liquid_savings - emergency_fund_target);
  const purchase_capacity = safe_savings + (monthly_free_cash_flow * purchase_horizon);
  const affordability_ratio = purchase_price !== 0 ? purchase_capacity / purchase_price : -Infinity;

  // STEP 3 — category
  let category;
  if(affordability_ratio < 1) category = "Not Affordable";
  else if(affordability_ratio < 2) category = "Barely / Moderately Affordable";
  else if(affordability_ratio < 3) category = "Affordable";
  else if(affordability_ratio < 5) category = "Comfortable";
  else category = "Very Comfortable";

  // STEP 4 — recommendation decision
  // Per user rule: Affordable, Comfortable, Very Comfortable need no recommendation.
  const noRecommendationNeeded = (category === "Affordable" || category === "Comfortable" || category === "Very Comfortable");

  if(noRecommendationNeeded){
    return { category, showRecommendation:false };
  }

  // STEP 5 — parameter health
  const expense_problem = expense_ratio > 0.6;
  const debt_problem = debt_ratio > 0.3;
  const emergency_fund_problem = emergency_fund_months < 6;
  const savings_problem = savings_rate < 0.2;
  const free_cash_flow_problem = free_cash_flow_ratio < 0.2;

  // STEP 8 — generate recommendation (priority order as specified)
  let recommendation, reason, currentValue, benchmark;

  if(emergency_fund_problem){
    recommendation = "Build your emergency fund before making this purchase.";
    reason = "Emergency fund coverage";
    currentValue = (isFinite(emergency_fund_months) ? emergency_fund_months.toFixed(1) : "0") + " months of expenses";
    benchmark = "6 months of expenses or more";
  } else if(debt_problem){
    recommendation = "Reduce your existing debt before making this purchase.";
    reason = "Debt-to-income ratio";
    currentValue = (debt_ratio * 100).toFixed(1) + "% of income";
    benchmark = "30% of income or less";
  } else if(expense_problem){
    recommendation = "Reduce your monthly expenses to improve affordability.";
    reason = "Essential expense ratio";
    currentValue = (expense_ratio * 100).toFixed(1) + "% of income";
    benchmark = "60% of income or less";
  } else if(savings_problem){
    recommendation = "Increase your savings or consider delaying the purchase.";
    reason = "Savings rate";
    currentValue = (savings_rate * 100).toFixed(1) + "% of income";
    benchmark = "20% of income or more";
  } else if(free_cash_flow_problem){
    recommendation = "Increase your monthly free cash flow by reducing expenses or increasing income.";
    reason = "Free cash flow ratio";
    currentValue = (free_cash_flow_ratio * 100).toFixed(1) + "% of income";
    benchmark = "20% of income or more";
  } else {
    recommendation = "Consider a lower-cost option or delay the purchase.";
    reason = "Purchase capacity relative to price";
    currentValue = affordability_ratio.toFixed(2) + "×";
    benchmark = "2.00× or higher";
  }

  // Full health snapshot — all 5 parameters, regardless of which one triggered the recommendation
  const parameters = {
    emergency: {
      healthy: !emergency_fund_problem,
      value: (isFinite(emergency_fund_months) ? emergency_fund_months.toFixed(1) : "0") + " / 6 months"
    },
    debt: {
      healthy: !debt_problem,
      value: (debt_ratio * 100).toFixed(1) + "% (target ≤ 30%)"
    },
    expense: {
      healthy: !expense_problem,
      value: (expense_ratio * 100).toFixed(1) + "% (target ≤ 60%)"
    },
    savings: {
      healthy: !savings_problem,
      value: (savings_rate * 100).toFixed(1) + "% (target ≥ 20%)"
    },
    fcf: {
      healthy: !free_cash_flow_problem,
      value: (free_cash_flow_ratio * 100).toFixed(1) + "% (target ≥ 20%)"
    }
  };

  return { category, showRecommendation:true, recommendation, reason, currentValue, benchmark, parameters };
}

function renderResults(showErrors){
  const ids = ['P','S','E','I','D','M','T'];
  const values = {};
  let hasError = false;

  ids.forEach(id => {
    const val = rawNumber(id);
    values[id] = val;
    if(showErrors){
      const fieldEl = document.getElementById('field-' + id);
      if(isNaN(val)){
        fieldEl.classList.add('error');
        hasError = true;
      } else {
        fieldEl.classList.remove('error');
      }
    } else if(isNaN(val)){
      hasError = true;
    }
  });

  if(hasError){
    if(showErrors){
      document.getElementById('result').classList.remove('show');
    }
    return; // live typing with incomplete fields: leave last valid result as-is, don't flicker
  }

  const { P, S, E, I, D, M, T } = values;
  const numerator = (S - 6*E) + (I - E - D - M) * T;
  const resultBox = document.getElementById('result');
  const aiNumber = document.getElementById('aiNumber');
  const badge = document.getElementById('aiBadge');
  const badgeText = document.getElementById('aiBadgeText');
  const note = document.getElementById('thresholdNote');
  const recPanel = document.getElementById('recommendation');

  resultBox.classList.add('show');
  recPanel.classList.remove('show');

  if(P === 0){
    aiNumber.textContent = '—';
    aiNumber.className = 'red';
    badge.className = 'badge red';
    badgeText.textContent = 'Undefined result';
    note.innerHTML = "Purchase price can't be zero, so the Affordability Index can't be computed. Check your entries.";
    return;
  }

  const ai = numerator / P;
  const { text, cls } = classify(ai);

  aiNumber.textContent = ai.toFixed(2);
  aiNumber.className = cls;
  badge.className = 'badge ' + cls;
  badgeText.textContent = text;

  if(ai >= 2){
    note.innerHTML = 'AI = <strong>' + ai.toFixed(2) + '</strong>, which clears the <strong>AI ≥ 2</strong> threshold — this purchase reads as financially affordable given the inputs above.';
  } else {
    note.innerHTML = 'AI = <strong>' + ai.toFixed(2) + '</strong>, below the <strong>AI ≥ 2</strong> threshold used to call a purchase financially affordable.';
  }

  const rec = getRecommendation(I, E, D, M, S, P, T);
  if(rec.showRecommendation){
    document.getElementById('recText').textContent = rec.recommendation;

    const checkKeys = ['emergency','debt','expense','savings','fcf'];
    let greenCount = 0, redCount = 0;
    checkKeys.forEach(key => {
      const param = rec.parameters[key];
      const icon = document.getElementById('check-' + key + '-icon');
      const value = document.getElementById('check-' + key + '-value');
      icon.textContent = param.healthy ? '✓' : '✕';
      icon.className = 'rec-check-icon ' + (param.healthy ? 'pass' : 'fail');
      value.textContent = param.value;
      if(param.healthy) greenCount++; else redCount++;
    });

    // Tile status: all green -> green; more red than green -> red; any red (but not majority) -> orange
    let status;
    if(redCount === 0) status = 'status-green';
    else if(redCount > greenCount) status = 'status-red';
    else status = 'status-orange';

    recPanel.classList.remove('status-green', 'status-orange', 'status-red');
    recPanel.classList.add(status);
    recPanel.classList.add('show');
  }
}

function calculate(){
  renderResults(true);
}

function resetForm(){
  ['P','S','E','I','D','M','T'].forEach(id => {
    document.getElementById(id).value = '';
    document.getElementById('field-' + id).classList.remove('error');
  });
  document.getElementById('result').classList.remove('show');
  document.getElementById('recommendation').classList.remove('show');
}

// Live comma formatting as the user types, so amounts stay readable
function formatWithCommas(input){
  let raw = input.value.replace(/,/g, '');
  if(raw === ''){ return; }

  let parts = raw.split('.');
  parts[0] = parts[0].replace(/\D/g, '');
  if(parts[0] === ''){ parts[0] = '0'; }
  parts[0] = parts[0].replace(/^0+(?=\d)/, '');

  let formatted = Number(parts[0]).toLocaleString('en-US');
  if(parts.length > 1){
    formatted += '.' + parts[1].replace(/\D/g, '').slice(0, 2);
  }
  input.value = formatted;
}

document.querySelectorAll('.num-input').forEach(input => {
  input.addEventListener('input', () => {
    formatWithCommas(input);
    if(input.value.trim() !== ''){
      document.getElementById('field-' + input.id).classList.remove('error');
    }
    // Live recalculation, but only once results are already showing
    // (so the panel doesn't pop up before the user has pressed Calculate the first time)
    if(document.getElementById('result').classList.contains('show')){
      renderResults(false);
    }
  });
  input.addEventListener('keydown', e => {
    const allowed = ['Backspace','Delete','ArrowLeft','ArrowRight','ArrowUp','ArrowDown','Tab','Home','End'];
    if(allowed.includes(e.key)) return;
    if(e.key === '.' && !input.value.includes('.')) return;
    if(/^[0-9]$/.test(e.key)) return;
    e.preventDefault();
  });
});

// Sidebar collapse
function toggleSidebar(){
  const shell = document.querySelector('.shell');
  shell.classList.toggle('collapsed');
  const collapsed = shell.classList.contains('collapsed');
  const btn = document.getElementById('collapseBtn');
  btn.title = collapsed ? 'Expand sidebar' : 'Collapse sidebar';
}

// Theme toggle
function applyThemeUI(theme){
  document.getElementById('themeIcon').className = theme === 'light' ? 'fa-solid fa-sun' : 'fa-solid fa-moon';
  document.getElementById('themeLabel').textContent = theme === 'light' ? 'Light mode' : 'Dark mode';
  const bnIcon = document.getElementById('bnThemeIcon');
  if(bnIcon){ bnIcon.className = theme === 'light' ? 'fa-solid fa-sun' : 'fa-solid fa-moon'; }
}

function toggleTheme(){
  const html = document.documentElement;
  const isLight = html.getAttribute('data-theme') === 'light';
  const next = isLight ? 'dark' : 'light';
  html.setAttribute('data-theme', next);
  localStorage.setItem('theme', next);
  applyThemeUI(next);
}

document.addEventListener('DOMContentLoaded', function(){
  applyThemeUI(document.documentElement.getAttribute('data-theme'));
});

// Feedback widget — the icon is always visible; these reveal/hide the
// message bubble, on icon click, on a successful calculation, or on an
// outside click. Reusable across future tools: each tool's page just needs
// the same #feedbackWidget/#feedbackBubble markup + CSS, and to call
// showFeedbackWidget() at its own success point.
function showFeedbackWidget(){
  const bubble = document.getElementById('feedbackBubble');
  if(bubble) bubble.classList.add('show');
  resetFeedbackStatus();
}

function hideFeedbackWidget(){
  const bubble = document.getElementById('feedbackBubble');
  if(bubble) bubble.classList.remove('show');
  resetFeedbackStatus();
}

function toggleFeedbackWidget(){
  const bubble = document.getElementById('feedbackBubble');
  if(!bubble) return;
  if(bubble.classList.contains('show')){
    hideFeedbackWidget();
  } else {
    showFeedbackWidget();
  }
}

function resetFeedbackStatus(){
  const statusEl = document.getElementById('feedbackStatus');
  if(statusEl){
    statusEl.textContent = '';
    statusEl.className = 'feedback-status';
  }
  feedbackRating = 0;
  document.querySelectorAll('#feedbackRating .star-btn').forEach(function(btn){
    btn.classList.remove('active');
  });
}

// Reusable confirm modal — replaces window.confirm() with a themed dialog.
// Usage: showConfirm({title, message, confirmText, cancelText, danger}).then(ok => ...)
function showConfirm(opts){
  opts = opts || {};
  return new Promise(function(resolve){
    let overlay = document.getElementById('confirmOverlay');
    if(!overlay){
      overlay = document.createElement('div');
      overlay.className = 'confirm-overlay';
      overlay.id = 'confirmOverlay';
      overlay.innerHTML =
        '<div class="confirm-modal">' +
          '<h3 id="confirmTitle"></h3>' +
          '<p id="confirmMessage"></p>' +
          '<div class="confirm-actions">' +
            '<button type="button" class="reset" id="confirmCancelBtn"></button>' +
            '<button type="button" class="calc" id="confirmOkBtn"></button>' +
          '</div>' +
        '</div>';
      document.body.appendChild(overlay);
    }

    const okBtn = document.getElementById('confirmOkBtn');
    const cancelBtn = document.getElementById('confirmCancelBtn');

    document.getElementById('confirmTitle').textContent = opts.title || 'Are you sure?';
    document.getElementById('confirmMessage').textContent = opts.message || '';
    okBtn.textContent = opts.confirmText || 'Confirm';
    cancelBtn.textContent = opts.cancelText || 'Cancel';
    okBtn.classList.toggle('danger', !!opts.danger);

    overlay.classList.add('show');

    function cleanup(result){
      overlay.classList.remove('show');
      okBtn.removeEventListener('click', onOk);
      cancelBtn.removeEventListener('click', onCancel);
      overlay.removeEventListener('click', onOverlayClick);
      document.removeEventListener('keydown', onKeydown);
      resolve(result);
    }
    function onOk(){ cleanup(true); }
    function onCancel(){ cleanup(false); }
    function onOverlayClick(e){ if(e.target === overlay) cleanup(false); }
    function onKeydown(e){ if(e.key === 'Escape') cleanup(false); }

    okBtn.addEventListener('click', onOk);
    cancelBtn.addEventListener('click', onCancel);
    overlay.addEventListener('click', onOverlayClick);
    document.addEventListener('keydown', onKeydown);
  });
}

let feedbackRating = 0;

function setFeedbackRating(value){
  feedbackRating = value;
  document.querySelectorAll('#feedbackRating .star-btn').forEach(function(btn){
    btn.classList.toggle('active', Number(btn.dataset.value) <= value);
  });
}

document.addEventListener('click', function(e){
  const widget = document.getElementById('feedbackWidget');
  if(widget && !widget.contains(e.target)) hideFeedbackWidget();
});

function submitFeedback(){
  const textEl = document.getElementById('feedbackText');
  const statusEl = document.getElementById('feedbackStatus');
  const btn = document.getElementById('feedbackSubmitBtn');
  if(!textEl || !statusEl || !btn) return;

  const message = textEl.value.trim();
  if(!message){
    statusEl.textContent = 'Please write something first.';
    statusEl.className = 'feedback-status error';
    return;
  }
  if(typeof db === 'undefined' || !db){
    statusEl.textContent = "Couldn't send — try again shortly.";
    statusEl.className = 'feedback-status error';
    return;
  }

  const user = (typeof auth !== 'undefined' && auth) ? auth.currentUser : null;

  btn.disabled = true;
  statusEl.textContent = '';
  statusEl.className = 'feedback-status';

  db.collection('feedback').add({
    message: message,
    rating: feedbackRating || null,
    email: user ? (user.email || null) : null,
    uid: user ? user.uid : null,
    page: window.location.pathname,
    createdAt: firebase.firestore.FieldValue.serverTimestamp()
  }).then(function(){
    textEl.value = '';
    feedbackRating = 0;
    statusEl.textContent = 'Thanks — feedback sent!';
    statusEl.className = 'feedback-status success';
    setTimeout(hideFeedbackWidget, 1800);
  }).catch(function(){
    statusEl.textContent = "Couldn't send — try again shortly.";
    statusEl.className = 'feedback-status error';
  }).finally(function(){
    btn.disabled = false;
  });
}

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

  if(showErrors){
    const nameEl = document.getElementById('productName');
    const nameFieldEl = document.getElementById('field-productName');
    if(nameEl && nameFieldEl){
      if(!nameEl.value.trim()){
        nameFieldEl.classList.add('error');
        hasError = true;
      } else {
        nameFieldEl.classList.remove('error');
      }
    }
  }

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
  const numerator = Math.max(0, S - 6*E) + (I - E - D - M) * T;
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

  showFeedbackWidget();

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

  const resultBox = document.getElementById('result');
  const aiNumberEl = document.getElementById('aiNumber');
  if(!resultBox.classList.contains('show') || aiNumberEl.textContent === '—') return;

  const productName = document.getElementById('productName').value.trim();
  if(!productName) return;

  const entry = {
    productName: productName,
    ai: aiNumberEl.textContent,
    classificationText: document.getElementById('aiBadgeText').textContent,
    classificationClass: aiNumberEl.className,
    inputs: {
      P: rawNumber('P'), S: rawNumber('S'), E: rawNumber('E'),
      I: rawNumber('I'), D: rawNumber('D'), M: rawNumber('M'), T: rawNumber('T')
    }
  };

  if(editingHistoryId){
    if(typeof updateCalculationInHistory === 'function'){
      updateCalculationInHistory(editingHistoryId, entry);
    }
  } else if(typeof saveCalculationToHistory === 'function'){
    saveCalculationToHistory(entry);
  }
}

function resetForm(){
  document.getElementById('productName').value = '';
  document.getElementById('field-productName').classList.remove('error');
  ['P','S','E','I','D','M','T'].forEach(id => {
    document.getElementById(id).value = '';
    document.getElementById('field-' + id).classList.remove('error');
  });
  document.getElementById('result').classList.remove('show');
  document.getElementById('recommendation').classList.remove('show');

  if(typeof exitEditMode === 'function') exitEditMode();
}

// ---------- Calculation history (Firestore) ----------
const HISTORY_CALCULATOR_TYPE = 'affordability-index';
let editingHistoryId = null;

function updateCalculationInHistory(id, entry){
  if(typeof db === 'undefined' || !db) return;

  db.collection('history').doc(id).update({
    productName: entry.productName,
    ai: entry.ai,
    classificationText: entry.classificationText,
    classificationClass: entry.classificationClass,
    inputs: entry.inputs
  }).then(function(){
    loadCalculatorHistory();
  }).catch(function(err){
    console.error('Failed to update calculation history:', err);
  });
}

function editHistoryItem(id){
  if(typeof db === 'undefined' || !db) return;

  db.collection('history').doc(id).get().then(function(doc){
    if(!doc.exists) return;
    const d = doc.data();

    document.getElementById('productName').value = d.productName || '';
    document.getElementById('field-productName').classList.remove('error');

    ['P','S','E','I','D','M','T'].forEach(function(key){
      const input = document.getElementById(key);
      input.value = d.inputs && d.inputs[key] != null ? d.inputs[key] : '';
      formatWithCommas(input);
      document.getElementById('field-' + key).classList.remove('error');
    });

    editingHistoryId = id;

    const banner = document.getElementById('editBanner');
    const bannerText = document.getElementById('editBannerText');
    if(banner) banner.classList.add('show');
    if(bannerText) bannerText.textContent = 'Editing "' + d.productName + '" — changing values and hitting Calculate will update this entry.';

    const calcBtn = document.getElementById('calculateBtn');
    if(calcBtn) calcBtn.textContent = 'Update';

    document.getElementById('editBanner').scrollIntoView({behavior:'smooth', block:'center'});
  }).catch(function(err){
    console.error('Failed to load calculation for editing:', err);
  });
}

function exitEditMode(){
  editingHistoryId = null;
  const banner = document.getElementById('editBanner');
  if(banner) banner.classList.remove('show');
  const calcBtn = document.getElementById('calculateBtn');
  if(calcBtn) calcBtn.textContent = 'Calculate';
}

function cancelEditHistory(){
  resetForm();
}

function saveCalculationToHistory(entry){
  if(typeof db === 'undefined' || !db) return;
  const user = (typeof auth !== 'undefined' && auth) ? auth.currentUser : null;
  if(!user) return;

  db.collection('history').add({
    uid: user.uid,
    calculatorType: HISTORY_CALCULATOR_TYPE,
    productName: entry.productName,
    ai: entry.ai,
    classificationText: entry.classificationText,
    classificationClass: entry.classificationClass,
    inputs: entry.inputs,
    createdAt: firebase.firestore.FieldValue.serverTimestamp()
  }).then(function(){
    loadCalculatorHistory();
  }).catch(function(err){
    console.error('Failed to save calculation history:', err);
  });
}

function loadCalculatorHistory(){
  const listEl = document.getElementById('historyList');
  if(!listEl || typeof db === 'undefined' || !db) return;

  const user = (typeof auth !== 'undefined' && auth) ? auth.currentUser : null;
  if(!user){
    listEl.innerHTML = '<p class="history-empty" id="historyEmpty">Sign in and calculate to start saving your history.</p>';
    return;
  }

  db.collection('history')
    .where('uid', '==', user.uid)
    .orderBy('createdAt', 'desc')
    .get()
    .then(function(snapshot){
      const docs = snapshot.docs.filter(function(doc){
        return doc.data().calculatorType === HISTORY_CALCULATOR_TYPE;
      });
      renderHistoryItems(docs);
    })
    .catch(function(err){
      console.error('Failed to load calculation history:', err);
      listEl.innerHTML = '<p class="history-empty">Couldn\'t load your history right now.</p>';
    });
}

function renderHistoryItems(docs){
  const listEl = document.getElementById('historyList');
  if(!listEl) return;

  if(!docs.length){
    listEl.innerHTML = '<p class="history-empty" id="historyEmpty">No saved calculations yet — calculate your score above to save one.</p>';
    return;
  }

  listEl.innerHTML = docs.map(function(doc){
    const d = doc.data();
    const date = d.createdAt && d.createdAt.toDate ? d.createdAt.toDate() : null;
    const dateText = date ? date.toLocaleDateString(undefined, {year:'numeric', month:'short', day:'numeric'}) : '';
    return (
      '<div class="history-item">' +
        '<div class="history-item-main">' +
          '<span class="history-item-name">' + escapeHtml(d.productName) + '</span>' +
          '<span class="history-item-meta">' + dateText + '</span>' +
        '</div>' +
        '<div class="history-item-right">' +
          '<span class="badge ' + escapeHtml(d.classificationClass || '') + '">' +
            '<span class="dot"></span>' + escapeHtml(d.ai) + ' &middot; ' + escapeHtml(d.classificationText) +
          '</span>' +
          '<button type="button" class="history-delete-btn" title="Delete" onclick="deleteHistoryItem(\'' + doc.id + '\')">' +
            '<i class="fa-solid fa-trash"></i>' +
          '</button>' +
          '<button type="button" class="history-edit-btn" title="Edit" onclick="editHistoryItem(\'' + doc.id + '\')">' +
            '<i class="fa-solid fa-pen-to-square"></i>' +
          '</button>' +
        '</div>' +
      '</div>'
    );
  }).join('');
}

function deleteHistoryItem(id){
  showConfirm({
    title: 'Delete this calculation?',
    message: "This can't be undone.",
    confirmText: 'Delete',
    cancelText: 'Cancel',
    danger: true
  }).then(function(ok){
    if(!ok || typeof db === 'undefined' || !db) return;
    db.collection('history').doc(id).delete().then(function(){
      if(editingHistoryId === id && typeof exitEditMode === 'function') exitEditMode();
      loadCalculatorHistory();
    }).catch(function(err){
      console.error('Failed to delete history item:', err);
    });
  });
}

function escapeHtml(str){
  const div = document.createElement('div');
  div.textContent = str == null ? '' : String(str);
  return div.innerHTML;
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

// Product name field — letters/spaces/punctuation only, no digits
const productNameInput = document.getElementById('productName');
if(productNameInput){
  productNameInput.addEventListener('input', () => {
    const stripped = productNameInput.value.replace(/[0-9]/g, '');
    if(stripped !== productNameInput.value) productNameInput.value = stripped;
    if(productNameInput.value.trim() !== ''){
      document.getElementById('field-productName').classList.remove('error');
    }
  });
  productNameInput.addEventListener('keydown', e => {
    if(/^[0-9]$/.test(e.key)) e.preventDefault();
  });
}

// Theme toggle
function applyThemeUI(theme){
  const icon = document.getElementById('themeIcon');
  if(icon){ icon.className = theme === 'light' ? 'fa-solid fa-sun' : 'fa-solid fa-moon'; }
  const label = document.getElementById('themeLabel');
  if(label){ label.textContent = theme === 'light' ? 'Light mode' : 'Dark mode'; }
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

// Small hand-rolled line/area chart with a hover crosshair + tooltip, keyboard-
// navigable. `points` is [{label, value}, ...]; opts: valueFormat(v), yMin, yMax,
// labelIndex (which point gets the direct end-label; defaults to the last),
// endLabel (override label text), labelAbove (place label above vs below the dot).
function renderTrendChart(containerId, points, opts){
  const container = document.getElementById(containerId);
  if(!container) return;
  opts = opts || {};

  const W = 440, H = 240, padL = 8, padR = 8, padT = 26, padB = 26;
  const plotW = W - padL - padR;
  const plotH = H - padT - padB;
  const values = points.map(function(p){ return p.value; });
  const yMin = opts.yMin != null ? opts.yMin : 0;
  const yMax = opts.yMax != null ? opts.yMax : Math.max.apply(null, values);
  const xStep = plotW / (points.length - 1);
  const xAt = function(i){ return padL + i * xStep; };
  const yAt = function(v){ return padT + plotH - ((v - yMin) / (yMax - yMin)) * plotH; };

  const linePts = points.map(function(p, i){ return [xAt(i), yAt(p.value)]; });
  const lineD = linePts.map(function(pt, i){
    return (i === 0 ? 'M' : 'L') + pt[0].toFixed(1) + ',' + pt[1].toFixed(1);
  }).join(' ');
  const baseline = (padT + plotH).toFixed(1);
  const areaD = lineD +
    ' L' + xAt(points.length - 1).toFixed(1) + ',' + baseline +
    ' L' + xAt(0).toFixed(1) + ',' + baseline + ' Z';

  const gridCount = 4;
  let gridSvg = '';
  for(let g = 0; g <= gridCount; g++){
    const y = (padT + (plotH / gridCount) * g).toFixed(1);
    gridSvg += '<line class="chart-grid-line" x1="' + padL + '" y1="' + y + '" x2="' + (padL + plotW) + '" y2="' + y + '"/>';
  }

  const xLabels = points.map(function(p, i){
    const anchor = i === 0 ? 'start' : (i === points.length - 1 ? 'end' : 'middle');
    return '<text class="chart-axis-label" x="' + xAt(i).toFixed(1) + '" y="' + (H - 6) + '" text-anchor="' + anchor + '">' + escapeHtml(p.label) + '</text>';
  }).join('');

  const endIdx = opts.labelIndex != null ? opts.labelIndex : points.length - 1;
  const endPt = linePts[endIdx];
  const endLabelText = opts.endLabel || opts.valueFormat(points[endIdx].value);
  const labelAbove = opts.labelAbove !== false;
  const labelY = labelAbove ? endPt[1] - 14 : endPt[1] + 20;
  const labelAnchor = endIdx === points.length - 1 ? 'end' : (endIdx === 0 ? 'start' : 'middle');

  container.innerHTML =
    '<svg viewBox="0 0 ' + W + ' ' + H + '" width="' + W + '" height="' + H + '" class="trend-chart-svg" tabindex="0" preserveAspectRatio="none">' +
      '<defs><linearGradient id="' + containerId + '-grad" x1="0" y1="0" x2="0" y2="1">' +
        '<stop offset="0%" stop-color="var(--chart-line)" stop-opacity="0.14"/>' +
        '<stop offset="100%" stop-color="var(--chart-line)" stop-opacity="0"/>' +
      '</linearGradient></defs>' +
      gridSvg +
      '<path class="chart-area-path" d="' + areaD + '" fill="url(#' + containerId + '-grad)" stroke="none"/>' +
      '<path class="chart-line-path" d="' + lineD + '" fill="none" stroke="var(--chart-line)" stroke-width="2" stroke-linejoin="round" stroke-linecap="round"/>' +
      '<circle class="chart-end-dot" cx="' + endPt[0].toFixed(1) + '" cy="' + endPt[1].toFixed(1) + '" r="4"/>' +
      '<text class="chart-direct-label" x="' + endPt[0].toFixed(1) + '" y="' + labelY.toFixed(1) + '" text-anchor="' + labelAnchor + '">' + escapeHtml(endLabelText) + '</text>' +
      xLabels +
      '<line class="chart-crosshair" x1="0" y1="' + padT + '" x2="0" y2="' + baseline + '" opacity="0"/>' +
      '<circle class="chart-hover-dot" r="5" opacity="0"/>' +
    '</svg>' +
    '<div class="chart-tooltip"></div>';

  const svgEl = container.querySelector('svg');
  const crosshair = svgEl.querySelector('.chart-crosshair');
  const hoverDot = svgEl.querySelector('.chart-hover-dot');
  const tooltip = container.querySelector('.chart-tooltip');

  // Draw-in animation: the line traces itself in, then the area/dot/label
  // fade in. Replays every time the chart scrolls into view.
  const drawPath = svgEl.querySelector('.chart-line-path');
  const drawLen = drawPath.getTotalLength();
  drawPath.style.strokeDasharray = drawLen;

  function resetDraw(){
    drawPath.style.transition = 'none';
    drawPath.style.strokeDashoffset = drawLen;
    container.classList.remove('in-view');
  }
  function playDraw(){
    drawPath.style.transition = 'none';
    drawPath.style.strokeDashoffset = drawLen;
    // force reflow so the next transition actually runs from the reset value
    drawPath.getBoundingClientRect();
    drawPath.style.transition = 'stroke-dashoffset 1100ms ease';
    drawPath.style.strokeDashoffset = '0';
    container.classList.add('in-view');
  }
  resetDraw();

  if('IntersectionObserver' in window){
    const drawObserver = new IntersectionObserver(function(entries){
      entries.forEach(function(entry){
        if(entry.isIntersecting) playDraw();
        else resetDraw();
      });
    }, {threshold: 0.4});
    drawObserver.observe(container);
  } else {
    playDraw();
  }

  function showAt(i){
    const pt = linePts[i];
    crosshair.setAttribute('x1', pt[0]);
    crosshair.setAttribute('x2', pt[0]);
    crosshair.setAttribute('opacity', '1');
    hoverDot.setAttribute('cx', pt[0]);
    hoverDot.setAttribute('cy', pt[1]);
    hoverDot.setAttribute('opacity', '1');

    tooltip.innerHTML = '';
    const valueEl = document.createElement('div');
    valueEl.className = 'chart-tooltip-value';
    valueEl.textContent = opts.valueFormat(points[i].value);
    const labelEl = document.createElement('div');
    labelEl.className = 'chart-tooltip-label';
    labelEl.textContent = points[i].label;
    tooltip.appendChild(valueEl);
    tooltip.appendChild(labelEl);
    tooltip.style.opacity = '1';
    tooltip.style.left = (pt[0] / W * 100) + '%';
    tooltip.style.top = (pt[1] / H * 100) + '%';
  }
  function hide(){
    crosshair.setAttribute('opacity', '0');
    hoverDot.setAttribute('opacity', '0');
    tooltip.style.opacity = '0';
  }

  svgEl.addEventListener('pointermove', function(e){
    const rect = svgEl.getBoundingClientRect();
    const relX = (e.clientX - rect.left) / rect.width * W;
    let nearest = 0, best = Infinity;
    linePts.forEach(function(pt, i){
      const d = Math.abs(pt[0] - relX);
      if(d < best){ best = d; nearest = i; }
    });
    showAt(nearest);
  });
  svgEl.addEventListener('pointerleave', hide);

  let focusIdx = 0;
  svgEl.addEventListener('focus', function(){ showAt(focusIdx); });
  svgEl.addEventListener('blur', hide);
  svgEl.addEventListener('keydown', function(e){
    if(e.key === 'ArrowRight'){
      focusIdx = Math.min(points.length - 1, focusIdx + 1);
      showAt(focusIdx);
      e.preventDefault();
    } else if(e.key === 'ArrowLeft'){
      focusIdx = Math.max(0, focusIdx - 1);
      showAt(focusIdx);
      e.preventDefault();
    }
  });
}

document.addEventListener('DOMContentLoaded', function(){
  applyThemeUI(document.documentElement.getAttribute('data-theme'));

  // Hero quote typewriter effect (landing page only)
  const typedEl = document.getElementById('heroQuoteTyped');
  if(typedEl){
    const fullText = '“Investing is not a choice. It’s a must.”';
    const cursorEl = document.querySelector('.typing-cursor');
    const citeEl = document.querySelector('.hero-quote cite');
    let i = 0;
    (function typeNext(){
      if(i <= fullText.length){
        typedEl.textContent = fullText.slice(0, i);
        i++;
        setTimeout(typeNext, 45);
      } else {
        typedEl.innerHTML = '“Investing is not a <span class="quote-word-red">choice</span>. ' +
          'It’s a <span class="quote-word-green">must</span>.”';
        if(cursorEl) cursorEl.classList.add('done');
        if(citeEl) citeEl.classList.add('show');
      }
    })();
  }

  // Affordability Index preview — subtle reveal + score count-up, replays
  // every time the preview scrolls into view (not just the first time)
  const heroPreview = document.getElementById('heroPreview');
  const heroPreviewScore = document.getElementById('heroPreviewScore');
  if(heroPreview && 'IntersectionObserver' in window){
    let countUpToken = 0;

    const observer = new IntersectionObserver(function(entries){
      entries.forEach(function(entry){
        if(entry.isIntersecting){
          heroPreview.classList.add('in-view');

          if(heroPreviewScore){
            const myToken = ++countUpToken;
            const target = 2.8;
            const duration = 900;
            const start = performance.now();
            (function tick(now){
              if(myToken !== countUpToken) return;
              const progress = Math.min((now - start) / duration, 1);
              heroPreviewScore.textContent = (target * progress).toFixed(2);
              if(progress < 1) requestAnimationFrame(tick);
            })(start);
          }
        } else {
          heroPreview.classList.remove('in-view');
          countUpToken++;
          if(heroPreviewScore) heroPreviewScore.textContent = '0.00';
        }
      });
    }, {threshold: 0.4});
    observer.observe(heroPreview);
  }

  // "Why should I invest?" charts (landing page only)
  renderTrendChart('chartInflation', [
    {label: 'Now', value: 100},
    {label: '5 yr', value: 74.7},
    {label: '10 yr', value: 55.8},
    {label: '15 yr', value: 41.7},
    {label: '20 yr', value: 31.2},
    {label: '25 yr', value: 23.3},
    {label: '30 yr', value: 17.4}
  ], {
    valueFormat: function(v){ return '₹' + Math.round(v); },
    yMin: 0,
    yMax: 100
  });

  renderTrendChart('chartIncome', [
    {label: '25', value: 50},
    {label: '35', value: 90},
    {label: '45', value: 120},
    {label: '55', value: 130},
    {label: '60', value: 130},
    {label: '61', value: 8},
    {label: '70', value: 8},
    {label: '80', value: 8}
  ], {
    valueFormat: function(v){ return '₹' + v + 'k/mo'; },
    yMin: 0,
    yMax: 140,
    labelIndex: 5,
    endLabel: 'Income stops',
    labelAbove: true
  });

  // Life-chip connector line: only show when the chips actually fit on one
  // row (a wrapped row would make a single straight line cut across wrong)
  const chipRow = document.querySelector('.life-chip-row');
  if(chipRow){
    const updateChipRowLayout = function(){
      const chips = chipRow.querySelectorAll('.life-chip');
      if(!chips.length) return;
      const firstTop = chips[0].offsetTop;
      const wrapped = Array.prototype.some.call(chips, function(chip){
        return chip.offsetTop !== firstTop;
      });
      chipRow.classList.toggle('single-row', !wrapped);
    };
    updateChipRowLayout();
    window.addEventListener('resize', updateChipRowLayout);
  }
});

// Feedback widget — the icon is always visible; these reveal/hide the
// message bubble, on icon click or on an outside click. Reusable across
// future tools: each tool's page just needs the same #feedbackWidget/
// #feedbackBubble markup + CSS.
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

  const savePrompt = document.getElementById('savePrompt');
  const signedInUser = (typeof auth !== 'undefined' && auth) ? auth.currentUser : null;

  if(editingHistoryId){
    if(typeof updateCalculationInHistory === 'function'){
      updateCalculationInHistory(editingHistoryId, entry);
    }
    if(savePrompt) savePrompt.classList.remove('show');
  } else if(signedInUser){
    if(typeof saveCalculationToHistory === 'function'){
      saveCalculationToHistory(entry);
    }
    if(savePrompt) savePrompt.classList.remove('show');
  } else if(savePrompt){
    // Anonymous visitors get the full result; saving it is the one thing an
    // account buys them, offered at the moment the result is worth keeping.
    savePrompt.classList.add('show');
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

  const notice = document.getElementById('prefillNotice');
  if(notice) notice.classList.remove('show');

  const savePrompt = document.getElementById('savePrompt');
  if(savePrompt) savePrompt.classList.remove('show');

  if(typeof exitEditMode === 'function') exitEditMode();

  // A cleared form's resting state is "my saved details", same as a fresh
  // page load — otherwise Reset would strand the user with blank fields they
  // deliberately saved to avoid retyping.
  if(typeof prefillCalculatorFromProfile === 'function') prefillCalculatorFromProfile();
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

    // These values came from the saved entry, not the profile.
    const notice = document.getElementById('prefillNotice');
    if(notice) notice.classList.remove('show');

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
    listEl.innerHTML = '<p class="history-empty" id="historyEmpty"><a href="login.html">Sign in</a> to save your calculations and come back to them later.</p>';
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

// ---------- Saved user details (Firestore) ----------
// The recurring figures a person shouldn't have to retype for every
// calculation. Purchase-specific inputs (P, T) are deliberately excluded —
// they change with each purchase, so a stored value would be wrong more often
// than right. Keyed by uid so one doc per user, overwritten on save.
const PROFILE_FIELDS = ['S', 'E', 'I', 'D', 'M'];
// Profile page input ids are prefixed so they never collide with the
// calculator's own S/E/I/D/M inputs if the two ever share a page.
const PROFILE_INPUT_PREFIX = 'p';

function getProfileDocRef(){
  if(typeof db === 'undefined' || !db) return null;
  const user = (typeof auth !== 'undefined' && auth) ? auth.currentUser : null;
  if(!user) return null;
  return db.collection('profiles').doc(user.uid);
}

// The save has always written an updatedAt; until now nothing read it back, so
// the page gave no sign your figures were actually stored.
function setProfileSavedAt(date){
  const el = document.getElementById('profileSaved');
  if(!el) return;
  if(!date){
    el.textContent = '';
    el.classList.remove('show');
    return;
  }
  const now = new Date();
  const sameDay = date.toDateString() === now.toDateString();
  const time = date.toLocaleTimeString(undefined, {hour:'numeric', minute:'2-digit'});
  const day = date.toLocaleDateString(undefined, {
    day:'numeric', month:'long',
    year: date.getFullYear() === now.getFullYear() ? undefined : 'numeric'
  });
  el.textContent = sameDay ? ('Last saved today at ' + time) : ('Last saved ' + day);
  el.classList.add('show');
}

function setProfileStatus(message, isError){
  const el = document.getElementById('profileStatus');
  if(!el) return;
  el.textContent = message;
  el.classList.toggle('error', !!isError);
  el.classList.toggle('show', !!message);
}

// Populates the profile page's own form from the saved doc.
function loadProfileDetails(){
  if(!document.getElementById('profileSaveBtn')) return; // not on the profile page

  const ref = getProfileDocRef();
  if(!ref){
    PROFILE_FIELDS.forEach(function(key){
      const input = document.getElementById(PROFILE_INPUT_PREFIX + key);
      if(input) input.value = '';
    });
    setProfileSavedAt(null);
    return;
  }

  ref.get().then(function(doc){
    const raw = doc.exists ? doc.data() : {};
    const data = raw.details || {};
    // Firestore hands back a Timestamp; toDate() may be absent on a write that
    // hasn't round-tripped through the server yet.
    setProfileSavedAt(raw.updatedAt && raw.updatedAt.toDate ? raw.updatedAt.toDate() : null);
    PROFILE_FIELDS.forEach(function(key){
      const input = document.getElementById(PROFILE_INPUT_PREFIX + key);
      if(!input) return;
      input.value = data[key] != null ? data[key] : '';
      formatWithCommas(input);
    });
  }).catch(function(err){
    console.error('Failed to load saved details:', err);
    setProfileStatus("Couldn't load your saved details right now.", true);
  });
}

function saveProfileDetails(){
  const ref = getProfileDocRef();
  if(!ref){
    setProfileStatus('Sign in to save your details.', true);
    return;
  }

  // Blank is a legitimate answer — it means "I don't want this prefilled" —
  // so empty fields are stored as null rather than skipped, otherwise a
  // cleared field would keep its old value on the next load.
  const details = {};
  let anyFilled = false;
  for(const key of PROFILE_FIELDS){
    const input = document.getElementById(PROFILE_INPUT_PREFIX + key);
    const raw = input ? input.value.replace(/,/g, '').trim() : '';
    if(raw === ''){
      details[key] = null;
      continue;
    }
    const num = parseFloat(raw);
    if(isNaN(num) || num < 0){
      setProfileStatus('Values cannot be negative.', true);
      return;
    }
    details[key] = num;
    anyFilled = true;
  }

  const btn = document.getElementById('profileSaveBtn');
  if(btn) btn.disabled = true;
  setProfileStatus('Saving…');

  ref.set({
    details: details,
    updatedAt: firebase.firestore.FieldValue.serverTimestamp()
  }, {merge: true}).then(function(){
    setProfileStatus(anyFilled
      ? 'Saved — your calculators will fill these in from now on.'
      : 'Saved — nothing will be prefilled.');
    setProfileSavedAt(new Date());
    if(btn) btn.disabled = false;
  }).catch(function(err){
    console.error('Failed to save details:', err);
    setProfileStatus("Couldn't save your details. Try again.", true);
    if(btn) btn.disabled = false;
  });
}

function clearProfileDetails(){
  showConfirm({
    title: 'Clear your details?',
    message: 'This empties every field here. Nothing will be prefilled in your calculators until you save new values.',
    confirmText: 'Clear all',
    cancelText: 'Cancel',
    danger: true
  }).then(function(ok){
    if(!ok) return;
    PROFILE_FIELDS.forEach(function(key){
      const input = document.getElementById(PROFILE_INPUT_PREFIX + key);
      if(input) input.value = '';
    });
    setProfileStatus('Cleared — hit Save details to confirm.');
  });
}

// ---------- Account deletion (DPDP / GDPR right to erasure) ----------
// Removes everything tied to the account, then the account itself. Firestore
// has no cascading delete, so each collection is cleared explicitly — and the
// auth user goes LAST, because losing the credential first would leave the
// documents orphaned and unreachable.
function deleteAccountAndData(){
  const user = (typeof auth !== 'undefined' && auth) ? auth.currentUser : null;
  if(!user){
    setProfileStatus('Sign in first.', true);
    return;
  }

  showConfirm({
    title: 'Delete your account?',
    message: 'This permanently deletes your saved calculations, your saved details, '
           + 'and your account itself. It cannot be undone.',
    confirmText: 'Delete everything',
    cancelText: 'Cancel',
    danger: true
  }).then(function(ok){
    if(!ok) return;

    const btn = document.getElementById('deleteAccountBtn');
    if(btn) btn.disabled = true;
    setProfileStatus('Deleting your data…');

    const uid = user.uid;

    function clearHistory(){
      if(typeof db === 'undefined' || !db) return Promise.resolve();
      return db.collection('history').where('uid', '==', uid).get().then(function(snap){
        return Promise.all(snap.docs.map(function(d){ return d.ref.delete(); }));
      });
    }
    function clearProfile(){
      if(typeof db === 'undefined' || !db) return Promise.resolve();
      return db.collection('profiles').doc(uid).delete();
    }

    clearHistory()
      .then(clearProfile)
      .then(function(){ return user.delete(); })
      .then(function(){
        try{ localStorage.removeItem('ffCachedUser'); }catch(e){}
        window.location.href = 'index.html';
      })
      .catch(function(err){
        console.error('Account deletion failed:', err);
        if(btn) btn.disabled = false;
        // Firebase refuses to delete a user whose sign-in is not recent.
        if(err && err.code === 'auth/requires-recent-login'){
          setProfileStatus('For security, sign out and sign in again, then retry — '
                         + 'your saved data has already been removed.', true);
        } else {
          setProfileStatus("Couldn't finish deleting your account. Try again, or contact "
                         + 'support if it keeps failing.', true);
        }
      });
  });
}

// Fills the calculator's own S/E/I/D/M inputs from the saved profile. Only
// ever writes into fields the user has left empty, so it can't clobber a
// figure someone is part-way through typing, and never touches P or T.
// Edits made in the calculator stay local — saving back to the profile is a
// separate, deliberate action on the profile page.
function prefillCalculatorFromProfile(){
  const marker = document.getElementById('prefillNotice');
  if(!document.getElementById('calculateBtn')) return; // not on the calculator page

  const ref = getProfileDocRef();
  if(!ref) return;

  ref.get().then(function(doc){
    if(!doc.exists) return;
    const data = doc.data().details || {};

    const filled = [];
    PROFILE_FIELDS.forEach(function(key){
      const input = document.getElementById(key);
      if(!input || input.value.trim() !== '') return;
      if(data[key] == null) return;
      input.value = data[key];
      formatWithCommas(input);
      const field = document.getElementById('field-' + key);
      if(field) field.classList.remove('error');
      filled.push(key);
    });

    if(marker){
      marker.classList.toggle('show', filled.length > 0);
    }
  }).catch(function(err){
    console.error('Failed to prefill from saved details:', err);
  });
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
      const field = document.getElementById('field-' + input.id);
      if(field) field.classList.remove('error');
    }
    // Live recalculation, but only once results are already showing
    // (so the panel doesn't pop up before the user has pressed Calculate the first time).
    // Pages without a result panel (e.g. the profile page) reuse these inputs
    // purely for their comma formatting.
    const result = document.getElementById('result');
    if(result && result.classList.contains('show')){
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
  const menuIcon = document.getElementById('menuThemeIcon');
  if(menuIcon){ menuIcon.className = theme === 'light' ? 'fa-solid fa-sun' : 'fa-solid fa-moon'; }
  const menuLabel = document.getElementById('menuThemeLabel');
  if(menuLabel){ menuLabel.textContent = theme === 'light' ? 'Light mode' : 'Dark mode'; }
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
    {label: '5 yr', value: 71.3},
    {label: '10 yr', value: 50.8},
    {label: '15 yr', value: 36.2},
    {label: '20 yr', value: 25.8},
    {label: '25 yr', value: 18.4},
    {label: '30 yr', value: 13.1}
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

  // Inflation note visual (landing page only) — a stylized ₹2,000 note that
  // slowly shrinks and fades on a loop, its real worth falling at 7% average
  // yearly inflation, then resets as if freshly printed. Pauses off-screen.
  (function(){
    const stage = document.getElementById('inflationStage');
    const note = document.getElementById('inflationNote');
    const yearEl = document.getElementById('inflationYear');
    const worthEl = document.getElementById('inflationWorth');
    if(!stage || !note || !yearEl || !worthEl) return;

    const FACE_VALUE = 2000;
    const RATE = 0.07;
    const SPAN_YEARS = 30;
    const SWEEP_MS = 11000;
    const HOLD_MS = 900;
    const RESET_MS = 700;
    const CYCLE_MS = SWEEP_MS + HOLD_MS + RESET_MS;

    function easeInOutQuad(t){
      return t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2;
    }

    function paint(t, opacity){
      const year = Math.round(t * SPAN_YEARS);
      const worth = Math.round(FACE_VALUE / Math.pow(1 + RATE, year));

      note.style.transform = 'scale(' + (1 - 0.5 * t).toFixed(3) + ')';
      note.style.opacity = opacity.toFixed(3);
      note.style.filter = 'saturate(' + (1 - 0.65 * t).toFixed(2) + ')';

      const yearText = 'Year ' + year;
      if(yearEl.textContent !== yearText) yearEl.textContent = yearText;
      const worthText = 'Real worth: ₹' + worth.toLocaleString('en-US');
      if(worthEl.textContent !== worthText) worthEl.textContent = worthText;
    }

    if(window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches){
      paint(1, 1);
      return;
    }

    paint(0, 1);

    let running = false;
    let rafId = null;
    let startTime = null;

    function frame(now){
      if(!running) return;
      if(startTime == null) startTime = now;
      const elapsed = (now - startTime) % CYCLE_MS;

      if(elapsed < SWEEP_MS){
        paint(easeInOutQuad(elapsed / SWEEP_MS), 1);
      } else if(elapsed < SWEEP_MS + HOLD_MS){
        paint(1, 1);
      } else {
        const rt = (elapsed - SWEEP_MS - HOLD_MS) / RESET_MS;
        paint(rt < 0.5 ? 1 : 0, rt < 0.5 ? 1 - rt * 2 : (rt - 0.5) * 2);
      }
      rafId = requestAnimationFrame(frame);
    }

    function start(){
      if(running) return;
      running = true;
      startTime = null;
      rafId = requestAnimationFrame(frame);
    }
    function stop(){
      if(!running) return;
      running = false;
      if(rafId != null) cancelAnimationFrame(rafId);
      paint(0, 1);
    }

    if('IntersectionObserver' in window){
      new IntersectionObserver(function(entries){
        entries.forEach(function(entry){
          if(entry.isIntersecting) start(); else stop();
        });
      }, {threshold: 0.3}).observe(stage);
    } else {
      start();
    }
  })();

  // "Money is part of every life stage" journey (landing page only) — a dot
  // runs the rail, stopping at each life stage to light it up and reveal what
  // it costs. Autoplays only while on screen; hover/focus takes manual control.
  (function(){
    const root = document.getElementById('lifeJourney');
    if(!root) return;
    const track = root.querySelector('.journey-track');
    const rail = root.querySelector('.journey-rail');
    const fill = root.querySelector('.journey-rail-fill');
    const traveler = root.querySelector('.journey-traveler');
    const panel = root.querySelector('.journey-panel');
    const panelTitle = root.querySelector('.journey-panel-title');
    const panelDesc = root.querySelector('.journey-panel-desc');
    const stops = Array.prototype.slice.call(root.querySelectorAll('.journey-stop'));
    if(!stops.length) return;

    const LEAD = 24;          // run-up before the first stop / run-out past the last
    const TRAVEL_MS = 620;    // one hop
    const DWELL_MS = 2300;    // pause at a stop, description showing
    const GAP_MS = 700;       // blank beat before the loop restarts
    const UNIT_MS = DWELL_MS + TRAVEL_MS;
    const TOTAL_MS = TRAVEL_MS + stops.length * UNIT_MS + GAP_MS;

    let centers = [];
    let railStart = 0, railEnd = 0;
    let lastActive = -2, lastVisited = -1, lastPanel = -1;

    function measure(){
      const trackBox = track.getBoundingClientRect();
      if(!trackBox.width) return false;
      let centerY = 0;
      centers = stops.map(function(stop){
        const box = stop.querySelector('.journey-stop-dot').getBoundingClientRect();
        centerY = box.top - trackBox.top + box.height / 2;
        return box.left - trackBox.left + box.width / 2;
      });
      const lead = Math.min(LEAD, centers[0]);
      railStart = centers[0] - lead;
      railEnd = centers[centers.length - 1] + lead;

      rail.style.left = railStart + 'px';
      rail.style.width = (railEnd - railStart) + 'px';
      rail.style.top = (centerY - 1) + 'px';
      fill.style.left = railStart + 'px';
      fill.style.top = (centerY - 1) + 'px';
      traveler.style.top = centerY + 'px';
      return true;
    }

    function easeInOutCubic(t){
      return t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
    }

    function setPanel(i, shown){
      if(i >= 0 && i !== lastPanel){
        lastPanel = i;
        panelTitle.textContent = stops[i].querySelector('.journey-stop-label').textContent;
        panelDesc.textContent = stops[i].getAttribute('data-desc') || '';
      }
      panel.classList.toggle('show', !!shown);
    }

    function setStops(activeIdx, visitedThrough){
      if(activeIdx === lastActive && visitedThrough === lastVisited) return;
      lastActive = activeIdx;
      lastVisited = visitedThrough;
      stops.forEach(function(stop, i){
        stop.classList.toggle('active', i === activeIdx);
        stop.classList.toggle('visited', i <= visitedThrough && i !== activeIdx);
      });
    }

    function place(x, opacity, parked){
      traveler.style.left = x + 'px';
      traveler.style.opacity = opacity;
      traveler.classList.toggle('parked', !!parked);
      fill.style.width = Math.max(0, x - railStart) + 'px';
    }

    // Position + state are a pure function of where we are in the loop, so a
    // resize or a jump can just re-render at the same time offset.
    function render(t){
      if(!centers.length) return;
      const last = stops.length - 1;

      if(t < TRAVEL_MS){                                   // rolling up to the first stop
        const p = easeInOutCubic(t / TRAVEL_MS);
        place(railStart + (centers[0] - railStart) * p, 1, false);
        setStops(-1, -1);
        setPanel(0, true);
        return;
      }

      const u = t - TRAVEL_MS;
      const i = Math.floor(u / UNIT_MS);

      if(i > last){                                        // blank beat, then restart
        place(railEnd, 0, false);
        setStops(-1, -1);
        setPanel(-1, false);
        return;
      }

      const r = u - i * UNIT_MS;
      if(r < DWELL_MS){                                    // parked at stop i
        place(centers[i], 1, true);
        setStops(i, i);
        setPanel(i, true);
        return;
      }

      const p = easeInOutCubic((r - DWELL_MS) / TRAVEL_MS);
      const to = i === last ? railEnd : centers[i + 1];
      place(centers[i] + (to - centers[i]) * p, i === last ? 1 - p : 1, false);
      setStops(-1, i);
      setPanel(i, false);
    }

    const reduceMotion = window.matchMedia &&
      window.matchMedia('(prefers-reduced-motion: reduce)').matches;

    // Time offset at which stop i's dwell begins — the resume point after a
    // hover/focus jump, and what a manual selection renders.
    function dwellAt(i){ return TRAVEL_MS + i * UNIT_MS; }

    let running = false;
    let rafId = null;
    let t0 = 0;
    let held = null;      // stop index currently pinned by hover/focus/click
    let releaseTimer = null;

    function frame(now){
      if(!running) return;
      render((now - t0) % TOTAL_MS);
      rafId = requestAnimationFrame(frame);
    }

    function start(fromOffset){
      if(running || reduceMotion) return;
      running = true;
      t0 = performance.now() - (fromOffset || 0);
      rafId = requestAnimationFrame(frame);
    }

    function stop(){
      running = false;
      if(rafId != null){ cancelAnimationFrame(rafId); rafId = null; }
    }

    function hold(i){
      clearTimeout(releaseTimer);
      stop();
      held = i;
      root.classList.add('snapping');
      render(dwellAt(i));
    }

    function release(){
      if(held == null) return;
      const from = dwellAt(held);
      held = null;
      root.classList.remove('snapping');
      if(inView) start(from);
    }

    stops.forEach(function(el, i){
      el.addEventListener('mouseenter', function(){ hold(i); });
      el.addEventListener('focus', function(){ hold(i); });
      el.addEventListener('mouseleave', release);
      el.addEventListener('blur', release);
      // Touch: no mouseleave to release on, so hand control back after a beat
      el.addEventListener('click', function(){
        hold(i);
        clearTimeout(releaseTimer);
        releaseTimer = setTimeout(release, 4000);
      });
    });

    let inView = false;
    function activate(){
      inView = true;
      // The track can still be unmeasurable at DOMContentLoaded; by the time it
      // scrolls into view it never is, so take the measurement then instead.
      if(!centers.length) measure();
      if(held == null) start(0);
    }
    function deactivate(){
      inView = false;
      stop();
      if(held == null) render(0);
    }

    function init(){
      measure();
      render(0);
      if(reduceMotion){
        render(dwellAt(0));
        return;
      }
      if('IntersectionObserver' in window){
        new IntersectionObserver(function(entries){
          entries.forEach(function(entry){
            if(entry.isIntersecting) activate(); else deactivate();
          });
        }, {threshold: 0.35}).observe(root);
      } else {
        activate();
      }
    }

    init();

    let resizeTimer = null;
    window.addEventListener('resize', function(){
      clearTimeout(resizeTimer);
      resizeTimer = setTimeout(function(){
        if(!measure()) return;
        if(held != null) render(dwellAt(held));
        else if(running) render((performance.now() - t0) % TOTAL_MS);
        else render(reduceMotion ? dwellAt(0) : 0);
      }, 120);
    });

    // The CDN icon sheet and webfonts can land after first paint and shift the
    // row, so take the geometry again once everything has settled.
    function remeasure(){
      if(!measure()) return;
      if(held != null) render(dwellAt(held));
      else if(!running) render(reduceMotion ? dwellAt(0) : 0);
    }
    if(document.fonts && document.fonts.ready){
      document.fonts.ready.then(remeasure);
    }
    window.addEventListener('load', remeasure);
  })();

  // Account menu — the sign-out button lives behind this toggle on purpose,
  // so leaving is never a single accidental click (the confirm dialog inside
  // signOutUser() is the second layer).
  (function(){
    const menu = document.getElementById('authSignedIn');
    const toggle = document.getElementById('authUserToggle');
    if(!menu || !toggle) return;

    function isOpen(){ return menu.classList.contains('open'); }
    function close(){
      menu.classList.remove('open');
      toggle.setAttribute('aria-expanded', 'false');
    }
    function open(){
      menu.classList.add('open');
      toggle.setAttribute('aria-expanded', 'true');
    }

    toggle.addEventListener('click', function(e){
      e.stopPropagation();
      if(isOpen()) close(); else open();
    });
    document.addEventListener('click', function(e){
      if(isOpen() && !menu.contains(e.target)) close();
    });
    document.addEventListener('keydown', function(e){
      if(e.key === 'Escape' && isOpen()){
        close();
        toggle.focus();
      }
    });
  })();

  // Collapsible left sidebar (calculator page only) — remembers state across
  // visits, same pattern as the theme toggle.
  (function(){
    const sideNav = document.getElementById('sideNav');
    const toggle = document.getElementById('sideNavToggle');
    if(!sideNav || !toggle) return;

    function apply(collapsed){
      sideNav.classList.toggle('collapsed', collapsed);
      toggle.setAttribute('aria-expanded', String(!collapsed));
      toggle.title = collapsed ? 'Expand sidebar' : 'Collapse sidebar';
    }

    let collapsed = false;
    try{ collapsed = localStorage.getItem('sideNavCollapsed') === '1'; }catch(e){}
    apply(collapsed);

    toggle.addEventListener('click', function(){
      collapsed = !collapsed;
      apply(collapsed);
      try{ localStorage.setItem('sideNavCollapsed', collapsed ? '1' : '0'); }catch(e){}
    });
  })();
});

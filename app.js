// =============================================================
// 旅遊分帳 App — Travel Expense Splitter
// =============================================================

// ─── 1. Configuration ────────────────────────────────────────
const CLIENT_ID = '66868160153-7ehvpp3akn4412gdv2rrc6f2g9oj2pur.apps.googleusercontent.com';
const SPREADSHEET_ID = '11ZFd6upOKh8V-ghtmyA-lm-Ej6AR34g0_bsXvlTcOa8';

const DISCOVERY_DOCS = ['https://sheets.googleapis.com/$discovery/rest?version=v4'];
const SCOPES = 'https://www.googleapis.com/auth/spreadsheets';

// Exchange rates: 1 unit of currency = X TWD (approximate, static)
const RATES_TO_TWD = {
  TWD: 1, USD: 32.5, EUR: 35.0, JPY: 0.215, KRW: 0.024,
  THB: 0.92, GBP: 41.0, AUD: 21.0, SGD: 24.0, HKD: 4.2,
  MYR: 7.3, VND: 0.0013, PHP: 0.58, CNY: 4.5
};

const CURRENCY_SYMBOLS = {
  TWD: 'NT$', USD: '$', EUR: '€', JPY: '¥', KRW: '₩',
  THB: '฿', GBP: '£', AUD: 'A$', SGD: 'S$', HKD: 'HK$',
  MYR: 'RM', VND: '₫', PHP: '₱', CNY: '¥'
};

const CURRENCIES = Object.keys(RATES_TO_TWD);

const CATEGORIES = [
  { name: '餐飲美食', icon: 'restaurant' },
  { name: '住宿', icon: 'hotel' },
  { name: '交通', icon: 'directions_car' },
  { name: '景點門票', icon: 'confirmation_number' },
  { name: '購物', icon: 'shopping_bag' },
  { name: '娛樂活動', icon: 'celebration' },
  { name: '機票', icon: 'flight' },
  { name: '通訊網路', icon: 'wifi' },
  { name: '伴手禮', icon: 'redeem' },
  { name: '其他', icon: 'more_horiz' }
];

const AVATAR_COLORS = [
  '#6366F1', '#EC4899', '#F59E0B', '#10B981',
  '#3B82F6', '#EF4444', '#8B5CF6', '#14B8A6',
  '#F97316', '#06B6D4', '#84CC16', '#E11D48'
];

const CHART_COLORS = [
  '#6366F1', '#8B5CF6', '#EC4899', '#F59E0B',
  '#10B981', '#3B82F6', '#EF4444', '#14B8A6',
  '#F97316', '#06B6D4'
];

// ─── 2. State ────────────────────────────────────────────────
let tokenClient;
let gapiInited = false;
let gisInited = false;
let trips = [];
let currentTrip = null;
let expenses = [];
let activeTab = 'overview';
let myChart = null;
let confirmCallback = null;

// ─── 3. Helpers ──────────────────────────────────────────────
const $ = id => document.getElementById(id);

function getAvatarColor(name) {
  let hash = 0;
  for (let i = 0; i < name.length; i++) {
    hash = name.charCodeAt(i) + ((hash << 5) - hash);
  }
  return AVATAR_COLORS[Math.abs(hash) % AVATAR_COLORS.length];
}

function avatarHTML(name, sizeClass = '') {
  const color = getAvatarColor(name);
  const initial = name.charAt(0).toUpperCase();
  return `<div class="avatar ${sizeClass}" style="background:${color}">${initial}</div>`;
}

function formatMoney(amount, currency) {
  const sym = CURRENCY_SYMBOLS[currency] || currency;
  if (Math.abs(amount) >= 1) {
    return `${sym}${Math.round(amount).toLocaleString()}`;
  }
  return `${sym}${amount.toFixed(2)}`;
}

function convertToBase(amount, fromCurrency, baseCurrency) {
  if (fromCurrency === baseCurrency) return amount;
  const inTWD = amount * (RATES_TO_TWD[fromCurrency] || 1);
  return inTWD / (RATES_TO_TWD[baseCurrency] || 1);
}

function getCategoryIcon(catName) {
  const cat = CATEGORIES.find(c => c.name === catName);
  return cat ? cat.icon : 'label';
}

function todayStr() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function formatDateDisplay(dateStr) {
  if (!dateStr) return '';
  const parts = dateStr.split('-');
  if (parts.length === 3) return `${parseInt(parts[1])}/${parseInt(parts[2])}`;
  return dateStr;
}

// ─── 4. Google API Init ──────────────────────────────────────
function gapiLoaded() {
  gapi.load('client', initializeGapiClient);
}

async function initializeGapiClient() {
  await gapi.client.init({ discoveryDocs: DISCOVERY_DOCS });
  gapiInited = true;
  maybeEnableButtons();
}

function gisLoaded() {
  tokenClient = google.accounts.oauth2.initTokenClient({
    client_id: CLIENT_ID,
    scope: SCOPES,
    callback: '',
  });
  gisInited = true;
  maybeEnableButtons();
}

function maybeEnableButtons() {
  if (gapiInited && gisInited) {
    if (!CLIENT_ID || !SPREADSHEET_ID) {
      $('setup-hint').style.display = 'block';
    } else {
      $('welcome-login-btn').style.display = 'flex';
    }
  }
}

// ─── 5. Auth Flow ────────────────────────────────────────────
function handleAuthClick() {
  tokenClient.callback = async (resp) => {
    if (resp.error !== undefined) throw resp;
    await onLoginSuccess();
  };
  if (gapi.client.getToken() === null) {
    tokenClient.requestAccessToken({ prompt: 'consent' });
  } else {
    tokenClient.requestAccessToken({ prompt: '' });
  }
}

function handleSignout() {
  const token = gapi.client.getToken();
  if (token !== null) {
    google.accounts.oauth2.revoke(token.access_token);
    gapi.client.setToken('');
  }
  showScreen('welcome');
}

async function onLoginSuccess() {
  try {
    await ensureSheets();
    await loadTrips();
    showScreen('trips');
  } catch (err) {
    console.error('初始化失敗', err);
    alert('初始化失敗，請確認 Spreadsheet ID 與授權設定');
  }
}

// ─── 6. Screen Management ────────────────────────────────────
function showScreen(name) {
  $('welcome-screen').style.display = 'none';
  $('trip-screen').style.display = 'none';
  $('main-app').style.display = 'none';

  if (name === 'welcome') $('welcome-screen').style.display = 'flex';
  else if (name === 'trips') {
    $('trip-screen').style.display = 'block';
    renderTripList();
  }
  else if (name === 'main') $('main-app').style.display = 'block';
}

// ─── 7. Sheet Management ────────────────────────────────────
async function ensureSheets() {
  const res = await gapi.client.sheets.spreadsheets.get({ spreadsheetId: SPREADSHEET_ID });
  const existing = res.result.sheets.map(s => s.properties.title);
  const requests = [];

  const needTrips = !existing.includes('旅行');
  const needExpenses = !existing.includes('費用');

  if (needTrips) requests.push({ addSheet: { properties: { title: '旅行' } } });
  if (needExpenses) requests.push({ addSheet: { properties: { title: '費用' } } });

  if (requests.length > 0) {
    await gapi.client.sheets.spreadsheets.batchUpdate({
      spreadsheetId: SPREADSHEET_ID,
      resource: { requests }
    });
  }

  if (needTrips) {
    await gapi.client.sheets.spreadsheets.values.update({
      spreadsheetId: SPREADSHEET_ID,
      range: '旅行!A1:E1',
      valueInputOption: 'RAW',
      resource: { values: [['ID', '名稱', '基準貨幣', '成員', '建立日期']] }
    });
  }

  if (needExpenses) {
    await gapi.client.sheets.spreadsheets.values.update({
      spreadsheetId: SPREADSHEET_ID,
      range: '費用!A1:I1',
      valueInputOption: 'RAW',
      resource: { values: [['ID', '旅行ID', '金額', '貨幣', '付款人', '類別', '日期', '說明', '分攤成員']] }
    });
  }
}

// ─── 8. Data CRUD ────────────────────────────────────────────
async function loadTrips() {
  try {
    const res = await gapi.client.sheets.spreadsheets.values.get({
      spreadsheetId: SPREADSHEET_ID,
      range: '旅行!A2:E',
    });
    const rows = res.result.values || [];
    trips = rows.map(row => ({
      id: row[0] || '',
      name: row[1] || '',
      currency: row[2] || 'TWD',
      members: safeJsonParse(row[3], []),
      createdAt: row[4] || ''
    }));
  } catch (err) {
    console.error('讀取旅行失敗', err);
    trips = [];
  }
}

async function saveTrip(trip) {
  await gapi.client.sheets.spreadsheets.values.append({
    spreadsheetId: SPREADSHEET_ID,
    range: '旅行!A:E',
    valueInputOption: 'RAW',
    insertDataOption: 'INSERT_ROWS',
    resource: {
      values: [[trip.id, trip.name, trip.currency, JSON.stringify(trip.members), trip.createdAt]]
    }
  });
}

async function loadExpenses(tripId) {
  try {
    const res = await gapi.client.sheets.spreadsheets.values.get({
      spreadsheetId: SPREADSHEET_ID,
      range: '費用!A2:I',
    });
    const rows = res.result.values || [];
    expenses = rows
      .filter(row => row[1] === tripId)
      .map(row => ({
        id: row[0] || '',
        tripId: row[1] || '',
        amount: Number(row[2]) || 0,
        currency: row[3] || 'TWD',
        paidBy: row[4] || '',
        category: row[5] || '',
        date: row[6] || '',
        description: row[7] || '',
        splitMembers: safeJsonParse(row[8], [])
      }));
  } catch (err) {
    console.error('讀取費用失敗', err);
    expenses = [];
  }
}

async function saveExpense(exp) {
  await gapi.client.sheets.spreadsheets.values.append({
    spreadsheetId: SPREADSHEET_ID,
    range: '費用!A:I',
    valueInputOption: 'RAW',
    insertDataOption: 'INSERT_ROWS',
    resource: {
      values: [[exp.id, exp.tripId, exp.amount, exp.currency, exp.paidBy, exp.category, exp.date, exp.description, JSON.stringify(exp.splitMembers)]]
    }
  });
}

async function deleteExpenseFromSheet(expId) {
  const resSheet = await gapi.client.sheets.spreadsheets.get({ spreadsheetId: SPREADSHEET_ID });
  const sheet = resSheet.result.sheets.find(s => s.properties.title === '費用');
  if (!sheet) throw new Error('找不到「費用」工作表');
  const sheetId = sheet.properties.sheetId;

  const resValues = await gapi.client.sheets.spreadsheets.values.get({
    spreadsheetId: SPREADSHEET_ID,
    range: '費用!A:A',
  });
  const rows = resValues.result.values || [];
  const rowIndex = rows.findIndex(r => r[0] === expId);
  if (rowIndex === -1) throw new Error('找不到該筆費用');

  await gapi.client.sheets.spreadsheets.batchUpdate({
    spreadsheetId: SPREADSHEET_ID,
    resource: {
      requests: [{
        deleteDimension: {
          range: { sheetId, dimension: 'ROWS', startIndex: rowIndex, endIndex: rowIndex + 1 }
        }
      }]
    }
  });
}

async function deleteTripFromSheet(tripId) {
  const resSheet = await gapi.client.sheets.spreadsheets.get({ spreadsheetId: SPREADSHEET_ID });
  const sheet = resSheet.result.sheets.find(s => s.properties.title === '旅行');
  if (!sheet) throw new Error('找不到「旅行」工作表');
  const sheetId = sheet.properties.sheetId;

  const resValues = await gapi.client.sheets.spreadsheets.values.get({
    spreadsheetId: SPREADSHEET_ID,
    range: '旅行!A:A',
  });
  const rows = resValues.result.values || [];
  const rowIndex = rows.findIndex(r => r[0] === tripId);
  if (rowIndex === -1) throw new Error('找不到該旅行');

  await gapi.client.sheets.spreadsheets.batchUpdate({
    spreadsheetId: SPREADSHEET_ID,
    resource: {
      requests: [{
        deleteDimension: {
          range: { sheetId, dimension: 'ROWS', startIndex: rowIndex, endIndex: rowIndex + 1 }
        }
      }]
    }
  });
}

async function updateTripMembers(tripId, newMembers) {
  const res = await gapi.client.sheets.spreadsheets.values.get({
    spreadsheetId: SPREADSHEET_ID,
    range: '旅行!A:A',
  });
  const rows = res.result.values || [];
  const rowIndex = rows.findIndex(r => r[0] === tripId);
  if (rowIndex === -1) return;

  await gapi.client.sheets.spreadsheets.values.update({
    spreadsheetId: SPREADSHEET_ID,
    range: `旅行!D${rowIndex + 1}`,
    valueInputOption: 'RAW',
    resource: { values: [[JSON.stringify(newMembers)]] }
  });
}

async function updateTripName(tripId, newName) {
  const res = await gapi.client.sheets.spreadsheets.values.get({
    spreadsheetId: SPREADSHEET_ID,
    range: '旅行!A:A',
  });
  const rows = res.result.values || [];
  const rowIndex = rows.findIndex(r => r[0] === tripId);
  if (rowIndex === -1) return;

  await gapi.client.sheets.spreadsheets.values.update({
    spreadsheetId: SPREADSHEET_ID,
    range: `旅行!B${rowIndex + 1}`,
    valueInputOption: 'RAW',
    resource: { values: [[newName]] }
  });
}

function safeJsonParse(str, fallback) {
  try { return JSON.parse(str); }
  catch { return fallback; }
}

// ─── 9. Calculation Engine ───────────────────────────────────
function calculateBalances() {
  if (!currentTrip) return {};
  const members = currentTrip.members;
  const balances = {};
  members.forEach(m => { balances[m] = { paid: 0, owed: 0, net: 0 }; });

  expenses.forEach(exp => {
    const amtBase = convertToBase(exp.amount, exp.currency, currentTrip.currency);
    const splitM = exp.splitMembers;
    if (splitM.length === 0) return;
    const perPerson = amtBase / splitM.length;

    if (balances[exp.paidBy]) {
      balances[exp.paidBy].paid += amtBase;
    }

    splitM.forEach(m => {
      if (balances[m]) {
        balances[m].owed += perPerson;
      }
    });
  });

  members.forEach(m => {
    balances[m].net = balances[m].paid - balances[m].owed;
  });

  return balances;
}

function calculateSettlements(balances) {
  const debtors = [];  // net < 0 → owes money
  const creditors = []; // net > 0 → is owed money

  for (const [name, bal] of Object.entries(balances)) {
    if (bal.net < -0.5) debtors.push({ name, amount: Math.abs(bal.net) });
    else if (bal.net > 0.5) creditors.push({ name, amount: bal.net });
  }

  debtors.sort((a, b) => b.amount - a.amount);
  creditors.sort((a, b) => b.amount - a.amount);

  const settlements = [];
  let i = 0, j = 0;
  while (i < debtors.length && j < creditors.length) {
    const transfer = Math.min(debtors[i].amount, creditors[j].amount);
    if (transfer > 0.5) {
      settlements.push({
        from: debtors[i].name,
        to: creditors[j].name,
        amount: transfer
      });
    }
    debtors[i].amount -= transfer;
    creditors[j].amount -= transfer;
    if (debtors[i].amount < 0.5) i++;
    if (creditors[j].amount < 0.5) j++;
  }

  return settlements;
}

// ─── 10. UI Rendering ────────────────────────────────────────

// --- Trip List ---
function renderTripList() {
  const container = $('trip-list');
  if (trips.length === 0) {
    container.innerHTML = `
      <div class="trip-empty">
        <span class="empty-icon"><span class="material-symbols-outlined" style="font-size:64px;color:var(--primary-light)">public</span></span>
        <p>還沒有旅行紀錄<br>點擊右下角 ＋ 新增第一趟旅行！</p>
      </div>`;
    return;
  }

  // Count expenses per trip
  container.innerHTML = trips.map(trip => {
    const memberCount = trip.members.length;
    return `
      <div class="trip-card" data-trip-id="${trip.id}">
        <div class="trip-card-name">${trip.name}</div>
        <div class="trip-card-meta">
          ${memberCount} 位成員 · ${trip.createdAt || ''}
          <span class="currency-badge">${trip.currency}</span>
        </div>
      </div>`;
  }).join('');

  container.querySelectorAll('.trip-card').forEach(card => {
    card.addEventListener('click', () => {
      const tripId = card.getAttribute('data-trip-id');
      selectTrip(tripId);
    });
  });
}

async function selectTrip(tripId) {
  currentTrip = trips.find(t => t.id === tripId);
  if (!currentTrip) return;

  $('current-trip-name').textContent = currentTrip.name;
  $('current-trip-currency').textContent = currentTrip.currency;

  showScreen('main');
  switchTab('overview');

  await loadExpenses(tripId);
  renderAll();
}

// --- Tab switching ---
function switchTab(tabName) {
  activeTab = tabName;

  document.querySelectorAll('.tab-pane').forEach(el => { el.style.display = 'none'; });
  document.querySelectorAll('.tab-item').forEach(el => { el.classList.remove('active'); });

  $(`tab-${tabName}`).style.display = 'block';
  document.querySelector(`.tab-item[data-tab="${tabName}"]`).classList.add('active');
}

// --- Render All ---
function renderAll() {
  renderOverview();
  renderExpenseList();
  renderSettlement();
}

// --- Overview ---
function renderOverview() {
  if (!currentTrip) return;
  const balances = calculateBalances();
  const members = currentTrip.members;
  const base = currentTrip.currency;

  // Total
  let totalBase = 0;
  expenses.forEach(exp => {
    totalBase += convertToBase(exp.amount, exp.currency, base);
  });

  $('total-spent').textContent = formatMoney(totalBase, base);
  $('expense-count').textContent = `${expenses.length} 筆費用 · ${members.length} 位成員`;

  // Member Balances
  const maxAbs = Math.max(...members.map(m => Math.abs(balances[m]?.net || 0)), 1);
  const balContainer = $('member-balances');
  balContainer.innerHTML = members.map(m => {
    const net = balances[m]?.net || 0;
    const cls = net >= 0 ? 'positive' : 'negative';
    const pct = Math.min(Math.abs(net) / maxAbs * 100, 100);
    const sign = net >= 0 ? '+' : '';
    return `
      <div class="balance-card">
        ${avatarHTML(m)}
        <div class="balance-info">
          <div class="balance-name">${m}</div>
          <div class="balance-bar-wrap">
            <div class="balance-bar ${cls}" style="width:${pct}%"></div>
          </div>
        </div>
        <div class="balance-amount ${cls}">${sign}${formatMoney(net, base)}</div>
      </div>`;
  }).join('');

  // Category Chart
  const catData = {};
  expenses.forEach(exp => {
    const amt = convertToBase(exp.amount, exp.currency, base);
    catData[exp.category] = (catData[exp.category] || 0) + amt;
  });
  drawChart(catData);
}

function drawChart(catData) {
  const ctx = $('categoryChart').getContext('2d');
  const labels = Object.keys(catData);
  const values = Object.values(catData);

  if (myChart) myChart.destroy();

  if (labels.length === 0) {
    myChart = new Chart(ctx, {
      type: 'doughnut',
      data: { labels: ['目前無費用'], datasets: [{ data: [1], backgroundColor: ['#E5E7EB'] }] },
      options: {
        responsive: true, maintainAspectRatio: true,
        cutout: '65%',
        plugins: { legend: { display: false }, tooltip: { enabled: false } }
      }
    });
    $('category-legend').innerHTML = '';
    return;
  }

  myChart = new Chart(ctx, {
    type: 'doughnut',
    data: {
      labels,
      datasets: [{
        data: values,
        backgroundColor: CHART_COLORS.slice(0, labels.length),
        borderWidth: 2,
        borderColor: '#FFFFFF',
        hoverOffset: 6
      }]
    },
    options: {
      responsive: true, maintainAspectRatio: true,
      cutout: '65%',
      plugins: {
        legend: { display: false },
        tooltip: {
          backgroundColor: 'rgba(30,27,75,0.9)',
          titleFont: { family: 'Inter' },
          bodyFont: { family: 'Inter' },
          cornerRadius: 8,
          padding: 10
        }
      }
    }
  });

  // Legend
  const total = values.reduce((a, b) => a + b, 0);
  $('category-legend').innerHTML = labels.map((label, i) => {
    const pct = Math.round(values[i] / total * 100);
    return `
      <div class="legend-item">
        <span class="legend-dot" style="background:${CHART_COLORS[i % CHART_COLORS.length]}"></span>
        ${label} (${pct}%)
      </div>`;
  }).join('');
}

// --- Expense List ---
function renderExpenseList() {
  const container = $('expense-list');

  if (expenses.length === 0) {
    container.innerHTML = `
      <div class="expense-empty">
        <span class="material-symbols-outlined">receipt_long</span>
        <p>還沒有費用紀錄<br>點擊 ＋ 新增第一筆費用</p>
      </div>`;
    return;
  }

  // Group by date
  const sorted = [...expenses].sort((a, b) => b.date.localeCompare(a.date));
  const groups = {};
  sorted.forEach(exp => {
    const d = exp.date || '未知日期';
    if (!groups[d]) groups[d] = [];
    groups[d].push(exp);
  });

  let html = '';
  for (const [date, exps] of Object.entries(groups)) {
    html += `<div class="expense-date-group">`;
    html += `<div class="expense-date-label">${date}</div>`;
    exps.forEach(exp => {
      const icon = getCategoryIcon(exp.category);
      const splitCount = exp.splitMembers.length;
      html += `
        <div class="expense-card" data-exp-id="${exp.id}">
          <div class="expense-icon">
            <span class="material-symbols-outlined">${icon}</span>
          </div>
          <div class="expense-info">
            <div class="expense-desc">${exp.description || exp.category}</div>
            <div class="expense-meta">
              <span class="expense-payer-badge">
                ${avatarHTML(exp.paidBy, 'avatar-xs')}
                ${exp.paidBy} 付
              </span>
              · ${splitCount}人分攤
            </div>
          </div>
          <div class="expense-right">
            <div class="expense-amount">${formatMoney(exp.amount, exp.currency)}</div>
            ${exp.currency !== currentTrip.currency ? `<div class="expense-currency-label">≈ ${formatMoney(convertToBase(exp.amount, exp.currency, currentTrip.currency), currentTrip.currency)}</div>` : ''}
          </div>
          <button class="expense-delete-btn" title="刪除" onclick="event.stopPropagation(); handleDeleteExpense('${exp.id}')">
            <span class="material-symbols-outlined" style="font-size:18px">close</span>
          </button>
        </div>`;
    });
    html += `</div>`;
  }

  container.innerHTML = html;
}

// --- Settlement ---
function renderSettlement() {
  const balances = calculateBalances();
  const settlements = calculateSettlements(balances);
  const container = $('settlement-list');
  const base = currentTrip ? currentTrip.currency : 'TWD';

  if (settlements.length === 0) {
    container.innerHTML = `
      <div class="settlement-empty">
        <span class="material-symbols-outlined">check_circle</span>
        <p>大家都已結清！<span class="material-symbols-outlined" style="font-size:18px;vertical-align:middle;color:var(--success)">celebration</span></p>
      </div>`;
    return;
  }

  container.innerHTML = settlements.map(s => `
    <div class="settlement-card">
      <div class="settlement-from">
        ${avatarHTML(s.from)}
        <span>${s.from}</span>
      </div>
      <div class="settlement-arrow">
        <div class="settlement-amount">${formatMoney(s.amount, base)}</div>
        <div class="settlement-arrow-line">
          <span class="material-symbols-outlined">arrow_forward</span>
        </div>
      </div>
      <div class="settlement-to">
        ${avatarHTML(s.to)}
        <span>${s.to}</span>
      </div>
    </div>
  `).join('');
}

// ─── 11. Modal Helpers ───────────────────────────────────────
function openModal(id) {
  $(id).style.display = 'flex';
}

function closeModal(id) {
  $(id).style.display = 'none';
}

function showConfirm(title, message, callback) {
  $('confirm-title').textContent = title;
  $('confirm-message').textContent = message;
  confirmCallback = callback;
  openModal('modal-confirm');
}

// Close modal on overlay click
document.querySelectorAll('.modal-overlay').forEach(overlay => {
  overlay.addEventListener('click', (e) => {
    if (e.target === overlay) {
      overlay.style.display = 'none';
    }
  });
});

// ─── 12. Populate Form Options ──────────────────────────────
function populateCurrencySelects() {
  const optionsHtml = CURRENCIES.map(c => {
    const sym = CURRENCY_SYMBOLS[c] || c;
    return `<option value="${c}">${c} (${sym})</option>`;
  }).join('');

  $('trip-currency').innerHTML = optionsHtml;
  $('exp-currency').innerHTML = optionsHtml;
}

function populateCategorySelect() {
  $('exp-category').innerHTML = '<option value="" disabled selected>選擇類別</option>' +
    CATEGORIES.map(c => `<option value="${c.name}">${c.name}</option>`).join('');
}

function populateExpenseFormForTrip() {
  if (!currentTrip) return;

  // Paid-by select
  $('exp-paid-by').innerHTML = '<option value="" disabled selected>選擇付款人</option>' +
    currentTrip.members.map(m => `<option value="${m}">${m}</option>`).join('');

  // Currency default
  $('exp-currency').value = currentTrip.currency;

  // Split members
  const splitContainer = $('split-members');
  splitContainer.innerHTML = currentTrip.members.map(m => `
    <label class="split-member-chip active" data-member="${m}">
      ${avatarHTML(m, 'avatar-xs')}
      ${m}
    </label>
  `).join('');

  splitContainer.querySelectorAll('.split-member-chip').forEach(chip => {
    chip.addEventListener('click', () => {
      chip.classList.toggle('active');
    });
  });

  // Date default
  $('exp-date').value = todayStr();
}

// ─── 13. Event Handlers ─────────────────────────────────────

// Login / Logout
$('welcome-login-btn').addEventListener('click', handleAuthClick);
$('logout-btn-trips').addEventListener('click', handleSignout);

// Back to trips
$('back-to-trips').addEventListener('click', async () => {
  await loadTrips();
  showScreen('trips');
});

// Tab bar
document.querySelectorAll('.tab-item').forEach(item => {
  item.addEventListener('click', () => {
    switchTab(item.getAttribute('data-tab'));
  });
});

// FAB — New Trip
$('new-trip-btn').addEventListener('click', () => {
  $('trip-form').reset();
  $('trip-form-msg').textContent = '';
  openModal('modal-new-trip');
});

// FAB — New Expense
$('add-expense-fab').addEventListener('click', () => {
  $('expense-form').reset();
  $('exp-msg').textContent = '';
  populateExpenseFormForTrip();
  openModal('modal-new-expense');
});

// Trip Settings
$('trip-settings-btn').addEventListener('click', () => {
  renderSettingsModal();
  openModal('modal-trip-settings');
});

// Select All Members
$('select-all-members').addEventListener('click', () => {
  const chips = $('split-members').querySelectorAll('.split-member-chip');
  const allActive = [...chips].every(c => c.classList.contains('active'));
  chips.forEach(c => {
    if (allActive) c.classList.remove('active');
    else c.classList.add('active');
  });
});

// Confirm modal buttons
$('confirm-cancel').addEventListener('click', () => {
  closeModal('modal-confirm');
  confirmCallback = null;
});

$('confirm-ok').addEventListener('click', async () => {
  closeModal('modal-confirm');
  if (confirmCallback) {
    await confirmCallback();
    confirmCallback = null;
  }
});

// ─── 14. Form Submissions ────────────────────────────────────

// Create Trip
$('trip-form').addEventListener('submit', async (e) => {
  e.preventDefault();
  const btn = $('trip-submit-btn');
  const msg = $('trip-form-msg');
  btn.disabled = true;
  btn.textContent = '建立中...';

  const name = $('trip-name').value.trim();
  const currency = $('trip-currency').value;
  const membersStr = $('trip-members').value.trim();

  if (!name || !membersStr) {
    msg.className = 'form-msg error';
    msg.textContent = '請填寫所有欄位';
    btn.disabled = false;
    btn.textContent = '建立旅行';
    return;
  }

  const members = membersStr.split(/[,，]/).map(s => s.trim()).filter(Boolean);
  if (members.length < 2) {
    msg.className = 'form-msg error';
    msg.textContent = '至少需要 2 位成員';
    btn.disabled = false;
    btn.textContent = '建立旅行';
    return;
  }

  const trip = {
    id: Date.now().toString(),
    name,
    currency,
    members,
    createdAt: todayStr()
  };

  try {
    await saveTrip(trip);
    trips.push(trip);
    closeModal('modal-new-trip');
    renderTripList();
    msg.className = 'form-msg success';
    msg.textContent = '建立成功！';
  } catch (err) {
    console.error('建立旅行失敗', err);
    msg.className = 'form-msg error';
    msg.textContent = '建立失敗，請重試';
  } finally {
    btn.disabled = false;
    btn.textContent = '建立旅行';
  }
});

// Create Expense
$('expense-form').addEventListener('submit', async (e) => {
  e.preventDefault();
  const btn = $('exp-submit-btn');
  const msg = $('exp-msg');
  btn.disabled = true;
  btn.textContent = '新增中...';

  const amount = parseFloat($('exp-amount').value);
  const currency = $('exp-currency').value;
  const description = $('exp-description').value.trim();
  const date = $('exp-date').value;
  const category = $('exp-category').value;
  const paidBy = $('exp-paid-by').value;

  const activeChips = $('split-members').querySelectorAll('.split-member-chip.active');
  const splitMembers = [...activeChips].map(c => c.getAttribute('data-member'));

  if (!amount || amount <= 0) {
    msg.className = 'form-msg error';
    msg.textContent = '請輸入有效金額';
    btn.disabled = false;
    btn.textContent = '新增費用';
    return;
  }

  if (!paidBy) {
    msg.className = 'form-msg error';
    msg.textContent = '請選擇付款人';
    btn.disabled = false;
    btn.textContent = '新增費用';
    return;
  }

  if (splitMembers.length === 0) {
    msg.className = 'form-msg error';
    msg.textContent = '請至少選擇一位分攤成員';
    btn.disabled = false;
    btn.textContent = '新增費用';
    return;
  }

  const exp = {
    id: Date.now().toString(),
    tripId: currentTrip.id,
    amount,
    currency,
    paidBy,
    category,
    date,
    description,
    splitMembers
  };

  try {
    await saveExpense(exp);
    expenses.push(exp);
    closeModal('modal-new-expense');
    renderAll();
    msg.className = 'form-msg success';
    msg.textContent = '新增成功！';
  } catch (err) {
    console.error('新增費用失敗', err);
    msg.className = 'form-msg error';
    msg.textContent = '新增失敗，請重試';
  } finally {
    btn.disabled = false;
    btn.textContent = '新增費用';
  }
});

// Delete Expense
async function handleDeleteExpense(expId) {
  const exp = expenses.find(e => e.id === expId);
  if (!exp) return;

  showConfirm(
    '確認刪除費用？',
    `即將刪除「${exp.description || exp.category}」，此操作無法復原。`,
    async () => {
      try {
        await deleteExpenseFromSheet(expId);
        expenses = expenses.filter(e => e.id !== expId);
        renderAll();
      } catch (err) {
        console.error('刪除費用失敗', err);
        alert('刪除失敗，請重試');
      }
    }
  );
}

// ─── 15. Trip Settings Modal ─────────────────────────────────
function renderSettingsModal() {
  if (!currentTrip) return;

  const tripNameInput = $('edit-trip-name');
  if (tripNameInput) tripNameInput.value = currentTrip.name;

  const memberList = $('settings-member-list');
  memberList.innerHTML = currentTrip.members.map(m => `
    <div class="settings-member-tag">
      ${avatarHTML(m, 'avatar-xs')}
      ${m}
      <button type="button" class="member-edit-btn" title="重新命名成員" onclick="handleRenameMember('${m}')">
        <span class="material-symbols-outlined">edit</span>
      </button>
      <button type="button" class="member-delete-btn" title="刪除成員" onclick="handleDeleteMember('${m}')">
        <span class="material-symbols-outlined">close</span>
      </button>
    </div>
  `).join('');
}

// Delete Member
function handleDeleteMember(memberName) {
  if (!currentTrip) return;
  if (currentTrip.members.length <= 2) {
    alert('旅行至少需要 2 位成員，無法再刪除');
    return;
  }
  
  const hasExpenses = expenses.some(exp => exp.paidBy === memberName || exp.splitMembers.includes(memberName));
  if (hasExpenses) {
    alert('此成員已有相關費用紀錄，無法刪除');
    return;
  }

  showConfirm(
    '確認刪除成員？',
    `確定要從此旅行中刪除成員「${memberName}」嗎？`,
    async () => {
      const originalMembers = [...currentTrip.members];
      try {
        currentTrip.members = currentTrip.members.filter(m => m !== memberName);
        await updateTripMembers(currentTrip.id, currentTrip.members);
        renderSettingsModal();
        renderAll();
      } catch (err) {
        console.error('刪除成員失敗', err);
        currentTrip.members = originalMembers;
        alert('刪除失敗，請重試');
      }
    }
  );
}

// Rename Member
function handleRenameMember(oldName) {
  if (!currentTrip) return;
  const newName = prompt(`為成員「${oldName}」輸入新的名稱:`, oldName);
  if (!newName || newName.trim() === '' || newName.trim() === oldName) return;
  
  const trimmedName = newName.trim();
  if (currentTrip.members.includes(trimmedName)) {
    alert('此名稱已被其他成員使用');
    return;
  }

  const memberIndex = currentTrip.members.indexOf(oldName);
  if (memberIndex === -1) return;

  const affectedExpenses = expenses.filter(exp => exp.paidBy === oldName || exp.splitMembers.includes(oldName));

  showConfirm(
    '確認重新命名？',
    `將「${oldName}」重新命名為「${trimmedName}」？這將一併更新 ${affectedExpenses.length} 筆相關的費用紀錄。`,
    async () => {
      try {
        currentTrip.members[memberIndex] = trimmedName;
        
        affectedExpenses.forEach(exp => {
          if (exp.paidBy === oldName) exp.paidBy = trimmedName;
          const sIdx = exp.splitMembers.indexOf(oldName);
          if (sIdx !== -1) exp.splitMembers[sIdx] = trimmedName;
        });

        await updateTripMembers(currentTrip.id, currentTrip.members);

        if (affectedExpenses.length > 0) {
          const resValues = await gapi.client.sheets.spreadsheets.values.get({
            spreadsheetId: SPREADSHEET_ID,
            range: '費用!A:A',
          });
          const expenseSheetRows = resValues.result.values || [];
          
          const updateRequests = [];
          for (const exp of affectedExpenses) {
            const rowIndex = expenseSheetRows.findIndex(r => r[0] === exp.id);
            if (rowIndex !== -1) {
               updateRequests.push({
                 range: `費用!E${rowIndex + 1}:I${rowIndex+1}`,
                 values: [[
                   exp.paidBy,
                   exp.category,
                   exp.date,
                   exp.description,
                   JSON.stringify(exp.splitMembers)
                 ]]
               });
            }
          }

          if (updateRequests.length > 0) {
            await gapi.client.sheets.spreadsheets.values.batchUpdate({
              spreadsheetId: SPREADSHEET_ID,
              resource: {
                valueInputOption: 'RAW',
                data: updateRequests
              }
            });
          }
        }
        
        renderSettingsModal();
        renderAll();
      } catch (err) {
        console.error('重新命名失敗', err);
        alert('重新命名失敗，請重試');
        selectTrip(currentTrip.id);
      }
    }
  );
}

// Rename Trip
$('edit-trip-btn').addEventListener('click', async () => {
  const input = $('edit-trip-name');
  const newName = input.value.trim();
  if (!newName) return;
  if (newName === currentTrip.name) {
    alert('名稱未變更');
    return;
  }

  const btn = $('edit-trip-btn');
  btn.disabled = true;
  btn.textContent = '...';

  const oldTripName = currentTrip.name;
  try {
    currentTrip.name = newName;
    await updateTripName(currentTrip.id, newName);
    
    const tripToUpdate = trips.find(t => t.id === currentTrip.id);
    if (tripToUpdate) tripToUpdate.name = newName;

    $('current-trip-name').textContent = newName;
    alert('旅行名稱已更新');
  } catch (err) {
    console.error('更新旅行名稱失敗', err);
    currentTrip.name = oldTripName;
    input.value = oldTripName;
    alert('更新失敗，請重試');
  } finally {
    btn.disabled = false;
    btn.textContent = '儲存';
  }
});

// Add Member
$('add-member-btn').addEventListener('click', async () => {
  const input = $('new-member-name');
  const name = input.value.trim();
  if (!name) return;
  if (currentTrip.members.includes(name)) {
    alert('此成員已存在');
    return;
  }

  const btn = $('add-member-btn');
  btn.disabled = true;
  btn.textContent = '...';

  try {
    currentTrip.members.push(name);
    await updateTripMembers(currentTrip.id, currentTrip.members);
    renderSettingsModal();
    input.value = '';
    renderAll();
  } catch (err) {
    console.error('新增成員失敗', err);
    currentTrip.members.pop();
    alert('新增失敗，請重試');
  } finally {
    btn.disabled = false;
    btn.textContent = '新增';
  }
});

// Delete Trip
$('delete-trip-btn').addEventListener('click', () => {
  showConfirm(
    '確認刪除旅行？',
    `即將刪除「${currentTrip.name}」及所有相關費用，此操作無法復原。`,
    async () => {
      try {
        closeModal('modal-trip-settings');
        await deleteTripFromSheet(currentTrip.id);
        trips = trips.filter(t => t.id !== currentTrip.id);
        currentTrip = null;
        showScreen('trips');
      } catch (err) {
        console.error('刪除旅行失敗', err);
        alert('刪除失敗，請重試');
      }
    }
  );
});

// ─── 16. Initialize ──────────────────────────────────────────
populateCurrencySelects();
populateCategorySelect();

window.onload = function () {
  if (typeof gapi !== 'undefined' && typeof google !== 'undefined') {
    gapiLoaded();
    gisLoaded();
  }
};

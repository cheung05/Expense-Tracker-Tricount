// -------------------------------------------------------------
// 1. 設定區：請填寫您事先建立好的 API 憑證與試算表 ID
// -------------------------------------------------------------
const CLIENT_ID = '66868160153-7ehvpp3akn4412gdv2rrc6f2g9oj2pur.apps.googleusercontent.com'; // 請填寫您的 Google OAuth Client ID
const SPREADSHEET_ID = '1klgg3gxkWnbl8IyvpSpprUvN-W0fJXHGUoXxu9E6YZQ'; // 請填寫您的 Google Spreadsheet ID

// Google API 設定
const DISCOVERY_DOCS = ["https://sheets.googleapis.com/$discovery/rest?version=v4"];
const SCOPES = "https://www.googleapis.com/auth/spreadsheets";

let tokenClient;
let gapiInited = false;
let gisInited = false;
let myChart = null;

let optionsData = {
    incomeCategories: ['交通運輸', '其他雜項'],
    expenseCategories: ['餐飲食品', '交通運輸', '居家生活', '休閒娛樂', '學習成長', '醫療保健', '購物服飾', '其他雜項'],
    payments: ['現金 (Cash)', '信用卡 (Credit Card)', '簽帳金融卡 (Debit Card / ATM 轉帳)', '電子支付 (LINE Pay, Apple Pay, 街口支付)', '電子票證 (悠遊卡, 一卡通)']
};

// --- DOM 準備 ---
const loginBtn = document.getElementById('welcome-login-btn');
const logoutBtn = document.getElementById('logout-btn');
loginBtn.addEventListener('click', handleAuthClick);
logoutBtn.addEventListener('click', handleSignoutClick);

// 歷史資料快取與月份狀態
let cachedRecords = [];
let currentViewDate = new Date();
const monthNames = ["1月", "2月", "3月", "4月", "5月", "6月",
    "7月", "8月", "9月", "10月", "11月", "12月"];

function updateMonthDisplay() {
    document.getElementById('month-title').innerHTML = `${monthNames[currentViewDate.getMonth()]}<br><span>${currentViewDate.getFullYear()}</span>`;
    filterAndRenderRecords();
}

document.getElementById('prev-month-btn').addEventListener('click', () => {
    currentViewDate.setMonth(currentViewDate.getMonth() - 1);
    updateMonthDisplay();
});
document.getElementById('next-month-btn').addEventListener('click', () => {
    currentViewDate.setMonth(currentViewDate.getMonth() + 1);
    updateMonthDisplay();
});

// 初始顯示
updateMonthDisplay();

// -------------------------------------------------------------
// 2. 初始化流程
// -------------------------------------------------------------
function checkEnv() {
    if (!CLIENT_ID || !SPREADSHEET_ID) {
        document.getElementById('setup-hint').style.display = 'block';
    } else {
        document.getElementById('welcome-login-btn').style.display = 'inline-block';
    }
}

function gapiLoaded() { gapi.load('client', initializeGapiClient); }
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
    if (gapiInited && gisInited) { checkEnv(); }
}

// -------------------------------------------------------------
// 3. 認證流程與介面切換
// -------------------------------------------------------------
function handleAuthClick() {
    tokenClient.callback = async (resp) => {
        if (resp.error !== undefined) throw (resp);
        showMainApp();
        await fetchOptionsData();
        await fetchRecordsData();
    };
    if (gapi.client.getToken() === null) {
        tokenClient.requestAccessToken({ prompt: 'consent' });
    } else {
        tokenClient.requestAccessToken({ prompt: '' });
    }
}
function handleSignoutClick() {
    const token = gapi.client.getToken();
    if (token !== null) {
        google.accounts.oauth2.revoke(token.access_token);
        gapi.client.setToken('');
        document.getElementById('welcome-screen').style.display = 'flex';
        document.getElementById('main-content').style.display = 'none';
        document.getElementById('logout-btn').style.display = 'none';
    }
}
function showMainApp() {
    document.getElementById('welcome-screen').style.display = 'none';
    document.getElementById('main-content').style.display = 'block';
    document.getElementById('logout-btn').style.display = 'inline-block';
    document.getElementById('date').valueAsDate = new Date();
}

// -------------------------------------------------------------
// 4. API 溝通邏輯 (讀取選項與記帳紀錄)
// -------------------------------------------------------------
async function fetchOptionsData() {
    try {
        document.getElementById('category-grid').innerHTML = '<div class="loading-state">載入分類中...</div>';
        const response = await gapi.client.sheets.spreadsheets.values.get({
            spreadsheetId: SPREADSHEET_ID,
            range: '欄位表!A2:C',
        });
        const rows = response.result.values;
        if (!rows || rows.length === 0) {
            populateSelectOptions(); 
            return;
        }

        optionsData.incomeCategories = [];
        optionsData.expenseCategories = [];
        optionsData.payments = [];
        let lastType = '';
        rows.forEach(row => {
            const currentType = row[0] || lastType;
            if (row[0]) lastType = row[0];
            const category = row[1];
            const payment = row[2];
            if (currentType === '收入' && category) optionsData.incomeCategories.push(category);
            if (currentType === '支出' && category) optionsData.expenseCategories.push(category);
            if (payment) optionsData.payments.push(payment);
        });

        populateSelectOptions();
    } catch (err) { 
        console.error('取得欄位表錯誤，將使用預設設定', err); 
        populateSelectOptions();
    }
}

const typeSelect = document.getElementById('type');
typeSelect.addEventListener('change', () => {
    renderCategoryOptions();
});

function populateSelectOptions() {
    const paymentSelect = document.getElementById('payment');
    paymentSelect.innerHTML = '<option value="" disabled selected>請選擇付款方式...</option>';
    optionsData.payments.forEach(p => {
        paymentSelect.innerHTML += `<option value="${p}">${p}</option>`;
    });

    // Enable submit mechanism
    document.getElementById('submit-btn').disabled = false;
    renderCategoryOptions();
}

function renderCategoryOptions() {
    const categorySelect = document.getElementById('category');
    categorySelect.innerHTML = '<option value="" disabled selected>請選擇類別...</option>';

    const selectedType = typeSelect.value;
    const validCategories = selectedType === '支出' ? optionsData.expenseCategories : optionsData.incomeCategories;

    validCategories.forEach(c => {
        categorySelect.innerHTML += `<option value="${c}">${c}</option>`;
    });
}

// 解析 Google Sheets 的日期（處理 Excel 序號與各種格式）
function parseSheetDate(dateVal) {
    if (!dateVal) return '';
    // 如果是純數字且長度看似日期序號 (如 46126)
    if (!isNaN(Number(dateVal))) {
        const days = Number(dateVal);
        const excelEpoch = new Date(Date.UTC(1899, 11, 30));
        const jsDate = new Date(excelEpoch.getTime() + days * 86400000);
        return jsDate.toISOString().split('T')[0];
    }
    return String(dateVal).replace(/\//g, '-');
}

// 動態對應文字為 Icon
function getIconForCategory(catName) {
    const rules = {
        '餐飲': 'restaurant', '食': 'restaurant',
        '交通': 'directions_car', '車': 'directions_car', '運輸': 'directions_subway',
        '居家': 'home', '租': 'home', '電費': 'electric_bolt',
        '休閒': 'sports_esports', '娛樂': 'movie', '樂': 'attractions',
        '醫療': 'medical_services', '保健': 'healing',
        '服飾': 'checkroom', '購物': 'shopping_bag',
        '學習': 'school', '其他': 'category', '雜項': 'interests'
    };
    for (const key in rules) {
        if (catName && catName.includes(key)) return rules[key];
    }
    return 'label';
}

// -------------------------------------------------------------
// 讀取歷史與重新繪表
// -------------------------------------------------------------
async function fetchRecordsData() {
    try {
        const response = await gapi.client.sheets.spreadsheets.values.get({
            spreadsheetId: SPREADSHEET_ID,
            range: '記帳紀錄!A2:G',
        });
        const rows = response.result.values || [];
        cachedRecords = rows;
        filterAndRenderRecords();
    } catch (err) {
        console.error('讀取紀錄失敗', err);
        document.getElementById('transaction-list').innerHTML = `<div class="loading-state">讀取失敗，請確認欄位與配置。</div>`;
    }
}

function filterAndRenderRecords() {
    const year = currentViewDate.getFullYear();
    const month = String(currentViewDate.getMonth() + 1).padStart(2, '0');
    const filterPrefix = `${year}-${month}`;

    const filteredRows = cachedRecords.filter(row => {
        const d = parseSheetDate(row[1]);
        return d && d.startsWith(filterPrefix);
    });

    renderTable(filteredRows);
    renderChartStats(filteredRows);
}

function renderTable(rows) {
    const container = document.getElementById('transaction-list');
    container.innerHTML = '';
    if (rows.length === 0) {
        container.innerHTML = `<div class="loading-state">目前尚無紀錄</div>`;
        return;
    }

    const recentRows = [...rows].reverse();
    recentRows.forEach(row => {
        let [id, date, type, category, amount, description, payment] = row;
        date = parseSheetDate(date);
        const iconInfo = getIconForCategory(category || '');
        let amoutCls = type === '收入' ? 'income' : '';
        let amoutPrefix = type === '收入' ? '+' : '-';

        const item = document.createElement('div');
        item.className = 'timeline-item';
        item.innerHTML = `
            <div class="timeline-icon">
                <span class="material-symbols-outlined">${iconInfo}</span>
            </div>
            <div class="timeline-content">
                <div class="timeline-title">${category} <span style="font-size: 0.75em; font-weight: 400; color:#64748B">(${payment})</span></div>
                <div class="timeline-date">${date} ${description ? ('· ' + description) : ''}</div>
            </div>
            <div class="timeline-amount ${amoutCls}" style="margin-right: 0.5rem;">${amoutPrefix} ${Number(amount).toLocaleString()} $</div>
            <button class="delete-btn icon-btn-small" style="color: #ef4444;" title="刪除">
                <span class="material-symbols-outlined" style="font-size: 20px; pointer-events: none;">delete</span>
            </button>
        `;
        
        item.querySelector('.delete-btn').addEventListener('click', () => deleteRecord(id));
        container.appendChild(item);
    });
}

function renderChartStats(rows) {
    let totalExpense = 0;
    let totalIncome = 0;
    let categoryExpenses = {};

    rows.forEach(row => {
        const type = row[2];
        const category = row[3];
        const amount = Number(row[4] || 0);

        if (type === '支出') {
            totalExpense += amount;
            categoryExpenses[category] = (categoryExpenses[category] || 0) + amount;
        } else if (type === '收入') { totalIncome += amount; }
    });

    document.getElementById('total-expense').innerText = totalExpense.toLocaleString() + ' $';

    // 如果沒有總支出，將圖表中心字為空白
    if (totalExpense === 0) {
        document.getElementById('chart-center-pct').innerText = '0%';
        drawPieChart({});
        return;
    }

    // 取得最大屏除佔比，繪製至中間
    let maxCat = '';
    let maxVal = 0;
    for (let k in categoryExpenses) {
        if (categoryExpenses[k] > maxVal) { maxVal = categoryExpenses[k]; maxCat = k; }
    }
    const pct = Math.round((maxVal / totalExpense) * 100);
    document.getElementById('chart-center-pct').innerHTML = `${pct}%<br><span style="font-size:0.6em;color:var(--text-muted);font-weight:500">${maxCat}</span>`;

    drawPieChart(categoryExpenses);
}

// -------------------------------------------------------------
// 繪製半圓環狀圖 Chart.js (Half-doughnut)
// -------------------------------------------------------------
function drawPieChart(dataObj) {
    const ctx = document.getElementById('categoryChart').getContext('2d');
    const labels = Object.keys(dataObj);
    const dataValues = Object.values(dataObj);

    if (myChart) myChart.destroy();

    const colors = ['#1D4ED8', '#60A5FA', '#93C5FD', '#BFDBFE', '#E0E7FF'];

    if (labels.length === 0) {
        myChart = new Chart(ctx, {
            type: 'doughnut',
            data: { labels: ['目前無支出'], datasets: [{ data: [1], backgroundColor: ['#E2E8F0'] }] },
            options: {
                responsive: true, maintainAspectRatio: false,
                rotation: -90, circumference: 180, cutout: '75%', // Key layout elements
                plugins: { legend: { display: false }, tooltip: { enabled: false } }
            }
        });
        return;
    }

    myChart = new Chart(ctx, {
        type: 'doughnut',
        data: {
            labels: labels,
            datasets: [{
                data: dataValues,
                backgroundColor: colors.slice(0, dataValues.length).concat('#3B82F6'), // Fill if not enough
                borderWidth: 2,
                borderColor: '#ffffff',
                hoverOffset: 4
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            rotation: -90,        // start drawing halfway around the circle
            circumference: 180,   // draw only a half circle
            cutout: '75%',        // inner hole radius
            plugins: {
                legend: { display: false } // legend is off according to design screenshot
            }
        }
    });
}

// -------------------------------------------------------------
// 表單送出 (確保需點選舉類別)
// -------------------------------------------------------------
const form = document.getElementById('expense-form');
form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const btn = document.getElementById('submit-btn');
    const msg = document.getElementById('form-msg');

    const category = document.getElementById('category').value;
    if (!category) {
        msg.className = 'form-msg error';
        msg.innerText = '請先點選並選擇上方任一分類！';
        return;
    }

    btn.disabled = true;
    btn.innerText = '...';
    msg.className = 'form-msg';
    msg.innerText = '';

    const date = document.getElementById('date').value;
    const type = document.getElementById('type').value;
    const amount = document.getElementById('amount').value;
    const payment = document.getElementById('payment').value;
    const description = document.getElementById('description').value;
    const id = new Date().getTime().toString();

    const values = [[id, date, type, category, amount, description, payment]];

    try {
        await gapi.client.sheets.spreadsheets.values.append({
            spreadsheetId: SPREADSHEET_ID,
            range: '記帳紀錄!A:G',
            valueInputOption: 'USER_ENTERED',
            insertDataOption: 'INSERT_ROWS',
            resource: { values: values },
        });

        msg.className = 'form-msg success';
        msg.innerText = '成功新增！';

        document.getElementById('amount').value = '';
        document.getElementById('description').value = '';

        fetchRecordsData(); // update left / top side
    } catch (err) {
        console.error('寫入失敗', err);
        msg.className = 'form-msg error';
        msg.innerText = '發生錯誤！請檢查連線與授權狀態';
    } finally {
        btn.disabled = false;
        btn.innerText = '新增';
        setTimeout(() => msg.innerText = '', 3000);
    }
});

let currentDeleteId = null;

function deleteRecord(id) {
    currentDeleteId = id;
    document.getElementById('confirm-modal').style.display = 'flex';
}

function closeDeleteModal() {
    document.getElementById('confirm-modal').style.display = 'none';
    currentDeleteId = null;
}

document.getElementById('cancel-delete-btn').addEventListener('click', closeDeleteModal);

document.getElementById('confirm-delete-btn').addEventListener('click', async () => {
    if (!currentDeleteId) return;
    
    const btn = document.getElementById('confirm-delete-btn');
    const originalText = btn.innerText;
    btn.disabled = true;
    btn.innerText = '刪除中...';

    try {
        const spreadsheetId = SPREADSHEET_ID;
        
        // 取得 sheetId
        const resSheet = await gapi.client.sheets.spreadsheets.get({
            spreadsheetId: spreadsheetId,
        });
        const sheet = resSheet.result.sheets.find(s => s.properties.title === '記帳紀錄');
        if (!sheet) throw new Error('找不到「記帳紀錄」工作表');
        const sheetId = sheet.properties.sheetId;

        // 尋找對應的列數
        const resValues = await gapi.client.sheets.spreadsheets.values.get({
            spreadsheetId: spreadsheetId,
            range: '記帳紀錄!A:A',
        });
        const rows = resValues.result.values || [];
        const rowIndex = rows.findIndex(row => row[0] === currentDeleteId);
        
        if (rowIndex === -1) {
            alert('找不到該筆紀錄，可能已被刪除');
            closeDeleteModal();
            return;
        }

        // 執行刪除
        await gapi.client.sheets.spreadsheets.batchUpdate({
            spreadsheetId: spreadsheetId,
            resource: {
                requests: [
                    {
                        deleteDimension: {
                            range: {
                                sheetId: sheetId,
                                dimension: 'ROWS',
                                startIndex: rowIndex,
                                endIndex: rowIndex + 1
                            }
                        }
                    }
                ]
            }
        });
        
        // 重新讀取資料
        await fetchRecordsData();
        closeDeleteModal();
    } catch(err) {
        console.error('刪除失敗', err);
        alert('刪除失敗！請檢查連線與授權狀態');
    } finally {
        btn.disabled = false;
        btn.innerText = originalText;
    }
});

window.onload = function () {
    if (typeof gapi !== 'undefined' && typeof google !== 'undefined') {
        gapiLoaded();
        gisLoaded();
    }
}

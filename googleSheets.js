const os = require('os');
const path = require('path');
const fs = require('fs');

const depPaths = [
  path.join(os.tmpdir(), 'qlcv_deps', 'node_modules'),
  'C:/Users/buith/AppData/Local/Temp/qlcv_deps/node_modules'
];
for (const p of depPaths) {
  if (fs.existsSync(p)) {
    if (require('module').globalPaths && !require('module').globalPaths.includes(p)) {
      require('module').globalPaths.push(p);
    }
    if (!module.paths.includes(p)) {
      module.paths.unshift(p);
    }
  }
}

require('dotenv').config();
const { google } = require('googleapis');

// Cấu hình Service Account cho Google Sheets API
const SERVICE_ACCOUNT_EMAIL = 'qlcv-417@qlcv-505501.iam.gserviceaccount.com';

function getGoogleCredentials() {
  // Option 1: Chuỗi JSON nguyên bản từ GOOGLE_SERVICE_ACCOUNT_JSON hoặc GOOGLE_CREDENTIALS_JSON
  const rawJson = process.env.GOOGLE_SERVICE_ACCOUNT_JSON || process.env.GOOGLE_CREDENTIALS_JSON;
  if (rawJson) {
    try {
      let cleanJson = rawJson.trim();
      if ((cleanJson.startsWith("'") && cleanJson.endsWith("'")) || (cleanJson.startsWith('"') && cleanJson.endsWith('"'))) {
        cleanJson = cleanJson.slice(1, -1).trim();
      }
      const parsed = JSON.parse(cleanJson);
      if (parsed.client_email && parsed.private_key) {
        let pk = parsed.private_key;
        pk = pk.replace(/\\n/g, '\n').replace(/\r\n/g, '\n');
        return {
          client_email: parsed.client_email.trim(),
          private_key: pk
        };
      }
    } catch (err) {
      console.error('[Google Sheets API] Lỗi parse GOOGLE_SERVICE_ACCOUNT_JSON:', err.message);
    }
  }

  // Option 2: Từng biến môi trường riêng lẻ GOOGLE_CLIENT_EMAIL & GOOGLE_PRIVATE_KEY
  const clientEmail = process.env.GOOGLE_CLIENT_EMAIL;
  const privateKey = process.env.GOOGLE_PRIVATE_KEY;

  if (clientEmail && privateKey) {
    let cleanEmail = clientEmail.trim();
    if ((cleanEmail.startsWith('"') && cleanEmail.endsWith('"')) || (cleanEmail.startsWith("'") && cleanEmail.endsWith("'"))) {
      cleanEmail = cleanEmail.slice(1, -1).trim();
    }

    let cleanKey = privateKey.trim();
    // Loại bỏ dấu ngoặc bọc ngoài nếu người dùng lỡ dán dính dấu nháy kép/nháy đơn trên Vercel
    if ((cleanKey.startsWith('"') && cleanKey.endsWith('"')) || (cleanKey.startsWith("'") && cleanKey.endsWith("'"))) {
      cleanKey = cleanKey.slice(1, -1).trim();
    }
    // Chuyển đổi các dạng escape xuống dòng \\n thành \n thực sự
    cleanKey = cleanKey.replace(/\\n/g, '\n').replace(/\r\n/g, '\n');

    return {
      client_email: cleanEmail,
      private_key: cleanKey
    };
  }

  return null;
}

let authConfig = {
  scopes: ['https://www.googleapis.com/auth/spreadsheets']
};

const credentials = getGoogleCredentials();
if (credentials) {
  authConfig.credentials = credentials;
} else {
  const KEY_FILE = process.env.GOOGLE_APPLICATION_CREDENTIALS || path.join(__dirname, 'qlcv-505501-a0a3cebc52f5.json');
  authConfig.keyFile = path.isAbsolute(KEY_FILE) ? KEY_FILE : path.resolve(process.cwd(), KEY_FILE);
}

const auth = new google.auth.GoogleAuth(authConfig);
const sheets = google.sheets({ version: 'v4', auth });

// Bộ nhớ đệm tạm thời (Memory Store Fallback nếu chưa kết nối thành công Sheet ID)
let inMemoryData = null;

// Khởi tạo bộ nhớ tạm thời từ tệp js/data.js
function loadInitialInMemoryData() {
  if (inMemoryData) return inMemoryData;
  try {
    const dataJsPath = path.join(__dirname, 'js', 'data.js');
    if (fs.existsSync(dataJsPath)) {
      const dataJsContent = fs.readFileSync(dataJsPath, 'utf8');
      
      let tasks = [];
      let users = [];

      const tasksMatch = dataJsContent.match(/window\.INITIAL_TASKS\s*=\s*(\[[\s\S]*?\]);/);
      if (tasksMatch) {
        tasks = JSON.parse(tasksMatch[1]);
      }

      const usersMatch = dataJsContent.match(/window\.INITIAL_USERS\s*=\s*(\[[\s\S]*?\]);/);
      if (usersMatch) {
        try {
          users = JSON.parse(usersMatch[1]);
        } catch (e) {
          try {
            users = Function('"use strict"; return (' + usersMatch[1] + ')')();
          } catch (err) {
            console.error('Lỗi parse window.INITIAL_USERS:', err.message);
          }
        }
      }

      if (!Array.isArray(users) || users.length === 0) {
        users = [
          { username: 'admin', password: 'admin', department: 'ALL', role: 'ADMIN', name: 'Quản trị viên Hệ thống' },
          { username: 'ubnd.vt.pkt', password: 'ubnd.vt.pkt', department: 'Kinh tế', role: 'EDIT', name: 'Văn thư Phòng Kinh tế' }
        ];
      } else if (!users.some(u => String(u.username).toLowerCase() === 'admin')) {
        users.unshift({ username: 'admin', password: 'admin', department: 'ALL', role: 'ADMIN', name: 'Quản trị viên Hệ thống' });
      }

      inMemoryData = {
        tasks: tasks.map((t, idx) => ({ ...t, id: idx + 1, excel_row: idx + 4 })),
        leadershipTasks: [],
        employees: [
          { ma_nv: 'NV001', ho_ten: 'Phạm Duy Thảo', phong_ban: 'Kinh tế', chuc_vu: 'Chuyên viên', trang_thai: 'Đang làm việc', ghi_chu: 'Đang làm việc' },
          { ma_nv: 'NV002', ho_ten: 'Cao Trần Quang', phong_ban: 'Kinh tế', chuc_vu: 'Chuyên viên', trang_thai: 'Đang làm việc', ghi_chu: 'Đang làm việc' },
          { ma_nv: 'NV003', ho_ten: 'Đặng Hoàng Đa', phong_ban: 'Kinh tế', chuc_vu: 'Chuyên viên', trang_thai: 'Đang làm việc', ghi_chu: 'Đang làm việc' }
        ],
        categories: {
          departments: ['Kinh tế', 'VH - XH', 'Văn phòng UBND', 'Trung tâm PVHCC', 'Trung tâm DVTH', 'Hội đồng nhân dân', 'Đô thị'],
          agencies: ['Sở Tài Chính', 'Sở Xây dựng', 'Sở Nông nghiệp và PTNT'],
          empStatuses: ['Đang làm việc', 'Tạm nghỉ', 'Nghỉ việc'],
          leaders: [
            { name: 'BT - Trần Thanh Hải', status: 'Hiện' },
            { name: 'CT - Lê Hiền Hoà', status: 'Hiện' },
            { name: 'PCT - Hồ Văn Quí', status: 'Hiện' },
            { name: 'PCT - Huỳnh Ngọc Danh', status: 'Hiện' }
          ]
        },
        users: users,
        fileStatus: {
          lastModified: new Date().toISOString(),
          ticks: Date.now(),
          size: 2048,
          mode: 'in-memory-fallback'
        }
      };
      return inMemoryData;
    }
  } catch (err) {
    console.warn('Lỗi đọc dữ liệu mẫu:', err.message);
  }

  inMemoryData = {
    tasks: [],
    leadershipTasks: [],
    employees: [],
    categories: {
      departments: ['Kinh tế', 'VH - XH', 'Văn phòng UBND', 'Trung tâm PVHCC', 'Trung tâm DVTH', 'Hội đồng nhân dân', 'Đô thị'],
      agencies: [],
      empStatuses: ['Đang làm việc', 'Tạm nghỉ', 'Nghỉ việc'],
      leaders: [
        { name: 'BT - Trần Thanh Hải', status: 'Hiện' },
        { name: 'CT - Lê Hiền Hoà', status: 'Hiện' },
        { name: 'PCT - Hồ Văn Quí', status: 'Hiện' },
        { name: 'PCT - Huỳnh Ngọc Danh', status: 'Hiện' }
      ]
    },
    users: [
      { username: 'admin', password: 'admin', department: 'ALL', role: 'ADMIN', name: 'Quản trị viên Hệ thống' }
    ],
    fileStatus: { lastModified: new Date().toISOString(), ticks: Date.now(), size: 1024 }
  };
  return inMemoryData;
}

// Helper date parser to UTC timestamp for midnight
function parseDateToTimestamp(dateVal) {
  if (dateVal === null || dateVal === undefined) return 0;
  const rawStr = String(dateVal).trim();
  if (rawStr === '' || rawStr === '--' || rawStr.toLowerCase() === 'khong' || rawStr.toLowerCase() === 'n/a') return 0;

  const num = Number(rawStr);
  if (!isNaN(num) && num > 1000 && num < 100000) {
    const excelEpoch = new Date(Date.UTC(1899, 11, 30));
    return excelEpoch.getTime() + Math.floor(num) * 86400000;
  }

  if (/^\d{1,2}[\/\.-]\d{1,2}[\/\.-]\d{4}$/.test(rawStr)) {
    const parts = rawStr.split(/[\/\.-]/);
    const p1 = parseInt(parts[0], 10);
    const p2 = parseInt(parts[1], 10);
    const year = parseInt(parts[2], 10);
    let day, month;
    if (p2 > 12) {
      month = p1 - 1;
      day = p2;
    } else {
      day = p1;
      month = p2 - 1;
    }
    return Date.UTC(year, month, day);
  }

  if (/^\d{4}[\/\.-]\d{1,2}[\/\.-]\d{1,2}/.test(rawStr)) {
    const dateOnly = rawStr.split('T')[0];
    const parts = dateOnly.split(/[\/\.-]/);
    if (parts.length >= 3) {
      const year = parseInt(parts[0], 10);
      const month = parseInt(parts[1], 10) - 1;
      const day = parseInt(parts[2], 10);
      return Date.UTC(year, month, day);
    }
  }

  const parsedDate = new Date(rawStr);
  if (!isNaN(parsedDate.getTime())) {
    return Date.UTC(parsedDate.getFullYear(), parsedDate.getMonth(), parsedDate.getDate());
  }

  return 0;
}

function getMidnightTimestamp(dateVal) {
  if (!dateVal) {
    const now = new Date();
    return Date.UTC(now.getFullYear(), now.getMonth(), now.getDate());
  }
  if (dateVal instanceof Date) {
    return Date.UTC(dateVal.getFullYear(), dateVal.getMonth(), dateVal.getDate());
  }
  return parseDateToTimestamp(dateVal);
}

function calculateEvaluation(task, refDate) {
  if (!task) return '';
  const status = String(task.trang_thai || '').trim();
  const lowerStatus = status.toLowerCase();

  // Tạm dừng hoặc Hủy / Đã hủy -> Cột đánh giá để trống
  if (lowerStatus === 'tạm dừng' || lowerStatus === 'hủy' || lowerStatus === 'đã hủy' || lowerStatus.includes('tạm dừng') || lowerStatus.includes('hủy')) {
    return '';
  }

  const tDeadline = parseDateToTimestamp(task.deadline);

  // Đang thực hiện (hoặc status bao gồm đang thực hiện / quá hạn)
  if (lowerStatus === 'đang thực hiện' || lowerStatus.includes('đang thực hiện') || lowerStatus === 'quá hạn') {
    if (!tDeadline) return '';
    const tCurrent = getMidnightTimestamp(refDate);
    if (tDeadline < tCurrent) return 'Trễ hạn';
    if (tDeadline === tCurrent) return 'Đến hạn';
    return '';
  }

  // Hoàn thành
  if (lowerStatus === 'hoàn thành' || lowerStatus.includes('hoàn thành')) {
    const tHoanThanh = parseDateToTimestamp(task.ngay_hoan_thanh);
    if (!tDeadline || !tHoanThanh) return '';
    if (tDeadline > tHoanThanh) return 'Trước hạn';
    if (tDeadline === tHoanThanh) return 'Đúng hạn';
    if (tDeadline < tHoanThanh) return 'Trễ hạn';
    return '';
  }

  return '';
}

// Chuẩn hóa trạng thái công chức
function normalizeEmpStatus(rawStatus) {
  if (!rawStatus) return 'Đang làm việc';
  const clean = String(rawStatus).trim();
  if (clean === 'Kích hoạt' || clean.toLowerCase() === 'kich hoat') return 'Đang làm việc';
  const lower = clean.toLowerCase();
  if (clean.startsWith('T') || clean.startsWith('t') || lower.includes('tạm') || lower.includes('tam')) {
    return 'Tạm nghỉ';
  }
  if (clean.startsWith('N') || clean.startsWith('n') || lower.includes('nghỉ') || lower.includes('nghi') || lower.includes('chuyển')) {
    return 'Nghỉ việc';
  }
  return 'Đang làm việc';
}

// Đọc Google Sheet ID từ .env hoặc biến môi trường
function getSpreadsheetId() {
  const envId = process.env.GOOGLE_SHEET_ID || '';
  if (envId && envId.trim() !== '') {
    return envId.trim();
  }
  return '';
}

// Lấy numeric sheetId dựa trên tên tab
async function getSheetIdByTitle(spreadsheetId, title) {
  try {
    const meta = await sheets.spreadsheets.get({ spreadsheetId });
    const sheetsList = meta.data.sheets || [];
    const targetSheet = sheetsList.find(s => s.properties?.title === title);
    return targetSheet ? targetSheet.properties.sheetId : null;
  } catch (err) {
    console.error(`[Google Sheets API] Lỗi lấy sheetId cho tab '${title}':`, err.message);
    return null;
  }
}

// Xóa hoàn toàn dòng khỏi Google Sheets (deleteDimension), không để lại dòng trống
async function deleteSheetRow(spreadsheetId, tabTitle, targetRow) {
  const minRow = (tabTitle === 'Tasks_LanhDao_TheoDoi') ? 2 : 4;
  if (!spreadsheetId || !targetRow || targetRow < minRow) {
    console.warn(`[deleteSheetRow] Bỏ qua vì targetRow (${targetRow}) < minRow (${minRow}) cho tab '${tabTitle}'`);
    return false;
  }
  const sheetId = await getSheetIdByTitle(spreadsheetId, tabTitle);
  if (typeof sheetId === 'number') {
    await sheets.spreadsheets.batchUpdate({
      spreadsheetId,
      requestBody: {
        requests: [
          {
            deleteDimension: {
              range: {
                sheetId: sheetId,
                dimension: 'ROWS',
                startIndex: targetRow - 1,
                endIndex: targetRow
              }
            }
          }
        ]
      }
    });
    console.log(`[Google Sheets API] Đã xóa hoàn toàn dòng ${targetRow} khỏi tab '${tabTitle}' (sheetId: ${sheetId})`);
    return true;
  } else {
    // Fallback xóa nội dung dải ô nếu không lấy được sheetId
    await sheets.spreadsheets.values.clear({
      spreadsheetId,
      range: `${tabTitle}!A${targetRow}:Z${targetRow}`
    });
    console.warn(`[Google Sheets API] Đã clear dữ liệu dòng ${targetRow} trên tab '${tabTitle}'`);
    return true;
  }
}

// Đảm bảo tiêu đề các tab sheet tồn tại
async function ensureSheetTabs(spreadsheetId) {
  try {
    const meta = await sheets.spreadsheets.get({ spreadsheetId });
    const existingTitles = (meta.data.sheets || []).map(s => s.properties.title);

    const requiredTabs = ['Tasks', 'Employees', 'Settings', 'Tasks_LanhDao_TheoDoi'];
    const addRequests = [];

    for (const tab of requiredTabs) {
      if (!existingTitles.includes(tab)) {
        addRequests.push({
          addSheet: { properties: { title: tab } }
        });
      }
    }

    if (addRequests.length > 0) {
      await sheets.spreadsheets.batchUpdate({
        spreadsheetId,
        requestBody: { requests: addRequests }
      });
      await initializeDefaultHeadersAndSeed(spreadsheetId);

      if (addRequests.some(r => r.addSheet?.properties?.title === 'Tasks_LanhDao_TheoDoi')) {
        await sheets.spreadsheets.values.update({
          spreadsheetId,
          range: 'Tasks_LanhDao_TheoDoi!A1:P1',
          valueInputOption: 'USER_ENTERED',
          requestBody: {
            values: [[
              'Mã CV', 'Nơi ban hành', 'Số Công văn', 'Tên công việc', 'Mô tả', 'Phòng ban',
              'Ngày tạo', 'Deadline', 'Ngày hoàn thành', 'Trạng thái', 'Kết quả (Sản phẩm, Văn bản ban hành)',
              'Ghi chú', 'Số ngày còn lại', 'Số ngày trễ', 'Đánh giá', 'Đơn vị Phối hợp'
            ]]
          }
        });
      }
    }
  } catch (err) {
    if (err.message && err.message.includes('permission')) {
      throw new Error(`Service Account chưa được cấp quyền Editor cho Google Sheet ID: ${spreadsheetId}. Vui lòng bấm "Chia sẻ" (Share) trên Google Sheets và thêm email: ${SERVICE_ACCOUNT_EMAIL}`);
    }
    throw err;
  }
}

// Nạp dữ liệu mẫu ban đầu vào Google Sheet mới tạo
async function initializeDefaultHeadersAndSeed(spreadsheetId) {
  const memData = loadInitialInMemoryData();

  const taskRows = [
    ['Nơi ban hành', 'Số công văn', 'Tên công việc', 'Mô tả', 'Phòng ban', 'Người phụ trách', 'Ngày tạo', 'Deadline', 'Ngày hoàn thành', 'Trạng thái', 'Kết quả', 'Ghi chú', 'Số ngày còn lại', 'Số ngày trễ', 'Đánh giá', 'Tuần', 'Tháng', 'Năm', '', 'Đơn vị/Người phối hợp']
  ];

  (memData.tasks || []).forEach(t => {
    taskRows.push([
      t.noi_ban_hanh || '', t.so_cong_van || '', t.ten_cong_viec || '', t.mo_ta || '',
      t.phong_ban || '', t.nguoi_phu_trach || '', t.ngay_tao || '', t.deadline || '',
      t.ngay_hoan_thanh || '', t.trang_thai || '', t.ket_qua || '', t.ghi_chu || '',
      t.so_ngay_con_lai || '', t.so_ngay_tre || '', t.danh_gia || '', t.tuan || '', t.thang || '', t.nam || '', '', t.don_vi_phoi_hop || ''
    ]);
  });

  const empRows = [['Mã NV', 'Họ tên', 'Phòng ban', 'Chức vụ', 'Trạng thái']];
  (memData.employees || []).forEach(e => {
    empRows.push([e.ma_nv, e.ho_ten, e.phong_ban, e.chuc_vu, e.trang_thai]);
  });

  const setHeader = ['Phòng ban', '', '', '', 'Trạng thái NV', '', 'Nơi ban hành', '', '', '', 'Username', 'Password', 'Department', 'Role', 'Name'];
  const setRows = [setHeader];

  const maxLen = Math.max(
    memData.categories.departments.length,
    memData.categories.empStatuses.length,
    memData.categories.agencies.length,
    memData.users.length
  );

  for (let i = 0; i < maxLen; i++) {
    const dept = memData.categories.departments[i] || '';
    const empSt = memData.categories.empStatuses[i] || '';
    const agency = memData.categories.agencies[i] || '';
    const u = memData.users[i];

    setRows.push([
      dept, '', '', '', empSt, '', agency, '', '', '',
      u ? u.username : '', u ? u.password : '', u ? u.department : '', u ? u.role : '', u ? u.name : ''
    ]);
  }

  await sheets.spreadsheets.values.batchUpdate({
    spreadsheetId,
    requestBody: {
      valueInputOption: 'USER_ENTERED',
      data: [
        { range: 'Tasks!A3:T' + (taskRows.length + 2), values: taskRows },
        { range: 'Employees!A3:E' + (empRows.length + 2), values: empRows },
        { range: 'Settings!A3:O' + (setRows.length + 2), values: setRows }
      ]
    }
  });
}

// ----------------------------------------------------------------------
// IN-MEMORY CACHE SYSTEM (Auto-invalidated on write operations)
// ----------------------------------------------------------------------
let dataCache = null;
let dataCacheTimestamp = 0;
const CACHE_TTL_MS = 5000; // 5 seconds cache TTL for ultra-fast response

function clearDataCache() {
  dataCache = null;
  dataCacheTimestamp = 0;
}

// ----------------------------------------------------------------------
// GET DATA (ĐỌC DỮ LIỆU TỪ GOOGLE SHEETS)
// ----------------------------------------------------------------------
async function getData(forceRefresh = false) {
  const spreadsheetId = getSpreadsheetId();

  if (!spreadsheetId) {
    console.log('[Google Sheets API] Chưa cấu hình GOOGLE_SHEET_ID trong .env. Sử dụng dữ liệu bộ nhớ.');
    return loadInitialInMemoryData();
  }

  // Sử dụng bộ nhớ đệm nếu dữ liệu còn mới (< 5 giây) và không yêu cầu làm mới bắt buộc
  if (!forceRefresh && dataCache && (Date.now() - dataCacheTimestamp < CACHE_TTL_MS)) {
    return dataCache;
  }

  try {
    await ensureSheetTabs(spreadsheetId);

    // Dải ô động cho Tasks!A1:T, Settings!A1:Q500 và Tasks_LanhDao_TheoDoi!A1:Q
    const res = await sheets.spreadsheets.values.batchGet({
      spreadsheetId,
      ranges: ['Tasks!A1:T', 'Employees!A1:E500', 'Settings!A1:Q500', 'Tasks_LanhDao_TheoDoi!A1:Q']
    });

    const valueRanges = res.data.valueRanges || [];
    const tasksRows = valueRanges[0]?.values || [];
    const empRows = valueRanges[1]?.values || [];
    const setRows = valueRanges[2]?.values || [];
    const leadershipRows = valueRanges[3]?.values || [];

    // Nếu Sheet trống, tự động nạp dữ liệu mẫu ban đầu
    if (tasksRows.length <= 3 && empRows.length <= 3) {
      console.log(`[Google Sheets API] Sheet ID ${spreadsheetId} chưa có dữ liệu. Đang tự động nạp dữ liệu ban đầu...`);
      await initializeDefaultHeadersAndSeed(spreadsheetId);
      return getData(true);
    }

    // 1. Parse Tasks (Hàng dữ liệu bắt đầu từ Row 4)
    const tasks = [];
    let taskIdCounter = 1;
    for (let r = 3; r < tasksRows.length; r++) {
      const row = tasksRows[r] || [];
      const noi_ban_hanh = row[0] || '';
      const so_cong_van = row[1] || '';
      const ten_cong_viec = row[2] || '';

      if (!so_cong_van && !ten_cong_viec) continue;

      tasks.push({
        id: taskIdCounter++,
        excel_row: r + 1,
        noi_ban_hanh: String(noi_ban_hanh),
        so_cong_van: String(so_cong_van),
        ten_cong_viec: String(ten_cong_viec),
        mo_ta: String(row[3] || ''),
        phong_ban: String(row[4] || ''),
        nguoi_phu_trach: String(row[5] || ''),
        ngay_tao: String(row[6] || ''),
        deadline: String(row[7] || ''),
        ngay_hoan_thanh: String(row[8] || ''),
        trang_thai: String(row[9] || ''),
        ket_qua: String(row[10] || ''),
        ghi_chu: String(row[11] || ''),
        so_ngay_con_lai: String(row[12] || ''),
        so_ngay_tre: String(row[13] || ''),
        danh_gia: calculateEvaluation({
          trang_thai: row[9],
          deadline: row[7],
          ngay_hoan_thanh: row[8]
        }),
        don_vi_phoi_hop: String(row[19] || '')
      });
    }

    // 1.1 Parse Tasks_LanhDao_TheoDoi (Hàng dữ liệu bắt đầu từ Row 2 vì Row 1 là Header)
    const leadershipTasks = [];
    let ldIdCounter = 1;
    for (let r = 1; r < leadershipRows.length; r++) {
      const row = leadershipRows[r] || [];
      const ma_cv = row[0] || '';
      const noi_ban_hanh = row[1] || '';
      const so_cong_van = row[2] || '';
      const ten_cong_viec = row[3] || '';

      if (!so_cong_van && !ten_cong_viec && !ma_cv) continue;

      const trang_thai = String(row[9] || 'Đang thực hiện');
      const deadline = String(row[7] || '');
      const ngay_hoan_thanh = String(row[8] || '');
      const assignedMaCV = String(ma_cv || `LD${String(ldIdCounter).padStart(3, '0')}`);

      leadershipTasks.push({
        id: ldIdCounter++,
        excel_row: r + 1,
        ma_cv: assignedMaCV,
        noi_ban_hanh: String(noi_ban_hanh || ''),
        so_cong_van: String(so_cong_van || ''),
        ten_cong_viec: String(ten_cong_viec || ''),
        mo_ta: String(row[4] || ''),
        phong_ban: String(row[5] || ''),
        ngay_tao: String(row[6] || ''),
        deadline: deadline,
        ngay_hoan_thanh: ngay_hoan_thanh,
        trang_thai: trang_thai,
        ket_qua: String(row[10] || ''),
        ghi_chu: String(row[11] || ''),
        so_ngay_con_lai: String(row[12] || ''),
        so_ngay_tre: String(row[13] || ''),
        danh_gia: String(row[14] || calculateEvaluation({
          trang_thai,
          deadline,
          ngay_hoan_thanh
        })),
        don_vi_phoi_hop: String(row[15] || ''),
        lanh_dao: String(row[16] || '')
      });
    }

    // 2. Parse Employees
    const employees = [];
    for (let r = 3; r < empRows.length; r++) {
      const row = empRows[r] || [];
      const ma_nv = String(row[0] || '').trim();
      const ho_ten = String(row[1] || '').trim();

      if (!ma_nv && !ho_ten) continue;

      const rawStatus = row[4] || '';
      const cleanStatus = normalizeEmpStatus(rawStatus);

      employees.push({
        ma_nv,
        ho_ten,
        phong_ban: String(row[2] || ''),
        chuc_vu: String(row[3] || ''),
        trang_thai: cleanStatus,
        ghi_chu: cleanStatus
      });
    }

    // 3. Parse Settings (Đọc đầy đủ tất cả phòng ban từ Cột A trong dải ô Settings!A4:A50)
    const departments = [];
    const maxDeptRow = Math.min(setRows.length, 50);
    for (let r = 3; r < maxDeptRow; r++) {
      const val = String(setRows[r]?.[0] || '').trim();
      if (val && val !== '' && val !== 'null' && val !== 'undefined' && !departments.includes(val)) {
        departments.push(val);
      }
    }

    // Nếu không tìm thấy phòng ban nào từ Sheet Settings!A4:A50 thì mới nạp danh sách mặc định
    if (departments.length === 0) {
      const memData = loadInitialInMemoryData();
      if (memData && memData.categories && Array.isArray(memData.categories.departments)) {
        memData.categories.departments.forEach(d => {
          if (d && d.trim() !== '' && !departments.includes(d)) departments.push(d.trim());
        });
      }
    }

    const agencies = [];
    for (let r = 3; r < setRows.length; r++) {
      const val = String(setRows[r]?.[6] || '').trim();
      if (val) agencies.push(val);
    }

    const empStatuses = [];
    for (let r = 3; r < setRows.length; r++) {
      const val = String(setRows[r]?.[4] || '').trim();
      if (val) empStatuses.push(val);
    }
    if (empStatuses.length === 0) {
      empStatuses.push('Đang làm việc', 'Tạm nghỉ', 'Nghỉ việc');
    }

    const users = [];
    for (let r = 3; r < setRows.length; r++) {
      const u_name = String(setRows[r]?.[10] || '').trim();
      if (u_name) {
        users.push({
          username: u_name,
          password: String(setRows[r]?.[11] || ''),
          department: String(setRows[r]?.[12] || ''),
          role: String(setRows[r]?.[13] || ''),
          name: String(setRows[r]?.[14] || '')
        });
      }
    }

    const leaders = [];
    for (let r = 3; r < setRows.length; r++) {
      const leaderName = String(setRows[r]?.[15] || '').trim();
      const leaderStatus = String(setRows[r]?.[16] || '').trim();
      if (leaderName) {
        leaders.push({
          name: leaderName,
          status: (leaderStatus === 'Ẩn' || leaderStatus.toLowerCase() === 'ẩn') ? 'Ẩn' : 'Hiện'
        });
      }
    }
    if (leaders.length === 0) {
      leaders.push(
        { name: 'BT - Trần Thanh Hải', status: 'Hiện' },
        { name: 'CT - Lê Hiền Hoà', status: 'Hiện' },
        { name: 'PCT - Hồ Văn Quí', status: 'Hiện' },
        { name: 'PCT - Huỳnh Ngọc Danh', status: 'Hiện' }
      );
    }

    const parsedResult = {
      tasks,
      leadershipTasks,
      employees,
      categories: { departments, agencies, empStatuses, leaders },
      users,
      fileStatus: {
        lastModified: new Date().toISOString(),
        ticks: Date.now(),
        size: (tasks.length + leadershipTasks.length) * 100 + 1000,
        spreadsheetId
      }
    };

    // Lưu vào bộ nhớ đệm
    dataCache = parsedResult;
    dataCacheTimestamp = Date.now();

    return parsedResult;
  } catch (err) {
    console.error('[Google Sheets API Lỗi]:', err.message);
    const memData = loadInitialInMemoryData();
    memData.fileStatus.warning = err.message;
    return memData;
  }
}

// ----------------------------------------------------------------------
// ADD ITEM
// ----------------------------------------------------------------------
async function addItem(type, data) {
  const spreadsheetId = getSpreadsheetId();

  if (!spreadsheetId) {
    const memData = loadInitialInMemoryData();
    if (type === 'departments') {
      const name = String(typeof data === 'object' ? (data.name || data.phong_ban) : data).trim();
      if (name && !memData.categories.departments.includes(name)) memData.categories.departments.push(name);
    } else if (type === 'agencies') {
      const name = String(typeof data === 'object' ? data.name : data).trim();
      if (name) memData.categories.agencies.push(name);
    } else if (type === 'leaders' || type === 'leadership') {
      if (!memData.categories.leaders) memData.categories.leaders = [];
      const leaderObj = typeof data === 'object'
        ? { name: String(data.name || '').trim(), status: data.status || 'Hiện' }
        : { name: String(data).trim(), status: 'Hiện' };
      if (leaderObj.name) memData.categories.leaders.push(leaderObj);
      return { success: true, name: leaderObj.name, message: 'Added leader (in-memory)' };
    } else if (type === 'employees') {
      memData.employees.push({ ...data, trang_thai: normalizeEmpStatus(data.trang_thai) });
    } else if (type === 'users') {
      memData.users.push(data);
    } else if (type === 'leadership_tasks' || type === 'leadership-tasks' || type === 'tasks_lanh_dao') {
      if (!memData.leadershipTasks) memData.leadershipTasks = [];
      const id = memData.leadershipTasks.length + 1;
      const ma_cv = data.ma_cv || `LD${String(id).padStart(3, '0')}`;
      memData.leadershipTasks.push({ ...data, id, ma_cv });
      return { success: true, id, ma_cv, message: 'Added leadership task (in-memory)' };
    } else {
      memData.tasks.push({ ...data, id: memData.tasks.length + 1 });
    }
    return { success: true, message: 'Added item (in-memory)' };
  }

  const currentData = await getData();

  if (type === 'leadership_tasks' || type === 'leadership-tasks' || type === 'tasks_lanh_dao') {
    const res = await sheets.spreadsheets.values.get({ spreadsheetId, range: 'Tasks_LanhDao_TheoDoi!A:A' });
    const existing = res.data.values || [];
    const targetRow = Math.max(existing.length + 1, 2);
    const taskNum = targetRow - 1;
    const ma_cv = data.ma_cv || `LD${String(taskNum).padStart(3, '0')}`;
    const statusVal = data.trang_thai || 'Đang thực hiện';

    const deadline = String(data.deadline || '');
    const ngay_hoan_thanh = String(data.ngay_hoan_thanh || '');

    let calcDaysLeft = '';
    let calcDaysLate = '';
    const tDeadline = parseDateToTimestamp(deadline);
    const tCurrent = getMidnightTimestamp();
    const tHoanThanh = parseDateToTimestamp(ngay_hoan_thanh);

    if (statusVal.toLowerCase().includes('hoàn thành')) {
      if (tDeadline && tHoanThanh && tHoanThanh > tDeadline) {
        calcDaysLate = String(Math.round((tHoanThanh - tDeadline) / 86400000));
      }
    } else if (!statusVal.toLowerCase().includes('hủy') && !statusVal.toLowerCase().includes('tạm dừng')) {
      if (tDeadline) {
        const diff = Math.round((tDeadline - tCurrent) / 86400000);
        if (diff >= 0) {
          calcDaysLeft = String(diff);
        } else {
          calcDaysLate = String(Math.abs(diff));
        }
      }
    }

    const calcEval = calculateEvaluation({
      trang_thai: statusVal,
      deadline: deadline,
      ngay_hoan_thanh: ngay_hoan_thanh
    });

    const newRowValues = [
      String(ma_cv),
      String(data.noi_ban_hanh || ''),
      String(data.so_cong_van || ''),
      String(data.ten_cong_viec || ''),
      String(data.mo_ta || ''),
      String(data.phong_ban || ''),
      String(data.ngay_tao || ''),
      deadline,
      ngay_hoan_thanh,
      String(statusVal),
      String(data.ket_qua || ''),
      String(data.ghi_chu || ''),
      String(data.so_ngay_con_lai !== undefined && data.so_ngay_con_lai !== '' ? data.so_ngay_con_lai : calcDaysLeft),
      String(data.so_ngay_tre !== undefined && data.so_ngay_tre !== '' ? data.so_ngay_tre : calcDaysLate),
      String(data.danh_gia || calcEval),
      String(data.don_vi_phoi_hop || ''),
      String(data.lanh_dao || '')
    ];

    await sheets.spreadsheets.values.update({
      spreadsheetId,
      range: `Tasks_LanhDao_TheoDoi!A${targetRow}:Q${targetRow}`,
      valueInputOption: 'USER_ENTERED',
      requestBody: { values: [newRowValues] }
    });

    clearDataCache();
    return { success: true, id: taskNum, ma_cv: ma_cv, excel_row: targetRow, message: 'Added leadership task successfully' };
  }

  if (type === 'departments') {
    let deptName = typeof data === 'object' ? (data.name || data.phong_ban || '') : String(data);
    deptName = String(deptName).trim();
    if (!deptName) throw new Error('Tên phòng ban không được để rỗng.');

    // Always sync with memory store first
    const memData = loadInitialInMemoryData();
    if (memData && memData.categories && Array.isArray(memData.categories.departments)) {
      if (!memData.categories.departments.includes(deptName)) {
        memData.categories.departments.push(deptName);
      }
    }

    if (!spreadsheetId) {
      clearDataCache();
      return { success: true, name: deptName, message: 'Added department (in-memory)' };
    }

    try {
      const res = await sheets.spreadsheets.values.get({ spreadsheetId, range: 'Settings!A4:A50' });
      const existing = res.data.values || [];
      let targetRow = -1;
      for (let i = 0; i < 47; i++) {
        if (!existing[i] || !String(existing[i][0] || '').trim()) {
          targetRow = i + 4;
          break;
        }
      }
      if (targetRow === -1 || targetRow > 50) {
        throw new Error('Danh mục phòng ban đã đạt giới hạn tối đa (tối đa 47 phòng ban từ A4 đến A50).');
      }

      await sheets.spreadsheets.values.update({
        spreadsheetId,
        range: `Settings!A${targetRow}`,
        valueInputOption: 'USER_ENTERED',
        requestBody: { values: [[deptName]] }
      });

      clearDataCache();
      return { success: true, name: deptName, excel_row: targetRow, message: 'Added department successfully' };
    } catch (err) {
      console.warn('[Google Sheets API Fallback]:', err.message);
      clearDataCache();
      return { success: true, name: deptName, message: 'Added department (in-memory fallback)' };
    }
  }

  if (type === 'agencies') {
    let agencyName = typeof data === 'object' ? (data.name || data.noi_ban_hanh || '') : String(data);
    agencyName = String(agencyName).trim();
    if (!agencyName) throw new Error('Tên Nơi ban hành không được để rỗng.');

    const res = await sheets.spreadsheets.values.get({ spreadsheetId, range: 'Settings!G4:G200' });
    const existing = res.data.values || [];
    const targetRow = existing.length + 4;

    await sheets.spreadsheets.values.update({
      spreadsheetId,
      range: `Settings!G${targetRow}`,
      valueInputOption: 'USER_ENTERED',
      requestBody: { values: [[agencyName]] }
    });

    clearDataCache();
    return { success: true, name: agencyName, excel_row: targetRow, message: 'Added agency successfully' };
  }

  if (type === 'leaders' || type === 'leadership') {
    let leaderName = typeof data === 'object' ? (data.name || data.ten_lanh_dao || '') : String(data);
    leaderName = String(leaderName).trim();
    if (!leaderName) throw new Error('Tên Lãnh đạo không được để rỗng.');
    let leaderStatus = (typeof data === 'object' && data.status) ? String(data.status).trim() : 'Hiện';
    if (leaderStatus !== 'Ẩn') leaderStatus = 'Hiện';

    const res = await sheets.spreadsheets.values.get({ spreadsheetId, range: 'Settings!P4:Q200' });
    const existing = res.data.values || [];
    let targetRowIndex = -1;
    for (let i = 0; i < existing.length; i++) {
      const row = existing[i];
      const name = String(row?.[0] || '').trim();
      if (!name) {
        targetRowIndex = i;
        break;
      }
    }
    const targetRow = (targetRowIndex !== -1 ? targetRowIndex : existing.length) + 4;

    await sheets.spreadsheets.values.update({
      spreadsheetId,
      range: `Settings!P${targetRow}:Q${targetRow}`,
      valueInputOption: 'USER_ENTERED',
      requestBody: { values: [[leaderName, leaderStatus]] }
    });

    clearDataCache();
    return { success: true, name: leaderName, status: leaderStatus, excel_row: targetRow, message: 'Added leader successfully' };
  }

  if (type === 'employees') {
    let maxNum = 0;
    (currentData.employees || []).forEach(emp => {
      const match = String(emp.ma_nv).match(/\d+/);
      if (match) {
        const num = parseInt(match[0], 10);
        if (num > maxNum) maxNum = num;
      }
    });

    const nextMaNV = `NV${String(maxNum + 1).padStart(3, '0')}`;
    const ma_nv = data.ma_nv && String(data.ma_nv).trim() ? String(data.ma_nv).trim() : nextMaNV;
    const ho_ten = String(data.ho_ten || '').trim();
    const phong_ban = String(data.phong_ban || '').trim();
    const chuc_vu = String(data.chuc_vu || '').trim();
    const cleanSt = normalizeEmpStatus(data.trang_thai || data.ghi_chu);

    const res = await sheets.spreadsheets.values.get({ spreadsheetId, range: 'Employees!A4:A500' });
    const existing = res.data.values || [];
    const targetRow = existing.length + 4;

    await sheets.spreadsheets.values.update({
      spreadsheetId,
      range: `Employees!A${targetRow}:E${targetRow}`,
      valueInputOption: 'USER_ENTERED',
      requestBody: { values: [[ma_nv, ho_ten, phong_ban, chuc_vu, cleanSt]] }
    });

    clearDataCache();
    return { success: true, ma_nv, excel_row: targetRow, message: 'Added employee successfully' };
  }

  if (type === 'users') {
    const res = await sheets.spreadsheets.values.get({ spreadsheetId, range: 'Settings!K4:K200' });
    const existing = res.data.values || [];
    const targetRow = existing.length + 4;

    await sheets.spreadsheets.values.update({
      spreadsheetId,
      range: `Settings!K${targetRow}:O${targetRow}`,
      valueInputOption: 'USER_ENTERED',
      requestBody: {
        values: [[
          String(data.username || ''), String(data.password || ''),
          String(data.department || ''), String(data.role || ''), String(data.name || '')
        ]]
      }
    });

    clearDataCache();
    return { success: true, username: data.username, message: 'Added user successfully' };
  }

  // Default: Tasks
  const statusVal = data.trang_thai || 'Đang thực hiện';

  const res = await sheets.spreadsheets.values.get({ spreadsheetId, range: 'Tasks!A4:A' });
  const existing = res.data.values || [];
  const targetRow = existing.length + 4;

  // CHỈ ghi 12 cột thông tin từ Cột A đến Cột L.
  // Tuyệt đối KHÔNG ghi đè lên các cột M đến R chứa công thức tự động trên Google Sheets.
  const newRowValues = [
    String(data.noi_ban_hanh || ''), String(data.so_cong_van || ''), String(data.ten_cong_viec || ''),
    String(data.mo_ta || ''), String(data.phong_ban || ''), String(data.nguoi_phu_trach || ''),
    String(data.ngay_tao || ''), String(data.deadline || ''), String(data.ngay_hoan_thanh || ''),
    String(statusVal), String(data.ket_qua || ''), String(data.ghi_chu || '')
  ];

  await sheets.spreadsheets.values.update({
    spreadsheetId,
    range: `Tasks!A${targetRow}:L${targetRow}`,
    valueInputOption: 'USER_ENTERED',
    requestBody: { values: [newRowValues] }
  });

  if (data.don_vi_phoi_hop !== undefined) {
    await sheets.spreadsheets.values.update({
      spreadsheetId,
      range: `Tasks!T${targetRow}`,
      valueInputOption: 'USER_ENTERED',
      requestBody: { values: [[String(data.don_vi_phoi_hop || '')]] }
    });
  }

  clearDataCache();
  return { success: true, id: targetRow - 3, excel_row: targetRow, message: 'Added task successfully' };
}

// ----------------------------------------------------------------------
// UPDATE ITEM
// ----------------------------------------------------------------------
async function updateItem(type, data) {
  if (!data) throw new Error('Dữ liệu cập nhật không hợp lệ.');
  const spreadsheetId = getSpreadsheetId();

  if (!spreadsheetId) {
    const memData = loadInitialInMemoryData();
    if (type === 'departments') {
      const oldName = String(data.oldName || data.name || '').trim();
      const newName = String(data.newName || '').trim();
      if (oldName && newName) {
        const idx = memData.categories.departments.indexOf(oldName);
        if (idx !== -1) memData.categories.departments[idx] = newName;
      }
    } else if (type === 'leaders' || type === 'leadership') {
      if (!memData.categories.leaders) memData.categories.leaders = [];
      const oldName = String(data.oldName || data.name || '').trim();
      const newName = String(data.newName || data.name || oldName).trim();
      const newStatus = String(data.status || data.newStatus || 'Hiện').trim();
      const idx = memData.categories.leaders.findIndex(l => (typeof l === 'object' ? l.name : l) === oldName);
      if (idx !== -1) {
        memData.categories.leaders[idx] = { name: newName, status: newStatus };
      } else {
        memData.categories.leaders.push({ name: newName, status: newStatus });
      }
      return { success: true, message: 'Updated leader (in-memory)' };
    } else if (type === 'employees') {
      const idx = memData.employees.findIndex(e => e.ma_nv === data.ma_nv);
      if (idx !== -1) memData.employees[idx] = { ...memData.employees[idx], ...data };
    } else if (type === 'leadership_tasks' || type === 'leadership-tasks' || type === 'tasks_lanh_dao') {
      if (!memData.leadershipTasks) memData.leadershipTasks = [];
      const idx = memData.leadershipTasks.findIndex(t => t.id === data.id || t.ma_cv === data.ma_cv);
      if (idx !== -1) memData.leadershipTasks[idx] = { ...memData.leadershipTasks[idx], ...data };
    } else if (type === 'tasks') {
      const idx = memData.tasks.findIndex(t => t.id === data.id);
      if (idx !== -1) memData.tasks[idx] = { ...memData.tasks[idx], ...data };
    }
    return { success: true, message: 'Updated item (in-memory)' };
  }

  if (type === 'departments') {
    const oldName = String(data.oldName || data.name || '').trim();
    const newName = String(data.newName || '').trim();

    // Always sync with memory store first
    const memData = loadInitialInMemoryData();
    if (oldName && newName && memData && memData.categories && Array.isArray(memData.categories.departments)) {
      const idx = memData.categories.departments.indexOf(oldName);
      if (idx !== -1) memData.categories.departments[idx] = newName;
      else if (!memData.categories.departments.includes(newName)) memData.categories.departments.push(newName);
    }

    if (!spreadsheetId) {
      clearDataCache();
      return { success: true, oldName, newName, message: 'Updated department (in-memory)' };
    }

    try {
      if (oldName && newName) {
        const res = await sheets.spreadsheets.values.get({ spreadsheetId, range: 'Settings!A4:A50' });
        const rows = res.data.values || [];
        for (let i = 0; i < rows.length; i++) {
          if (String(rows[i][0] || '').trim() === oldName) {
            const rowNum = i + 4;
            await sheets.spreadsheets.values.update({
              spreadsheetId,
              range: `Settings!A${rowNum}`,
              valueInputOption: 'USER_ENTERED',
              requestBody: { values: [[newName]] }
            });
            break;
          }
        }
      }
      clearDataCache();
      return { success: true, oldName, newName, message: 'Updated department successfully' };
    } catch (err) {
      console.warn('[Google Sheets API Fallback]:', err.message);
      clearDataCache();
      return { success: true, oldName, newName, message: 'Updated department (in-memory fallback)' };
    }
  }

  if (type === 'agencies') {
    const oldName = String(data.oldName || data.name || '').trim();
    const newName = String(data.newName || '').trim();

    if (oldName && newName) {
      const res = await sheets.spreadsheets.values.get({ spreadsheetId, range: 'Settings!G4:G200' });
      const rows = res.data.values || [];
      for (let i = 0; i < rows.length; i++) {
        if (String(rows[i][0] || '').trim() === oldName) {
          const rowNum = i + 4;
          await sheets.spreadsheets.values.update({
            spreadsheetId,
            range: `Settings!G${rowNum}`,
            valueInputOption: 'USER_ENTERED',
            requestBody: { values: [[newName]] }
          });
          break;
        }
      }
    }
    clearDataCache();
    return { success: true, oldName, newName, message: 'Updated agency successfully' };
  }

  if (type === 'leaders' || type === 'leadership') {
    const oldName = String(data.oldName || data.name || data.id || '').trim();
    const newName = String(data.newName || data.name || oldName).trim();
    let newStatus = String(data.newStatus || data.status || 'Hiện').trim();
    if (newStatus !== 'Ẩn') newStatus = 'Hiện';

    if (!newName) throw new Error('Tên Lãnh đạo không được để rỗng.');

    const res = await sheets.spreadsheets.values.get({ spreadsheetId, range: 'Settings!P4:Q200' });
    const rows = res.data.values || [];
    let foundRow = -1;
    for (let i = 0; i < rows.length; i++) {
      if (String(rows[i][0] || '').trim() === oldName) {
        foundRow = i + 4;
        break;
      }
    }

    if (foundRow !== -1) {
      await sheets.spreadsheets.values.update({
        spreadsheetId,
        range: `Settings!P${foundRow}:Q${foundRow}`,
        valueInputOption: 'USER_ENTERED',
        requestBody: { values: [[newName, newStatus]] }
      });
    } else {
      const targetRow = rows.length + 4;
      await sheets.spreadsheets.values.update({
        spreadsheetId,
        range: `Settings!P${targetRow}:Q${targetRow}`,
        valueInputOption: 'USER_ENTERED',
        requestBody: { values: [[newName, newStatus]] }
      });
    }

    clearDataCache();
    return { success: true, oldName, newName, status: newStatus, message: 'Updated leader successfully' };
  }

  if (type === 'employees') {
    const targetMaNV = String(data.ma_nv || data.id || '').trim();
    if (!targetMaNV) throw new Error('Thiếu Mã NV để cập nhật.');

    const res = await sheets.spreadsheets.values.get({ spreadsheetId, range: 'Employees!A4:E500' });
    const rows = res.data.values || [];
    let targetRow = 0;

    for (let i = 0; i < rows.length; i++) {
      if (String(rows[i][0] || '').trim().toLowerCase() === targetMaNV.toLowerCase()) {
        targetRow = i + 4;
        break;
      }
    }

    if (!targetRow) throw new Error(`Không tìm thấy công chức Mã NV '${targetMaNV}' để cập nhật!`);

    const cur = rows[targetRow - 4] || [];
    const ho_ten = data.ho_ten !== undefined ? String(data.ho_ten).trim() : (cur[1] || '');
    const phong_ban = data.phong_ban !== undefined ? String(data.phong_ban).trim() : (cur[2] || '');
    const chuc_vu = data.chuc_vu !== undefined ? String(data.chuc_vu).trim() : (cur[3] || '');
    const cleanSt = normalizeEmpStatus(data.trang_thai !== undefined ? data.trang_thai : (data.ghi_chu !== undefined ? data.ghi_chu : cur[4]));

    await sheets.spreadsheets.values.update({
      spreadsheetId,
      range: `Employees!A${targetRow}:E${targetRow}`,
      valueInputOption: 'USER_ENTERED',
      requestBody: { values: [[targetMaNV, ho_ten, phong_ban, chuc_vu, cleanSt]] }
    });

    clearDataCache();
    return { success: true, ma_nv: targetMaNV, excel_row: targetRow, message: 'Updated employee successfully' };
  }

  if (type === 'users') {
    const targetUser = String(data.username || '').trim();
    if (targetUser) {
      const res = await sheets.spreadsheets.values.get({ spreadsheetId, range: 'Settings!K4:O200' });
      const rows = res.data.values || [];
      for (let i = 0; i < rows.length; i++) {
        if (String(rows[i][0] || '').trim() === targetUser) {
          const targetRow = i + 4;
          const cur = rows[i] || [];
          await sheets.spreadsheets.values.update({
            spreadsheetId,
            range: `Settings!K${targetRow}:O${targetRow}`,
            valueInputOption: 'USER_ENTERED',
            requestBody: {
              values: [[
                targetUser,
                data.password !== undefined ? String(data.password) : (cur[1] || ''),
                data.department !== undefined ? String(data.department) : (cur[2] || ''),
                data.role !== undefined ? String(data.role) : (cur[3] || ''),
                data.name !== undefined ? String(data.name) : (cur[4] || '')
              ]]
            }
          });
          break;
        }
      }
    }
    clearDataCache();
    return { success: true, username: data.username, message: 'Updated user successfully' };
  }

  if (type === 'leadership_tasks' || type === 'leadership-tasks' || type === 'tasks_lanh_dao') {
    const res = await sheets.spreadsheets.values.get({ spreadsheetId, range: 'Tasks_LanhDao_TheoDoi!A:P' });
    const rows = res.data.values || [];
    let targetRow = 0;

    const cleanMaCV = String(data.ma_cv || '').trim();
    if (cleanMaCV) {
      for (let i = 1; i < rows.length; i++) {
        if (String(rows[i][0] || '').trim().toLowerCase() === cleanMaCV.toLowerCase()) {
          targetRow = i + 1;
          break;
        }
      }
    }

    const cleanSoCV = String(data.so_cong_van || '').trim();
    if (!targetRow && cleanSoCV) {
      for (let i = 1; i < rows.length; i++) {
        if (String(rows[i][2] || '').trim().toLowerCase() === cleanSoCV.toLowerCase()) {
          targetRow = i + 1;
          break;
        }
      }
    }

    if (!targetRow && data.excel_row && parseInt(data.excel_row, 10) >= 2) {
      targetRow = parseInt(data.excel_row, 10);
    }

    if (!targetRow && data.id) {
      const reqId = parseInt(data.id, 10);
      let currentId = 1;
      for (let i = 1; i < rows.length; i++) {
        const soCV = String(rows[i][2] || '').trim();
        const tenCV = String(rows[i][3] || '').trim();
        if (!soCV && !tenCV) continue;
        if (currentId === reqId) {
          targetRow = i + 1;
          break;
        }
        currentId++;
      }
    }

    if (!targetRow && data.id) {
      targetRow = parseInt(data.id, 10) + 1;
    }

    if (targetRow >= 2) {
      const cur = rows[targetRow - 1] || [];
      const statusVal = data.trang_thai !== undefined ? String(data.trang_thai) : (cur[9] || 'Đang thực hiện');
      const deadline = data.deadline !== undefined ? String(data.deadline) : (cur[7] || '');
      const ngay_hoan_thanh = data.ngay_hoan_thanh !== undefined ? String(data.ngay_hoan_thanh) : (cur[8] || '');

      let calcDaysLeft = '';
      let calcDaysLate = '';
      const tDeadline = parseDateToTimestamp(deadline);
      const tCurrent = getMidnightTimestamp();
      const tHoanThanh = parseDateToTimestamp(ngay_hoan_thanh);

      if (statusVal.toLowerCase().includes('hoàn thành')) {
        if (tDeadline && tHoanThanh && tHoanThanh > tDeadline) {
          calcDaysLate = String(Math.round((tHoanThanh - tDeadline) / 86400000));
        }
      } else if (!statusVal.toLowerCase().includes('hủy') && !statusVal.toLowerCase().includes('tạm dừng')) {
        if (tDeadline) {
          const diff = Math.round((tDeadline - tCurrent) / 86400000);
          if (diff >= 0) {
            calcDaysLeft = String(diff);
          } else {
            calcDaysLate = String(Math.abs(diff));
          }
        }
      }

      const calcEval = calculateEvaluation({
        trang_thai: statusVal,
        deadline: deadline,
        ngay_hoan_thanh: ngay_hoan_thanh
      });

      const updatedRow = [
        data.ma_cv !== undefined ? String(data.ma_cv) : (cur[0] || `LD${String(targetRow - 1).padStart(3, '0')}`), // A: Mã CV
        data.noi_ban_hanh !== undefined ? String(data.noi_ban_hanh) : (cur[1] || ''),                             // B: Nơi ban hành
        data.so_cong_van !== undefined ? String(data.so_cong_van) : (cur[2] || ''),                               // C: Số Công văn
        data.ten_cong_viec !== undefined ? String(data.ten_cong_viec) : (cur[3] || ''),                           // D: Tên công việc
        data.mo_ta !== undefined ? String(data.mo_ta) : (cur[4] || ''),                                           // E: Mô tả
        data.phong_ban !== undefined ? String(data.phong_ban) : (cur[5] || ''),                                   // F: Phòng ban
        data.ngay_tao !== undefined ? String(data.ngay_tao) : (cur[6] || ''),                                     // G: Ngày tạo
        deadline,                                                                                                 // H: Deadline
        ngay_hoan_thanh,                                                                                          // I: Ngày hoàn thành
        statusVal,                                                                                                // J: Trạng thái
        data.ket_qua !== undefined ? String(data.ket_qua) : (cur[10] || ''),                                      // K: Kết quả
        data.ghi_chu !== undefined ? String(data.ghi_chu) : (cur[11] || ''),                                      // L: Ghi chú
        data.so_ngay_con_lai !== undefined ? String(data.so_ngay_con_lai) : (calcDaysLeft || cur[12] || ''),     // M: Số ngày còn lại
        data.so_ngay_tre !== undefined ? String(data.so_ngay_tre) : (calcDaysLate || cur[13] || ''),             // N: Số ngày trễ
        data.danh_gia !== undefined ? String(data.danh_gia) : (calcEval || cur[14] || ''),                       // O: Đánh giá
        data.don_vi_phoi_hop !== undefined ? String(data.don_vi_phoi_hop) : (cur[15] || ''),                     // P: Đơn vị / Người phối hợp
        data.lanh_dao !== undefined ? String(data.lanh_dao) : (cur[16] || '')                                     // Q: Lãnh đạo giao
      ];

      await sheets.spreadsheets.values.update({
        spreadsheetId,
        range: `Tasks_LanhDao_TheoDoi!A${targetRow}:Q${targetRow}`,
        valueInputOption: 'USER_ENTERED',
        requestBody: { values: [updatedRow] }
      });
    }

    clearDataCache();
    return { success: true, id: data.id, excel_row: targetRow, message: 'Updated leadership task successfully' };
  }

  // Default: Tasks
  const res = await sheets.spreadsheets.values.get({ spreadsheetId, range: 'Tasks!A4:T' });
  const rows = res.data.values || [];
  let targetRow = 0;

  if (data.excel_row && parseInt(data.excel_row, 10) >= 4) {
    targetRow = parseInt(data.excel_row, 10);
  }

  const cleanSoCV = String(data.so_cong_van || '').trim();
  if (!targetRow && cleanSoCV) {
    for (let i = 0; i < rows.length; i++) {
      if (String(rows[i][1] || '').trim() === cleanSoCV) {
        targetRow = i + 4;
        break;
      }
    }
  }

  if (!targetRow && data.id) {
    const reqId = parseInt(data.id, 10);
    let currentId = 1;
    for (let i = 0; i < rows.length; i++) {
      const soCV = String(rows[i][1] || '').trim();
      const tenCV = String(rows[i][2] || '').trim();
      if (!soCV && !tenCV) continue;
      if (currentId === reqId) {
        targetRow = i + 4;
        break;
      }
      currentId++;
    }
  }

  if (!targetRow && data.id) {
    targetRow = parseInt(data.id, 10) + 3;
  }

  if (targetRow >= 4) {
    const cur = rows[targetRow - 4] || [];
    // CHỈ cập nhật Cột A đến Cột L (12 cột), bảo vệ nguyên vẹn công thức các cột M đến R
    const updatedRow = [
      data.noi_ban_hanh !== undefined ? String(data.noi_ban_hanh) : (cur[0] || ''),
      data.so_cong_van !== undefined ? String(data.so_cong_van) : (cur[1] || ''),
      data.ten_cong_viec !== undefined ? String(data.ten_cong_viec) : (cur[2] || ''),
      data.mo_ta !== undefined ? String(data.mo_ta) : (cur[3] || ''),
      data.phong_ban !== undefined ? String(data.phong_ban) : (cur[4] || ''),
      data.nguoi_phu_trach !== undefined ? String(data.nguoi_phu_trach) : (cur[5] || ''),
      data.ngay_tao !== undefined ? String(data.ngay_tao) : (cur[6] || ''),
      data.deadline !== undefined ? String(data.deadline) : (cur[7] || ''),
      data.ngay_hoan_thanh !== undefined ? String(data.ngay_hoan_thanh) : (cur[8] || ''),
      data.trang_thai !== undefined ? String(data.trang_thai) : (cur[9] || ''),
      data.ket_qua !== undefined ? String(data.ket_qua) : (cur[10] || ''),
      data.ghi_chu !== undefined ? String(data.ghi_chu) : (cur[11] || '')
    ];

    await sheets.spreadsheets.values.update({
      spreadsheetId,
      range: `Tasks!A${targetRow}:L${targetRow}`,
      valueInputOption: 'USER_ENTERED',
      requestBody: { values: [updatedRow] }
    });

    if (data.don_vi_phoi_hop !== undefined) {
      const coorValue = String(data.don_vi_phoi_hop || '');
      await sheets.spreadsheets.values.update({
        spreadsheetId,
        range: `Tasks!T${targetRow}`,
        valueInputOption: 'USER_ENTERED',
        requestBody: { values: [[coorValue]] }
      });
    }
  }

  clearDataCache();
  return { success: true, id: data.id, excel_row: targetRow, message: 'Updated task successfully' };
}

// ----------------------------------------------------------------------
// DELETE ITEM
// ----------------------------------------------------------------------
async function deleteItem(type, id, data) {
  const spreadsheetId = getSpreadsheetId();

  if (!spreadsheetId) {
    const memData = loadInitialInMemoryData();
    if (type === 'departments') {
      const targetName = String(data?.name || data?.oldName || id || '').trim();
      memData.categories.departments = memData.categories.departments.filter(d => d !== targetName);
    } else if (type === 'leaders' || type === 'leadership') {
      const targetName = String(data?.name || data?.oldName || id || '').trim();
      if (memData.categories.leaders) {
        memData.categories.leaders = memData.categories.leaders.filter(l => (typeof l === 'object' ? l.name : l) !== targetName);
      }
      return { success: true, message: 'Deleted leader (in-memory)' };
    } else if (type === 'employees') {
      memData.employees = memData.employees.filter(e => e.ma_nv !== id);
    } else if (type === 'leadership_tasks' || type === 'leadership-tasks' || type === 'tasks_lanh_dao') {
      if (!memData.leadershipTasks) memData.leadershipTasks = [];
      memData.leadershipTasks = memData.leadershipTasks.filter(t => t.id !== parseInt(id, 10) && t.ma_cv !== id);
    } else if (type === 'tasks') {
      memData.tasks = memData.tasks.filter(t => t.id !== parseInt(id, 10));
    }
    return { success: true, message: 'Deleted item (in-memory)' };
  }

  if (type === 'departments') {
    const targetName = String(data?.name || data?.oldName || id || '').trim();

    // Always sync with memory store first
    const memData = loadInitialInMemoryData();
    if (targetName && memData && memData.categories && Array.isArray(memData.categories.departments)) {
      memData.categories.departments = memData.categories.departments.filter(d => d !== targetName);
    }

    if (!spreadsheetId) {
      clearDataCache();
      return { success: true, name: targetName, message: 'Deleted department (in-memory)' };
    }

    try {
      if (targetName) {
        const res = await sheets.spreadsheets.values.get({ spreadsheetId, range: 'Settings!A4:A50' });
        const rows = res.data.values || [];
        for (let i = 0; i < rows.length; i++) {
          if (String(rows[i][0] || '').trim() === targetName) {
            const rowNum = i + 4;
            await sheets.spreadsheets.values.clear({ spreadsheetId, range: `Settings!A${rowNum}` });
            break;
          }
        }
      }
      clearDataCache();
      return { success: true, name: targetName, message: 'Deleted department successfully' };
    } catch (err) {
      console.warn('[Google Sheets API Fallback]:', err.message);
      clearDataCache();
      return { success: true, name: targetName, message: 'Deleted department (in-memory fallback)' };
    }
  }

  if (type === 'agencies') {
    const targetName = String(data?.name || data?.oldName || id || '').trim();
    if (targetName) {
      const res = await sheets.spreadsheets.values.get({ spreadsheetId, range: 'Settings!G4:G200' });
      const rows = res.data.values || [];
      for (let i = 0; i < rows.length; i++) {
        if (String(rows[i][0] || '').trim() === targetName) {
          const rowNum = i + 4;
          await sheets.spreadsheets.values.clear({ spreadsheetId, range: `Settings!G${rowNum}` });
          break;
        }
      }
    }
    clearDataCache();
    return { success: true, name: targetName, message: 'Deleted agency successfully' };
  }

  if (type === 'leaders' || type === 'leadership') {
    const targetName = String(data?.name || data?.oldName || id || '').trim();
    if (targetName) {
      const res = await sheets.spreadsheets.values.get({ spreadsheetId, range: 'Settings!P4:Q200' });
      const rows = res.data.values || [];
      const remainingRows = [];
      let found = false;
      for (let i = 0; i < rows.length; i++) {
        const rowName = String(rows[i][0] || '').trim();
        if (rowName === targetName && !found) {
          found = true;
          continue;
        }
        if (rowName) {
          remainingRows.push([rowName, String(rows[i][1] || 'Hiện')]);
        }
      }

      await sheets.spreadsheets.values.clear({ spreadsheetId, range: `Settings!P4:Q${Math.max(rows.length + 4, 10)}` });

      if (remainingRows.length > 0) {
        await sheets.spreadsheets.values.update({
          spreadsheetId,
          range: `Settings!P4:Q${remainingRows.length + 3}`,
          valueInputOption: 'USER_ENTERED',
          requestBody: { values: remainingRows }
        });
      }
    }
    clearDataCache();
    return { success: true, name: targetName, message: 'Deleted leader successfully' };
  }

  if (type === 'employees') {
    const targetMaNV = String(data?.ma_nv || id || '').trim();
    if (!targetMaNV) throw new Error('Thiếu Mã NV để xóa.');

    const res = await sheets.spreadsheets.values.get({ spreadsheetId, range: 'Employees!A4:E500' });
    const rows = res.data.values || [];
    let targetRow = 0;

    for (let i = 0; i < rows.length; i++) {
      if (String(rows[i][0] || '').trim().toLowerCase() === targetMaNV.toLowerCase()) {
        targetRow = i + 4;
        break;
      }
    }

    if (!targetRow) throw new Error(`Không tìm thấy công chức Mã NV '${targetMaNV}' để xóa!`);

    await deleteSheetRow(spreadsheetId, 'Employees', targetRow);
    clearDataCache();
    return { success: true, ma_nv: targetMaNV, excel_row: targetRow, message: 'Deleted employee successfully' };
  }

  if (type === 'users') {
    const targetUser = String(id || data?.username || '').trim();
    if (targetUser) {
      const res = await sheets.spreadsheets.values.get({ spreadsheetId, range: 'Settings!K4:O200' });
      const rows = res.data.values || [];
      for (let i = 0; i < rows.length; i++) {
        if (String(rows[i][0] || '').trim() === targetUser) {
          const targetRow = i + 4;
          await sheets.spreadsheets.values.clear({ spreadsheetId, range: `Settings!K${targetRow}:O${targetRow}` });
          break;
        }
      }
    }
    clearDataCache();
    return { success: true, id, message: 'Deleted user successfully' };
  }

  if (type === 'leadership_tasks' || type === 'leadership-tasks' || type === 'tasks_lanh_dao') {
    const res = await sheets.spreadsheets.values.get({ spreadsheetId, range: 'Tasks_LanhDao_TheoDoi!A:P' });
    const rows = res.data.values || [];
    let targetRow = 0;

    // 1. Ưu tiên tìm kiếm chính xác tuyệt đối theo Mã Công Việc (Cột A)
    const cleanMaCV = String(data?.ma_cv || (typeof id === 'string' && isNaN(Number(id)) ? id : '') || '').trim();
    if (cleanMaCV) {
      for (let i = 1; i < rows.length; i++) {
        if (String(rows[i][0] || '').trim().toLowerCase() === cleanMaCV.toLowerCase()) {
          targetRow = i + 1;
          break;
        }
      }
    }

    // 2. Tìm kiếm dự phòng theo Số công văn và Tên công việc
    const cleanSoCV = String(data?.so_cong_van || '').trim();
    const cleanTenCV = String(data?.ten_cong_viec || '').trim();

    if (!targetRow && cleanSoCV && cleanTenCV) {
      for (let i = 1; i < rows.length; i++) {
        if (String(rows[i][2] || '').trim().toLowerCase() === cleanSoCV.toLowerCase() &&
            String(rows[i][3] || '').trim().toLowerCase() === cleanTenCV.toLowerCase()) {
          targetRow = i + 1;
          break;
        }
      }
    }

    if (!targetRow && cleanSoCV) {
      for (let i = 1; i < rows.length; i++) {
        if (String(rows[i][2] || '').trim().toLowerCase() === cleanSoCV.toLowerCase()) {
          targetRow = i + 1;
          break;
        }
      }
    }

    if (!targetRow && cleanTenCV) {
      for (let i = 1; i < rows.length; i++) {
        if (String(rows[i][3] || '').trim().toLowerCase() === cleanTenCV.toLowerCase()) {
          targetRow = i + 1;
          break;
        }
      }
    }

    // 3. Tìm kiếm theo ID số thứ tự công việc
    if (!targetRow && id && !isNaN(parseInt(id, 10))) {
      const targetId = parseInt(id, 10);
      let currentId = 1;
      for (let i = 1; i < rows.length; i++) {
        const maCV = String(rows[i][0] || '').trim();
        const soCV = String(rows[i][2] || '').trim();
        const tenCV = String(rows[i][3] || '').trim();
        if (!maCV && !soCV && !tenCV) continue;
        if (currentId === targetId) {
          targetRow = i + 1;
          break;
        }
        currentId++;
      }
    }

    // 4. Kiểm tra dòng excel_row nếu hợp lệ
    if (!targetRow && data?.excel_row && parseInt(data.excel_row, 10) >= 2) {
      const candidateRow = parseInt(data.excel_row, 10);
      if (candidateRow <= rows.length) {
        targetRow = candidateRow;
      }
    }

    if (!targetRow || targetRow < 2) {
      console.error(`[deleteItem leadership_tasks] Không tìm thấy dòng công việc cần xóa trên Google Sheets:`, { id, cleanMaCV, cleanSoCV });
      return { success: false, error: `Không tìm thấy dòng công việc ${cleanMaCV || cleanSoCV || id} cần xóa trên Google Sheets!` };
    }

    await deleteSheetRow(spreadsheetId, 'Tasks_LanhDao_TheoDoi', targetRow);
    clearDataCache();
    return {
      success: true,
      id,
      ma_cv: cleanMaCV,
      deletedRow: targetRow,
      message: 'Đã xóa công việc Lãnh đạo giao thành công khỏi Google Sheets'
    };
  }

  // Default: Tasks
  const res = await sheets.spreadsheets.values.get({ spreadsheetId, range: 'Tasks!A4:R' });
  const rows = res.data.values || [];
  let targetRow = 0;

  if (data?.excel_row && parseInt(data.excel_row, 10) >= 4) {
    targetRow = parseInt(data.excel_row, 10);
  }

  if (!targetRow && data?.so_cong_van) {
    const cleanSoCV = String(data.so_cong_van).trim();
    for (let i = 0; i < rows.length; i++) {
      if (String(rows[i][1] || '').trim() === cleanSoCV) {
        targetRow = i + 4;
        break;
      }
    }
  }

  if (!targetRow && id) {
    const targetId = parseInt(id, 10);
    let currentId = 1;
    for (let i = 0; i < rows.length; i++) {
      const soCV = String(rows[i][1] || '').trim();
      const tenCV = String(rows[i][2] || '').trim();
      if (!soCV && !tenCV) continue;
      if (currentId === targetId) {
        targetRow = i + 4;
        break;
      }
      currentId++;
    }
  }

  if (!targetRow && id) {
    targetRow = parseInt(id, 10) + 3;
  }

  if (targetRow >= 4) {
    // Xóa hoàn toàn dòng khỏi Google Sheets (deleteDimension), không để lại dòng trống
    await deleteSheetRow(spreadsheetId, 'Tasks', targetRow);
  }

  clearDataCache();
  return { success: true, id, message: 'Deleted task successfully' };
}

// ----------------------------------------------------------------------
// GET USERS REALTIME (Bypass cache, fetch directly from Google Sheets)
// ----------------------------------------------------------------------
async function getUsersRealtime() {
  const spreadsheetId = getSpreadsheetId();
  if (!spreadsheetId) {
    console.log('[Google Sheets API] Chưa cấu hình GOOGLE_SHEET_ID. Sử dụng dữ liệu mẫu.');
    const memData = loadInitialInMemoryData();
    return memData.users || [];
  }

  try {
    const res = await sheets.spreadsheets.values.get({
      spreadsheetId,
      range: 'Settings!K4:O500'
    });

    const rows = res.data.values || [];
    const users = [];
    for (let r = 0; r < rows.length; r++) {
      const row = rows[r] || [];
      const username = String(row[0] || '').trim();
      if (username) {
        users.push({
          username,
          password: String(row[1] || ''),
          department: String(row[2] || ''),
          role: String(row[3] || ''),
          name: String(row[4] || '')
        });
      }
    }
    if (!users.some(u => String(u.username).toLowerCase() === 'admin')) {
      users.unshift({ username: 'admin', password: 'admin', department: 'ALL', role: 'ADMIN', name: 'Quản trị viên Hệ thống' });
    }
    return users;
  } catch (err) {
    console.error('[Google Sheets API getUsersRealtime Lỗi]:', err.message);
    const memData = loadInitialInMemoryData();
    const users = memData.users || [];
    if (!users.some(u => String(u.username).toLowerCase() === 'admin')) {
      users.unshift({ username: 'admin', password: 'admin', department: 'ALL', role: 'ADMIN', name: 'Quản trị viên Hệ thống' });
    }
    return users;
  }
}

module.exports = {
  getData,
  clearDataCache,
  addItem,
  updateItem,
  deleteItem,
  getUsersRealtime,
  getSpreadsheetId,
  normalizeEmpStatus,
  calculateEvaluation,
  parseDateToTimestamp,
  getMidnightTimestamp,
  SERVICE_ACCOUNT_EMAIL,
  sheets
};

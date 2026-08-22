if (require('module').globalPaths && require('fs').existsSync('C:/Users/buith/AppData/Local/Temp/qlcv_deps/node_modules')) {
  require('module').globalPaths.push('C:/Users/buith/AppData/Local/Temp/qlcv_deps/node_modules');
  module.paths.push('C:/Users/buith/AppData/Local/Temp/qlcv_deps/node_modules');
}

require('dotenv').config();
const express = require('express');
const cors = require('cors');
const path = require('path');
const fs = require('fs');
const googleSheets = require('./googleSheets');

const app = express();
const PORT = process.env.PORT || 8080;

// Middleware
app.use(cors());
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// Logging middleware
app.use((req, res, next) => {
  if (req.path.startsWith('/api/')) {
    console.log(`[API ${req.method}] ${req.path}`);
  }
  next();
});

// ----------------------------------------------------------------------
// REST API ENDPOINTS
// ----------------------------------------------------------------------

// 1. GET /api/status
app.get('/api/status', async (req, res) => {
  try {
    const data = await googleSheets.getData();
    res.json(data.fileStatus || { lastModified: new Date().toISOString() });
  } catch (err) {
    console.error('Lỗi [GET /api/status]:', err.message);
    res.status(500).json({ success: false, error: err.message });
  }
});

// 2. GET /api/data
app.get('/api/data', async (req, res) => {
  try {
    const data = await googleSheets.getData();
    res.json(data);
  } catch (err) {
    console.error('Lỗi [GET /api/data]:', err.message);
    res.status(500).json({ success: false, error: err.message });
  }
});

// 3. POST /api/add
app.post('/api/add', async (req, res) => {
  try {
    const { type = 'tasks', data } = req.body || {};
    const result = await googleSheets.addItem(type, data);
    res.json(result);
  } catch (err) {
    console.error('Lỗi [POST /api/add]:', err.message);
    res.status(500).json({ success: false, error: err.message });
  }
});

// 4. POST /api/update
app.post('/api/update', async (req, res) => {
  try {
    const { type = 'tasks', data } = req.body || {};
    const result = await googleSheets.updateItem(type, data);
    res.json(result);
  } catch (err) {
    console.error('Lỗi [POST /api/update]:', err.message);
    res.status(500).json({ success: false, error: err.message });
  }
});

// 5. POST /api/delete
app.post('/api/delete', async (req, res) => {
  try {
    const { type = 'tasks', id, data, userRole, userDepartment } = req.body || {};
    const targetId = id || data?.id;

    if (type === 'tasks') {
      const currentData = await googleSheets.getData();
      const targetTask = (currentData.tasks || []).find(t => String(t.id) === String(targetId)) || data;
      const isUserAdmin = userRole === 'ADMIN' || userRole === 'ALL' || userDepartment === 'ALL';

      if (targetTask && targetTask.trang_thai === 'Hoàn thành' && !isUserAdmin) {
        return res.status(403).json({
          success: false,
          error: 'Từ chối truy cập: Chỉ tài khoản Quản trị tối cao (Admin / quyền ALL) mới có quyền xóa công việc đã hoàn thành!'
        });
      }
    }

    const result = await googleSheets.deleteItem(type, targetId, data);
    res.json(result);
  } catch (err) {
    console.error('Lỗi [POST /api/delete]:', err.message);
    res.status(500).json({ success: false, error: err.message });
  }
});

// 5.1. POST /api/login (Xác thực đăng nhập thời gian thực trực tiếp từ Google Sheets)
app.post('/api/login', async (req, res) => {
  try {
    const { username = '', password = '' } = req.body || {};
    const cleanUser = String(username).trim().toLowerCase();
    const cleanPass = String(password).trim();

    if (!cleanUser) {
      return res.status(400).json({ success: false, error: 'Tên đăng nhập không được để trống.' });
    }

    // Truy vấn trực tiếp từ Google Sheets (bypass cache, so sánh mật khẩu chính xác 100%)
    const users = await googleSheets.getUsersRealtime();
    const matchedUser = users.find(u =>
      (u.username || '').trim().toLowerCase() === cleanUser &&
      String(u.password || '').trim() === cleanPass
    );

    if (matchedUser) {
      res.json({
        success: true,
        user: {
          username: matchedUser.username,
          name: matchedUser.name || matchedUser.username,
          department: matchedUser.department,
          role: matchedUser.role,
          avatar: 'https://images.unsplash.com/photo-1534528741775-53994a69daeb?w=100&auto=format&fit=crop&q=80'
        }
      });
    } else {
      res.status(401).json({ success: false, error: 'Tài khoản hoặc mật khẩu không chính xác.' });
    }
  } catch (err) {
    console.error('Lỗi [POST /api/login]:', err.message);
    res.status(500).json({ success: false, error: 'Lỗi hệ thống khi xác thực tài khoản: ' + err.message });
  }
});

// 6. POST /api/export-excel
app.post('/api/export-excel', async (req, res) => {
  try {
    const XLSX = require('xlsx');
    const { tasks = [] } = req.body || {};

    const excelRows = tasks.map((task, index) => ({
      'STT': index + 1,
      'Số công văn': task.so_cong_van || '',
      'Nơi ban hành': task.noi_ban_hanh || '',
      'Tên công việc': task.ten_cong_viec || '',
      'Mô tả': task.mo_ta || '',
      'Phòng ban': task.phong_ban || '',
      'Người phụ trách': task.nguoi_phu_trach || '',
      'Đơn vị / Người phối hợp': task.don_vi_phoi_hop || '',
      'Ngày tạo': task.ngay_tao || '',
      'Deadline': task.deadline || '',
      'Ngày hoàn thành': task.ngay_hoan_thanh || '',
      'Trạng thái': task.trang_thai || '',
      'Kết quả': task.ket_qua || '',
      'Ghi chú': task.ghi_chu || '',
      'Đánh giá': googleSheets.calculateEvaluation ? googleSheets.calculateEvaluation(task) : (task.danh_gia || '')
    }));

    const worksheet = XLSX.utils.json_to_sheet(excelRows);

    worksheet['!cols'] = [
      { wch: 6 },  // STT
      { wch: 22 }, // Số công văn
      { wch: 22 }, // Nơi ban hành
      { wch: 45 }, // Tên công việc
      { wch: 35 }, // Mô tả
      { wch: 18 }, // Phòng ban
      { wch: 22 }, // Người phụ trách
      { wch: 25 }, // Đơn vị / Người phối hợp
      { wch: 14 }, // Ngày tạo
      { wch: 14 }, // Deadline
      { wch: 16 }, // Ngày hoàn thành
      { wch: 16 }, // Trạng thái
      { wch: 25 }, // Kết quả
      { wch: 25 }, // Ghi chú
      { wch: 16 }  // Đánh giá
    ];

    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, 'CongViec');

    const buffer = XLSX.write(workbook, { type: 'buffer', bookType: 'xlsx' });

    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', 'attachment; filename="Danh_sach_cong_viec.xlsx"');
    res.send(buffer);
  } catch (err) {
    console.error('Lỗi [POST /api/export-excel]:', err.message);
    res.status(500).json({ success: false, error: err.message });
  }
});

// Static file serving & SPA fallback
app.use(express.static(__dirname));
app.use(express.static(process.cwd()));

app.get('*', (req, res) => {
  if (req.path.startsWith('/api/')) {
    return res.status(404).json({ error: 'Endpoint không tồn tại' });
  }

  // Explicit check in process.cwd() and __dirname
  const cwdFilePath = path.join(process.cwd(), req.path);
  if (fs.existsSync(cwdFilePath) && fs.statSync(cwdFilePath).isFile()) {
    return res.sendFile(cwdFilePath);
  }

  const dirFilePath = path.join(__dirname, req.path);
  if (fs.existsSync(dirFilePath) && fs.statSync(dirFilePath).isFile()) {
    return res.sendFile(dirFilePath);
  }

  if (/\.(js|jsx|css|ico|png|jpg|jpeg|svg|json|woff2?|ttf|map)$/i.test(req.path)) {
    return res.status(404).send('Static asset not found');
  }

  const indexPath = fs.existsSync(path.join(process.cwd(), 'index.html'))
    ? path.join(process.cwd(), 'index.html')
    : path.join(__dirname, 'index.html');

  res.sendFile(indexPath);
});

// Start Server (Chỉ lắng nghe cổng khi chạy ở môi trường Standalone / Local)
if (process.env.NODE_ENV !== 'production' && !process.env.VERCEL) {
  app.listen(PORT, () => {
    console.log('==========================================================');
    console.log(` QLCV UBND Node.js Backend & Web Server running on port ${PORT}`);
    console.log(` Frontend: http://localhost:${PORT}/`);
    console.log(` API Endpoints: http://localhost:${PORT}/api/data`);
    console.log(` Database: Google Sheets API`);
    console.log('==========================================================');
  });
}

// Export app cho Vercel Serverless Function
module.exports = app;

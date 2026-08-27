const { useState, useEffect, useRef, useMemo } = React;

const SESSION_KEY = 'ubnd_task_session_v1';
const SESSION_TIMEOUT_MS = 30 * 60 * 1000; // 30 minutes
const ACCOUNTS_STORAGE_KEY = 'ubnd_task_accounts_v1';

// Pure React SVG Spinner component (Prevents Lucide DOM mutation conflicts during React reconciliation)
function Spinner({ className = "w-4 h-4 text-current" }) {
  return (
    <svg className={`animate-spin inline-block ${className}`} xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
    </svg>
  );
}

// ----------------------------------------------------------------------
// HELPER: Decoupled Lucide Icon Component to prevent React VDOM conflicts
// ----------------------------------------------------------------------
function Icon({ name, className = "w-4 h-4" }) {
  const spanRef = useRef(null);

  useEffect(() => {
    if (spanRef.current && window.lucide) {
      spanRef.current.innerHTML = `<i data-lucide="${name}" class="${className}"></i>`;
      try {
        window.lucide.createIcons({ root: spanRef.current });
      } catch (e) {
        // Fallback catch
      }
    }
  }, [name, className]);

  return <span ref={spanRef} className="inline-flex items-center justify-center shrink-0"></span>;
}

// Dynamic account extraction utility function
function getDynamicAccounts() {
  try {
    const stored = localStorage.getItem(ACCOUNTS_STORAGE_KEY);
    if (stored) {
      const parsed = JSON.parse(stored);
      if (Array.isArray(parsed) && parsed.length > 0) return parsed;
    }
  } catch (e) {
    console.error('Error reading accounts from storage:', e);
  }
  return window.INITIAL_USERS || [
    { username: 'admin', password: 'admin', department: 'ALL', role: 'ADMIN', name: 'Quản trị viên Hệ thống' },
    { username: 'ubnd.vt.pkt', password: 'ubnd.vt.pkt', department: 'Kinh tế', role: 'EDIT', name: 'Văn thư Phòng Kinh tế' },
    { username: 'ubnd.pkt', password: 'ubnd.pkt', department: 'Kinh tế', role: 'VIEW', name: 'Chuyên viên Phòng Kinh tế' },
    { username: 'ubnd.vt.pvh', password: 'ubnd.vt.pvh', department: 'VH - XH', role: 'EDIT', name: 'Văn thư Phòng VH - XH' }
  ];
}

// Utility function to check if an employee is active ("Đang làm việc")
function isEmployeeActive(emp) {
  if (!emp) return false;
  const st = (emp.trang_thai || emp.ghi_chu || 'Đang làm việc').trim().toLowerCase();
  if (st.includes('tạm nghỉ') || st.includes('tam nghi') || st.includes('nghỉ việc') || st.includes('nghi viec') || st.includes('đã chuyển') || st.includes('thôi việc')) {
    return false;
  }
  return true;
}

// Helper to check if a task can be deleted based on status and user role
function canDeleteTask(task, isAdmin) {
  if (!task) return false;
  if (task.trang_thai === 'Hoàn thành') {
    return Boolean(isAdmin);
  }
  return true;
}

// Deterministic Task Array Sorting Utility (Ensures ID descending stability across all state updates)
function sortTasksDeterministically(taskList) {
  if (!Array.isArray(taskList)) return [];
  return [...taskList].sort((a, b) => {
    const idA = Number(a.id) || 0;
    const idB = Number(b.id) || 0;
    if (idA !== idB) {
      return idB - idA; // Primary: Mã CV / ID descending (Task #80, #79, ..., #1)
    }
    const timeA = parseDateToTimestamp(a.ngay_tao);
    const timeB = parseDateToTimestamp(b.ngay_tao);
    return timeB - timeA;
  });
}

// ----------------------------------------------------------------------
// 0. AUTHENTICATION & LOGIN COMPONENT
// ----------------------------------------------------------------------
function LoginScreen({ onLogin, error, setError }) {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (isSubmitting) return;
    setIsSubmitting(true);
    try {
      await onLogin(username, password);
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="min-h-screen bg-slate-900 flex items-center justify-center p-4 relative overflow-hidden">
      <div className="absolute -top-40 -left-40 w-96 h-96 bg-blue-600/30 rounded-full blur-3xl"></div>
      <div className="absolute -bottom-40 -right-40 w-96 h-96 bg-sky-500/20 rounded-full blur-3xl"></div>

      <div className="w-full max-w-md bg-white/95 backdrop-blur-md rounded-2xl shadow-2xl border border-white/20 p-6 md:p-8 space-y-6 z-10 animate-slideUp">
        <div className="text-center space-y-2">
          <div className="w-14 h-14 bg-gradient-to-tr from-blue-700 to-sky-500 text-white rounded-2xl flex items-center justify-center mx-auto shadow-lg shadow-blue-500/30">
            <Icon name="shield-check" className="w-8 h-8" />
          </div>
          <h1 className="text-xl font-extrabold text-slate-900 tracking-tight">HỆ THỐNG QUẢN LÝ CÔNG VIỆC</h1>
          <p className="text-xs font-semibold uppercase text-blue-600 tracking-wider">ỦY BAN NHÂN DÂN XÃ ĐỊNH MỸ</p>
        </div>

        {error && (
          <div className="p-3.5 bg-rose-50 border border-rose-200 text-rose-700 rounded-xl text-xs flex items-center gap-2 animate-fadeIn">
            <Icon name="alert-circle" className="w-4 h-4 shrink-0 text-rose-600" />
            <span>{error}</span>
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-xs font-bold uppercase text-slate-700 mb-1.5">Tài khoản *</label>
            <div className="relative">
              <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none text-slate-400">
                <Icon name="user" className="w-4 h-4" />
              </div>
              <input
                type="text"
                value={username}
                onChange={e => { setUsername(e.target.value); if (setError) setError(''); }}
                className="form-input pl-9 text-xs h-10 w-full"
                required
                autoFocus
              />
            </div>
          </div>

          <div>
            <label className="block text-xs font-bold uppercase text-slate-700 mb-1.5">Mật khẩu *</label>
            <div className="relative">
              <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none text-slate-400">
                <Icon name="lock" className="w-4 h-4" />
              </div>
              <input
                type={showPassword ? 'text' : 'password'}
                value={password}
                onChange={e => { setPassword(e.target.value); if (setError) setError(''); }}
                className="form-input pl-9 pr-9 text-xs h-10 w-full"
                required
              />
              <button
                type="button"
                onClick={() => setShowPassword(!showPassword)}
                className="absolute inset-y-0 right-0 pr-3 flex items-center text-slate-400 hover:text-slate-600"
              >
                <Icon name={showPassword ? 'eye-off' : 'eye'} className="w-4 h-4" />
              </button>
            </div>
          </div>

          <button
            type="submit"
            disabled={isSubmitting}
            className="w-full btn-primary h-11 text-sm font-bold shadow-md shadow-blue-500/20 flex items-center justify-center gap-2 mt-2 disabled:opacity-60"
          >
            {isSubmitting ? (
              <>
                <Spinner className="w-4 h-4 text-white" />
                <span>Đang kết nối kiểm tra...</span>
              </>
            ) : (
              <>
                <Icon name="log-in" className="w-4 h-4" />
                <span>Đăng nhập hệ thống</span>
              </>
            )}
          </button>
        </form>
      </div>
    </div>
  );
}

const ROUTE_MAP = {
  '/': 'dashboard',
  '/dashboard': 'dashboard',
  '/quan-ly-cong-viec': 'tasks',
  '/nhan-vien': 'category-employees',
  '/kpi-danh-gia': 'kpi',
  '/bao-cao-tong-hop': 'reports',
  '/lich-cong-tac': 'schedule',
  '/danh-muc/noi-ban-hanh': 'category-agencies',
  '/danh-muc/trang-thai-cong-viec': 'category-statuses',
  '/danh-muc/cong-chuc': 'category-employees',
  '/danh-muc/tai-khoan': 'category-accounts',
  '/cai-dat-he-thong': 'settings'
};

const TAB_TO_ROUTE = {
  'dashboard': '/dashboard',
  'tasks': '/quan-ly-cong-viec',
  'employees': '/danh-muc/cong-chuc',
  'kpi': '/kpi-danh-gia',
  'reports': '/bao-cao-tong-hop',
  'schedule': '/lich-cong-tac',
  'categories': '/danh-muc/noi-ban-hanh',
  'category-agencies': '/danh-muc/noi-ban-hanh',
  'category-statuses': '/danh-muc/trang-thai-cong-viec',
  'category-employees': '/danh-muc/cong-chuc',
  'category-accounts': '/danh-muc/tai-khoan',
  'settings': '/cai-dat-he-thong'
};

const getTabFromPath = (pathname) => {
  const path = (pathname || window.location.pathname).toLowerCase().replace(/\/$/, '');
  if (!path || path === '') return 'dashboard';
  return ROUTE_MAP[path] || 'dashboard';
};

// ----------------------------------------------------------------------
// MAIN APPLICATION COMPONENT
// ----------------------------------------------------------------------
function App() {
  const [activeTabState, setActiveTabState] = useState(() => getTabFromPath());

  const setActiveTab = (newTab) => {
    setActiveTabState(newTab);
    const targetRoute = TAB_TO_ROUTE[newTab] || '/';
    if (window.location.pathname !== targetRoute) {
      window.history.pushState({ tab: newTab }, '', targetRoute);
    }
  };

  const activeTab = activeTabState;

  useEffect(() => {
    const handlePopState = () => {
      const tab = getTabFromPath(window.location.pathname);
      setActiveTabState(tab);
    };
    window.addEventListener('popstate', handlePopState);
    return () => window.removeEventListener('popstate', handlePopState);
  }, []);

  // Dynamic Account State (extracted from Sheet Settings K-N data source)
  const [accounts, setAccounts] = useState(getDynamicAccounts);

  // Sync accounts to localStorage whenever accounts change
  useEffect(() => {
    try {
      localStorage.setItem(ACCOUNTS_STORAGE_KEY, JSON.stringify(accounts));
    } catch (e) {
      console.error('Error syncing accounts to storage:', e);
    }
  }, [accounts]);

  // Load session safely from localStorage
  const [user, setUser] = useState(() => {
    try {
      const raw = localStorage.getItem(SESSION_KEY);
      if (!raw) return null;
      const data = JSON.parse(raw);
      if (!data || !data.expiresAt || Date.now() > data.expiresAt) {
        localStorage.removeItem(SESSION_KEY);
        return null;
      }
      return data.user;
    } catch (e) {
      return null;
    }
  });

  const [loginError, setLoginError] = useState('');
  const [mobileDrawerOpen, setMobileDrawerOpen] = useState(false);
  const [isSidebarCollapsed, setIsSidebarCollapsed] = useState(false);
  const [tasks, setTasks] = useState(() => sortTasksDeterministically(window.INITIAL_TASKS || []));
  const [employees, setEmployees] = useState(window.INITIAL_EMPLOYEES || []);
  const [categories, setCategories] = useState(window.INITIAL_CATEGORIES || {});

  const [isSyncing, setIsSyncing] = useState(false);
  const [dbConnected, setDbConnected] = useState(true);

  // Health check / ping API for Google Sheets Database status
  const checkDbStatus = async () => {
    try {
      const res = await fetch('/api/status');
      if (res.ok) {
        setDbConnected(true);
      } else {
        setDbConnected(false);
      }
    } catch (e) {
      setDbConnected(false);
    }
  };

  // Fetch real-time data from Google Sheets Backend Server on mount or mutation
  const refreshDataFromBackend = async (forceRefresh = false) => {
    setIsSyncing(true);
    try {
      const url = forceRefresh ? '/api/data?refresh=true&t=' + Date.now() : '/api/data?t=' + Date.now();
      const res = await fetch(url);
      if (res.ok) {
        setDbConnected(true);
        const data = await res.json();
        if (data.tasks && Array.isArray(data.tasks)) {
          setTasks(sortTasksDeterministically(data.tasks));
        }
        if (data.employees && Array.isArray(data.employees)) {
          setEmployees(data.employees);
        }
        if (data.categories && typeof data.categories === 'object') {
          setCategories(data.categories);
        }
        if (data.users && Array.isArray(data.users)) {
          setAccounts(data.users);
        }
      } else {
        setDbConnected(false);
      }
    } catch (e) {
      setDbConnected(false);
      console.warn('Google Sheets Backend Server connection offline, using fallback static data.', e);
    } finally {
      setIsSyncing(false);
    }
  };

  useEffect(() => {
    refreshDataFromBackend();
    checkDbStatus();
    const statusInterval = setInterval(checkDbStatus, 20000);
    return () => clearInterval(statusInterval);
  }, []);
  const [selectedTaskIds, setSelectedTaskIds] = useState([]);
  const [modals, setModals] = useState({
    addTask: false,
    editTask: null,
    taskDetail: null,
    confirmDelete: null,
    confirmBulkDelete: false,
    mobileFilter: false
  });

  const currentDate = new Date();
  const currentMonthStr = String(currentDate.getMonth() + 1);
  const currentYearStr = String(currentDate.getFullYear());

  const [filters, setFilters] = useState({
    fromDate: '',
    toDate: '',
    taskName: '',
    agency: '',
    docNo: '',
    department: 'Kinh tế',
    assignee: '',
    status: '',
    rating: '',
    week: '',
    month: currentMonthStr,
    year: currentYearStr
  });

  const [toasts, setToasts] = useState([]);

  const addToast = (type, title, message) => {
    const id = Date.now();
    setToasts(prev => [...prev, { id, type, title, message }]);
    setTimeout(() => {
      setToasts(prev => prev.filter(t => t.id !== id));
    }, 4000);
  };

  // Auth Handlers - Real-time authentication directly against Google Sheets
  const handleLogin = async (usernameInput, passwordInput) => {
    const cleanUser = (usernameInput || '').trim().toLowerCase();
    const cleanPass = (passwordInput || '').trim();

    try {
      // 1. Send real-time login authentication request to backend (bypassing local cache)
      const res = await fetch('/api/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json; charset=utf-8' },
        body: JSON.stringify({ username: cleanUser, password: cleanPass })
      });

      const data = await res.json().catch(() => ({}));

      if (res.ok && data.success && data.user) {
        const sessionUser = {
          username: data.user.username,
          name: data.user.name || data.user.username,
          department: data.user.department,
          role: data.user.role,
          avatar: data.user.avatar || 'https://images.unsplash.com/photo-1534528741775-53994a69daeb?w=100&auto=format&fit=crop&q=80'
        };

        const sessionData = {
          user: sessionUser,
          loginTime: Date.now(),
          expiresAt: Date.now() + SESSION_TIMEOUT_MS
        };

        localStorage.setItem(SESSION_KEY, JSON.stringify(sessionData));
        setUser(sessionUser);
        setLoginError('');
        addToast('success', 'Đăng nhập thành công', `Xin chào ${sessionUser.name} (${sessionUser.role} - ${sessionUser.department})`);
        return;
      }

      if (data.error) {
        setLoginError(data.error);
        return;
      }
    } catch (err) {
      console.warn('Lỗi kết nối /api/login, chuyển sang kiểm tra thời gian thực:', err);
    }

    // Fallback: Real-time query to /api/data?t=timestamp if /api/login endpoint has network error
    try {
      const dataRes = await fetch('/api/data?t=' + Date.now());
      if (dataRes.ok) {
        const freshData = await dataRes.json();
        if (freshData.users && Array.isArray(freshData.users)) {
          setAccounts(freshData.users);
          const matchedUser = freshData.users.find(u =>
            (u.username || '').trim().toLowerCase() === cleanUser &&
            String(u.password || '').trim() === cleanPass
          );
          if (matchedUser) {
            const sessionUser = {
              username: matchedUser.username,
              name: matchedUser.name || matchedUser.username,
              department: matchedUser.department,
              role: matchedUser.role,
              avatar: 'https://images.unsplash.com/photo-1534528741775-53994a69daeb?w=100&auto=format&fit=crop&q=80'
            };

            const sessionData = {
              user: sessionUser,
              loginTime: Date.now(),
              expiresAt: Date.now() + SESSION_TIMEOUT_MS
            };

            localStorage.setItem(SESSION_KEY, JSON.stringify(sessionData));
            setUser(sessionUser);
            setLoginError('');
            addToast('success', 'Đăng nhập thành công', `Xin chào ${sessionUser.name} (${sessionUser.role} - ${sessionUser.department})`);
            return;
          }
        }
      }
    } catch (fallbackErr) {
      console.error('Lỗi kết nối dữ liệu:', fallbackErr);
    }

    setLoginError('Tài khoản hoặc mật khẩu không chính xác. Vui lòng kiểm tra lại!');
  };

  const handleLogout = (isExpired = false) => {
    localStorage.removeItem(SESSION_KEY);
    setUser(null);
    if (isExpired) {
      addToast('warning', 'Hết hạn phiên', 'Phiên làm việc đã hết hạn (30 phút). Vui lòng đăng nhập lại!');
    } else {
      addToast('info', 'Đăng xuất', 'Đã đăng xuất khỏi hệ thống thành công.');
    }
  };

  // Periodic 30-minute session expiry check (every 10s)
  useEffect(() => {
    if (!user) return;
    const interval = setInterval(() => {
      try {
        const raw = localStorage.getItem(SESSION_KEY);
        if (!raw) {
          handleLogout(true);
          return;
        }
        const data = JSON.parse(raw);
        if (!data || !data.expiresAt || Date.now() > data.expiresAt) {
          handleLogout(true);
        }
      } catch (e) {
        handleLogout(true);
      }
    }, 10000);
    return () => clearInterval(interval);
  }, [user]);

  // Derived RBAC permissions
  const isAdmin = user?.role === 'ADMIN' || user?.department === 'ALL';
  const isEdit = user?.role === 'EDIT' || isAdmin;
  const isViewOnly = user?.role === 'VIEW' && !isAdmin;
  const userDept = user?.department || 'Kinh tế';

  // Protect menu tabs for non-admin users
  useEffect(() => {
    if (user && !isAdmin && (activeTab === 'categories' || activeTab === 'settings')) {
      setActiveTab('dashboard');
    }
  }, [user, isAdmin, activeTab]);

  // Department task filtering according to role
  const visibleTasks = useMemo(() => {
    if (isAdmin) return tasks;
    return tasks.filter(t => t.phong_ban === userDept);
  }, [tasks, isAdmin, userDept]);

  // Recalculate KPIs dynamically for visible tasks
  const kpiData = useMemo(() => {
    return employees.map(emp => {
      const empTasks = visibleTasks.filter(t => t.nguoi_phu_trach === emp.ho_ten);
      const total = empTasks.length;
      const completed = empTasks.filter(t => t.trang_thai === 'Hoàn thành').length;
      const inProgress = empTasks.filter(t => t.trang_thai === 'Đang thực hiện').length;
      const overdue = empTasks.filter(t => {
        if (!t.deadline) return false;
        if (t.trang_thai === 'Hoàn thành' && t.ngay_hoan_thanh && t.ngay_hoan_thanh > t.deadline) return true;
        if (t.trang_thai !== 'Hoàn thành' && t.trang_thai !== 'Hủy' && new Date() > new Date(t.deadline)) return true;
        return false;
      }).length;
      const rate = total > 0 ? (completed / total) : 0;
      const score = Math.max(0, Math.round(rate * 100 - overdue * 5));

      return {
        ...emp,
        total,
        completed,
        inProgress,
        overdue,
        rate: Math.round(rate * 100),
        score
      };
    }).sort((a, b) => b.score - a.score);
  }, [visibleTasks, employees]);

  // Handlers for Tasks CRUD with tight RBAC protection
  const handleCreateTask = async (newTaskData) => {
    if (isViewOnly) {
      addToast('danger', 'Từ chối truy cập', 'Tài khoản VIEW chỉ có quyền xem, không thể thêm mới công việc!');
      return;
    }
    const nextId = tasks.reduce((max, t) => Math.max(max, Number(t.id) || 0), 0) + 1;
    const newTask = {
      id: nextId,
      noi_ban_hanh: newTaskData.noi_ban_hanh || newTaskData.agency || 'Sở Tài Chính',
      so_cong_van: newTaskData.so_cong_van || newTaskData.docNo || '01/UBND-KT',
      ten_cong_viec: newTaskData.ten_cong_viec || newTaskData.taskName,
      mo_ta: newTaskData.mo_ta || newTaskData.description || '',
      phong_ban: newTaskData.phong_ban || newTaskData.department || (userDept !== 'ALL' ? userDept : 'Kinh tế'),
      nguoi_phu_trach: newTaskData.nguoi_phu_trach || newTaskData.assignee || '',
      ngay_tao: newTaskData.ngay_tao || newTaskData.createdDate || formatDate(new Date()),
      deadline: newTaskData.deadline || '',
      ngay_hoan_thanh: '',
      trang_thai: 'Đang thực hiện',
      ket_qua: newTaskData.ket_qua || newTaskData.result || '',
      ghi_chu: '',
      so_ngay_con_lai: '',
      so_ngay_tre: '',
      danh_gia: calculateEvaluation(newTaskData),
      tuan: 23,
      thang: 6,
      nam: 2026
    };

    setTasks(prev => sortTasksDeterministically([newTask, ...prev]));
    setModals(prev => ({ ...prev, addTask: false }));
    addToast('success', 'Thành công', 'Thêm mới công việc thành công');
    setIsSyncing(true);

    try {
      const res = await fetch('/api/add', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json; charset=utf-8' },
        body: JSON.stringify({ type: 'tasks', data: newTask })
      });
      if (res.ok) {
        const data = await res.json();
        if (data.fileStatus && data.fileStatus.ticks) {
          lastSyncedTicksRef.current = data.fileStatus.ticks;
        }
        await refreshDataFromBackend(true);
      }
    } catch (e) {
      console.error('Background sync add error:', e);
    } finally {
      setIsSyncing(false);
    }
  };

  const handleUpdateTask = async (updatedTask) => {
    if (isViewOnly) {
      addToast('danger', 'Từ chối truy cập', 'Tài khoản VIEW chỉ có quyền xem, không thể chỉnh sửa công việc!');
      return;
    }

    if (!updatedTask || !updatedTask.id) {
      addToast('danger', 'Lỗi dữ liệu', 'Không tìm thấy ID công việc để cập nhật!');
      return;
    }

    const originalTask = tasks.find(t => t.id === updatedTask.id);
    const fullPayload = {
      ...originalTask,
      ...updatedTask,
      excel_row: updatedTask.excel_row || originalTask?.excel_row || null
    };

    setTasks(prev => sortTasksDeterministically(prev.map(t => t.id === updatedTask.id ? { ...t, ...fullPayload } : t)));
    setModals(prev => ({ ...prev, editTask: null }));
    addToast('success', 'Thành công', 'Cập nhật dữ liệu thành công');
    setIsSyncing(true);

    try {
      const res = await fetch('/api/update', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json; charset=utf-8' },
        body: JSON.stringify({ type: 'tasks', data: fullPayload })
      });
      if (res.ok) {
        const data = await res.json();
        if (data.fileStatus && data.fileStatus.ticks) {
          lastSyncedTicksRef.current = data.fileStatus.ticks;
        }
        await refreshDataFromBackend(true);
      } else {
        const errData = await res.json().catch(() => ({}));
        const errMsg = errData.error || `HTTP status ${res.status}`;
        console.error('Update API returned error status:', res.status, errMsg);
        addToast('danger', 'Lỗi cập nhật Excel', `Không thể lưu vào Excel: ${errMsg}`);
        await refreshDataFromBackend(true);
      }
    } catch (e) {
      console.error('Background sync update error:', e);
      addToast('danger', 'Lỗi kết nối', 'Không thể kết nối đến server backend local!');
      await refreshDataFromBackend(true);
    } finally {
      setIsSyncing(false);
    }
  };

  const handleDeleteTask = async (taskId) => {
    if (isViewOnly) {
      addToast('danger', 'Từ chối truy cập', 'Tài khoản VIEW chỉ có quyền xem, không thể xóa công việc!');
      return;
    }
    const target = tasks.find(t => t.id === taskId);
    if (!target) return;

    if (target.trang_thai === 'Hoàn thành' && !isAdmin) {
      addToast('danger', 'Từ chối truy cập', 'Công việc đã hoàn thành: Chỉ tài khoản Quản trị tối cao (Admin / quyền ALL) mới có quyền xóa!');
      return;
    }

    setTasks(prev => sortTasksDeterministically(prev.filter(t => t.id !== taskId)));
    setModals(prev => ({ ...prev, confirmDelete: null }));
    addToast('success', 'Đã xóa', `Đã xóa công việc #${taskId}`);
    setIsSyncing(true);

    try {
      const res = await fetch('/api/delete', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json; charset=utf-8' },
        body: JSON.stringify({
          type: 'tasks',
          id: taskId,
          data: target,
          userRole: user?.role,
          userDepartment: user?.department
        })
      });
      if (!res.ok) {
        const errData = await res.json().catch(() => ({}));
        addToast('danger', 'Từ chối truy cập', errData.error || 'API từ chối quyền xóa công việc đã hoàn thành!');
        await refreshDataFromBackend();
      } else {
        await refreshDataFromBackend();
      }
    } catch (e) {
      console.error('Background sync delete error:', e);
    } finally {
      setIsSyncing(false);
    }
  };

  const handleRequestBulkDelete = () => {
    if (isViewOnly || selectedTaskIds.length === 0) return;
    if (!isAdmin) {
      const selectedTasks = tasks.filter(t => selectedTaskIds.includes(t.id));
      const hasCompleted = selectedTasks.some(t => t.trang_thai === 'Hoàn thành');
      if (hasCompleted) {
        addToast('danger', 'Từ chối truy cập', 'Danh sách đã chọn chứa công việc đã hoàn thành. Chỉ Admin mới có quyền xóa công việc đã hoàn thành!');
        return;
      }
    }
    setModals(prev => ({ ...prev, confirmBulkDelete: true }));
  };

  const handleConfirmBulkDelete = async () => {
    if (isViewOnly || selectedTaskIds.length === 0) return;
    setModals(prev => ({ ...prev, confirmBulkDelete: false }));

    let selectedTasks = tasks.filter(t => selectedTaskIds.includes(t.id));
    if (!isAdmin) {
      selectedTasks = selectedTasks.filter(t => t.trang_thai !== 'Hoàn thành');
    }
    const count = selectedTasks.length;
    if (count === 0) {
      addToast('warning', 'Thông báo', 'Không có công việc nào hợp lệ để xóa.');
      return;
    }

    const idsToDelete = selectedTasks.map(t => t.id);
    setTasks(prev => sortTasksDeterministically(prev.filter(t => !idsToDelete.includes(t.id))));
    setSelectedTaskIds([]);
    addToast('success', 'Đã xóa hàng loạt', `Đã xóa thành công ${count} công việc khỏi Google Sheets!`);
    setIsSyncing(true);

    try {
      await Promise.all(selectedTasks.map(task =>
        fetch('/api/delete', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json; charset=utf-8' },
          body: JSON.stringify({
            type: 'tasks',
            id: task.id,
            data: { id: task.id, excel_row: task.excel_row, so_cong_van: task.so_cong_van },
            userRole: user?.role,
            userDepartment: user?.department
          })
        })
      ));
      await refreshDataFromBackend();
    } catch (e) {
      console.error('Lỗi khi xóa hàng loạt:', e);
      addToast('danger', 'Lỗi kết nối Cloud', 'Không thể kết nối đến máy chủ Google Sheets!');
    } finally {
      setIsSyncing(false);
    }
  };

  const handleBulkComplete = async () => {
    if (isViewOnly || selectedTaskIds.length === 0) return;

    const selectedTasks = tasks.filter(t => selectedTaskIds.includes(t.id));
    const count = selectedTasks.length;
    if (count === 0) return;

    const now = new Date();
    const dd = String(now.getDate()).padStart(2, '0');
    const mm = String(now.getMonth() + 1).padStart(2, '0');
    const yyyy = now.getFullYear();
    const todayFormatted = `${dd}/${mm}/${yyyy}`;

    // 1. Instant Optimistic UI Update (0ms Latency)
    setTasks(prev => sortTasksDeterministically(prev.map(t => {
      if (selectedTaskIds.includes(t.id)) {
        return {
          ...t,
          trang_thai: 'Hoàn thành',
          ngay_hoan_thanh: todayFormatted,
          danh_gia: calculateEvaluation({ ...t, trang_thai: 'Hoàn thành', ngay_hoan_thanh: todayFormatted })
        };
      }
      return t;
    })));
    setSelectedTaskIds([]);
    addToast('success', 'Hoàn thành hàng loạt', `Đã chuyển ${count} công việc sang trạng thái "Hoàn thành" và lưu vào Google Sheets!`);
    setIsSyncing(true);

    // 2. Background Async Google Sheets API Call
    try {
      await Promise.all(selectedTasks.map(task => {
        const updateData = {
          ...task,
          trang_thai: 'Hoàn thành',
          ngay_hoan_thanh: todayFormatted,
          danh_gia: calculateEvaluation({ ...task, trang_thai: 'Hoàn thành', ngay_hoan_thanh: todayFormatted })
        };
        return fetch('/api/update', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json; charset=utf-8' },
          body: JSON.stringify({ type: 'tasks', data: updateData })
        });
      }));
      await refreshDataFromBackend();
    } catch (e) {
      console.error('Lỗi khi cập nhật hoàn thành hàng loạt:', e);
      addToast('danger', 'Lỗi kết nối Cloud', 'Không thể kết nối đến máy chủ Google Sheets!');
    } finally {
      setIsSyncing(false);
    }
  };

  // Refresh Lucide icons whenever state changes
  useEffect(() => {
    const timer = setTimeout(() => {
      if (window.lucide) {
        window.lucide.createIcons();
      }
    }, 50);
    return () => clearTimeout(timer);
  }, [activeTab, user, modals, tasks, selectedTaskIds]);

  // If user is not logged in, show Login Screen
  if (!user) {
    return <LoginScreen onLogin={handleLogin} error={loginError} setError={setLoginError} />;
  }

  return (
    <div className="flex h-screen overflow-hidden bg-slate-50">
      {/* Toast System */}
      <ToastContainer toasts={toasts} setToasts={setToasts} />

      {/* Desktop Sidebar */}
      <Sidebar
        activeTab={activeTab}
        setActiveTab={setActiveTab}
        user={user}
        onLogout={() => handleLogout(false)}
        isCollapsed={isSidebarCollapsed}
        onToggleCollapse={() => setIsSidebarCollapsed(prev => !prev)}
      />

      {/* Mobile Navigation Drawer */}
      <MobileDrawer
        isOpen={mobileDrawerOpen}
        onClose={() => setMobileDrawerOpen(false)}
        activeTab={activeTab}
        setActiveTab={setActiveTab}
        user={user}
        onLogout={() => handleLogout(false)}
      />

      {/* Main Layout Area */}
      <div className="flex-1 flex flex-col min-w-0 overflow-hidden relative">
        {/* Topbar */}
        <Topbar
          user={user}
          activeTab={activeTab}
          setActiveTab={setActiveTab}
          onOpenMobileDrawer={() => setMobileDrawerOpen(true)}
          onLogout={() => handleLogout(false)}
          dbConnected={dbConnected}
          isSidebarCollapsed={isSidebarCollapsed}
          onToggleSidebar={() => setIsSidebarCollapsed(prev => !prev)}
          tasks={visibleTasks}
          onOpenTaskDetail={(task) => setModals(prev => ({ ...prev, taskDetail: task }))}
        />

        {/* Content Area */}
        <main className="flex-1 overflow-y-auto p-2.5 md:p-4 lg:px-4 lg:py-3.5">
          {activeTab === 'dashboard' && (
            <DashboardView
              tasks={visibleTasks}
              filters={filters}
              setFilters={setFilters}
              categories={categories}
              onOpenDetail={(task) => setModals(prev => ({ ...prev, taskDetail: task }))}
            />
          )}
          {activeTab === 'tasks' && (
            <TasksView
              tasks={visibleTasks}
              employees={employees}
              user={user}
              filters={filters}
              setFilters={setFilters}
              selectedTaskIds={selectedTaskIds}
              setSelectedTaskIds={setSelectedTaskIds}
              onOpenAddTask={() => setModals(prev => ({ ...prev, addTask: true }))}
              onOpenEditTask={(task) => setModals(prev => ({ ...prev, editTask: task }))}
              onOpenDetail={(task) => setModals(prev => ({ ...prev, taskDetail: task }))}
              onConfirmDelete={(id) => setModals(prev => ({ ...prev, confirmDelete: id }))}
              onBulkDelete={handleRequestBulkDelete}
              onBulkComplete={handleBulkComplete}
              onOpenMobileFilter={() => setModals(prev => ({ ...prev, mobileFilter: true }))}
              categories={categories}
              isViewOnly={isViewOnly}
            />
          )}
          {activeTab === 'employees' && (
            <EmployeesView
              employees={employees}
              setEmployees={setEmployees}
              categories={categories}
              onRefresh={refreshDataFromBackend}
              addToast={addToast}
            />
          )}
          {activeTab === 'kpi' && <KPIView tasks={visibleTasks} employees={employees} categories={categories} user={user} addToast={addToast} />}
          {activeTab === 'reports' && <ReportsView tasks={visibleTasks} employees={employees} categories={categories} user={user} addToast={addToast} />}
          {activeTab === 'schedule' && <ScheduleView />}
          {isAdmin && activeTab === 'categories' && (
            <CategoriesView
              subTab="category-agencies"
              categories={categories}
              setCategories={setCategories}
              employees={employees}
              setEmployees={setEmployees}
              accounts={accounts}
              setAccounts={setAccounts}
              user={user}
              setUser={setUser}
              onRefresh={refreshDataFromBackend}
              addToast={addToast}
            />
          )}
          {isAdmin && activeTab.startsWith('category-') && (
            <CategoriesView
              subTab={activeTab}
              categories={categories}
              setCategories={setCategories}
              employees={employees}
              setEmployees={setEmployees}
              accounts={accounts}
              setAccounts={setAccounts}
              user={user}
              setUser={setUser}
              onRefresh={refreshDataFromBackend}
              addToast={addToast}
            />
          )}
          {isAdmin && activeTab === 'settings' && (
            <SettingsView
              user={user}
              setUser={setUser}
              accounts={accounts}
              setAccounts={setAccounts}
              addToast={addToast}
            />
          )}
        </main>
      </div>

      {/* Modals & Drawers */}
      {modals.addTask && !isViewOnly && (
        <AddTaskModal
          categories={categories}
          employees={employees}
          defaultDepartment={userDept}
          onClose={() => setModals(prev => ({ ...prev, addTask: false }))}
          onSubmit={handleCreateTask}
        />
      )}

      {modals.editTask && !isViewOnly && (
        <EditTaskModal
          task={modals.editTask}
          categories={categories}
          employees={employees}
          onClose={() => setModals(prev => ({ ...prev, editTask: null }))}
          onSubmit={handleUpdateTask}
        />
      )}

      {modals.taskDetail && (
        <TaskDetailModal
          task={modals.taskDetail}
          isViewOnly={isViewOnly}
          onClose={() => setModals(prev => ({ ...prev, taskDetail: null }))}
          onOpenEditTask={(t) => setModals({ ...modals, taskDetail: null, editTask: t })}
          onOpenPrintSubmission={(t) => setModals(prev => ({ ...prev, taskDetail: null, printSubmission: t }))}
        />
      )}

      {modals.printSubmission && (
        <SubmissionPrintModal
          task={modals.printSubmission}
          onClose={() => setModals(prev => ({ ...prev, printSubmission: null }))}
          addToast={addToast}
        />
      )}

      {modals.confirmDelete && !isViewOnly && (
        <ConfirmModal
          title="Xác nhận xóa công việc"
          message="Bạn có chắc chắn muốn xóa công việc này? Thao tác này không thể hoàn tác."
          onClose={() => setModals(prev => ({ ...prev, confirmDelete: null }))}
          onConfirm={() => handleDeleteTask(modals.confirmDelete)}
        />
      )}

      {modals.confirmBulkDelete && !isViewOnly && (
        <ConfirmModal
          title="Xác nhận xóa hàng loạt"
          message={`Bạn có chắc chắn muốn xóa ${selectedTaskIds.length} công việc đã chọn? Thao tác này sẽ xóa vĩnh viễn dữ liệu khỏi Google Sheets và không thể hoàn tác.`}
          onClose={() => setModals(prev => ({ ...prev, confirmBulkDelete: false }))}
          onConfirm={handleConfirmBulkDelete}
        />
      )}

      {/* Floating Action Button for Mobile */}
      {!isViewOnly && (
        <button
          onClick={() => setModals(prev => ({ ...prev, addTask: true }))}
          className="hidden"
          title="Thêm công việc mới"
        >
          <Icon name="plus" className="w-6 h-6" />
        </button>
      )}
    </div>
  );
}

// ----------------------------------------------------------------------
// 2. SIDEBAR COMPONENT (DESKTOP)
// ----------------------------------------------------------------------
// 2. DESKTOP SIDEBAR COMPONENT
// ----------------------------------------------------------------------
function Sidebar({ activeTab, setActiveTab, user, onLogout, isCollapsed = false, onToggleCollapse }) {
  const isAdmin = user?.role === 'ADMIN' || user?.department === 'ALL';

  const [isCatOpen, setIsCatOpen] = useState(() => activeTab.startsWith('category') || activeTab === 'categories');

  useEffect(() => {
    if (activeTab.startsWith('category') || activeTab === 'categories') {
      setIsCatOpen(true);
    }
  }, [activeTab]);

  const menuItems = [
    { id: 'dashboard', label: 'Dashboard', icon: 'layout-dashboard' },
    { id: 'tasks', label: 'Quản lý công việc', icon: 'check-square' },
    { id: 'kpi', label: 'Đánh giá công việc', icon: 'award' },
    { id: 'reports', label: 'Báo cáo tổng hợp', icon: 'bar-chart-3' },
    { id: 'schedule', label: 'Lịch công tác', icon: 'calendar' }
  ];

  const subMenuItems = [
    { id: 'category-agencies', label: 'Nơi ban hành', icon: 'building' },
    { id: 'category-statuses', label: 'Trạng thái công việc', icon: 'check-circle-2' },
    { id: 'category-employees', label: 'Công chức', icon: 'users-2' },
    { id: 'category-accounts', label: 'Tài khoản', icon: 'shield' }
  ];

  const isCatActive = activeTab === 'categories' || activeTab.startsWith('category-');

  return (
    <aside
      className={`hidden md:flex flex-col bg-white border-r border-slate-200 shrink-0 select-none transition-all duration-300 ease-in-out ${
        isCollapsed ? 'w-20' : 'w-64'
      }`}
    >
      {/* Brand Header */}
      <div className={`h-16 border-b border-slate-100 flex items-center ${isCollapsed ? 'justify-center px-2' : 'justify-between px-4'}`}>
        <div className="flex items-center gap-3 min-w-0">
          <div className="w-9 h-9 rounded-xl bg-blue-600 text-white flex items-center justify-center shadow-md shadow-blue-500/20 shrink-0">
            <Icon name="shield-check" className="w-5 h-5" />
          </div>
          <div className={`min-w-0 ${isCollapsed ? 'hidden' : 'block'}`}>
            <h2 className="font-extrabold text-slate-900 leading-tight text-xs uppercase tracking-tight truncate">UBND XÃ ĐỊNH MỸ</h2>
            <span className="text-[11px] font-bold text-blue-600 block leading-tight truncate">QUẢN LÝ CÔNG VIỆC</span>
          </div>
        </div>
        {onToggleCollapse && (
          <button
            type="button"
            onClick={onToggleCollapse}
            className="hidden"
            title="Thu gọn thanh menu (Collapse Sidebar)"
          >
            <Icon name="panel-left-close" className="w-4 h-4" />
          </button>
        )}
      </div>

      {/* Navigation Items */}
      <nav className="flex-1 p-3 space-y-1 overflow-y-auto">
        <div className={`flex justify-center pb-2.5 border-b border-slate-100 mb-2.5 ${isCollapsed ? 'block' : 'hidden'}`}>
          {onToggleCollapse && (
            <button
              type="button"
              onClick={onToggleCollapse}
              className="w-10 h-10 rounded-xl bg-blue-50 border border-blue-200/80 text-blue-600 hover:bg-blue-600 hover:text-white flex items-center justify-center transition-all duration-200 shadow-xs hover:scale-105 active:scale-95 group"
              title="Mở rộng thanh menu (Expand Sidebar)"
            >
              <Icon name="panel-left-open" className="w-5 h-5 transition-transform duration-200 group-hover:scale-110" />
            </button>
          )}
        </div>

        {menuItems.map(item => {
          const active = activeTab === item.id;
          return (
            <button
              key={item.id}
              onClick={() => setActiveTab(item.id)}
              title={isCollapsed ? item.label : undefined}
              className={`w-full flex items-center ${isCollapsed ? 'justify-center px-2 py-3' : 'justify-between px-3.5 py-2.5'} rounded-xl font-medium text-sm transition-all duration-150 ${
                active
                  ? 'bg-blue-50 text-blue-600 font-semibold shadow-xs'
                  : 'text-slate-600 hover:bg-slate-50 hover:text-slate-900'
              }`}
            >
              <div className={`flex items-center ${isCollapsed ? 'justify-center' : 'gap-3'}`}>
                <Icon name={item.icon} className={`w-5 h-5 ${active ? 'text-blue-600' : 'text-slate-400'}`} />
                <span className={isCollapsed ? 'hidden' : 'inline'}>{item.label}</span>
              </div>
            </button>
          );
        })}

        {/* Collapsible Danh mục Sub-menu */}
        {isAdmin && (
          <div className="pt-1">
            <button
              type="button"
              onClick={() => {
                if (isCollapsed && onToggleCollapse) {
                  onToggleCollapse();
                }
                setIsCatOpen(prev => !prev);
              }}
              title={isCollapsed ? "Danh mục" : undefined}
              className={`w-full flex items-center ${isCollapsed ? 'justify-center px-2 py-3' : 'justify-between px-3.5 py-2.5'} rounded-xl font-medium text-sm transition-all duration-150 ${
                isCatActive
                  ? 'bg-blue-50 text-blue-600 font-semibold shadow-xs'
                  : 'text-slate-600 hover:bg-slate-50 hover:text-slate-900'
              }`}
            >
              <div className={`flex items-center ${isCollapsed ? 'justify-center' : 'gap-3'}`}>
                <Icon name="folder-tree" className={`w-5 h-5 ${isCatActive ? 'text-blue-600' : 'text-slate-400'}`} />
                <span className={isCollapsed ? 'hidden' : 'inline'}>Danh mục</span>
              </div>
              <Icon name="chevron-down" className={`w-4 h-4 text-slate-400 transition-transform duration-200 ${isCatOpen ? 'rotate-180' : ''} ${isCollapsed ? 'hidden' : 'inline-block'}`} />
            </button>

            <div className={`pl-4 pr-1 space-y-1 mt-1 ${isCollapsed || !isCatOpen ? 'hidden' : 'block'}`}>
              {subMenuItems.map(sub => {
                const isSubActive = activeTab === sub.id;
                return (
                  <button
                    key={sub.id}
                    type="button"
                    onClick={() => setActiveTab(sub.id)}
                    className={`w-full flex items-center gap-2.5 px-3 py-2 rounded-lg text-xs font-medium transition-colors ${
                      isSubActive
                        ? 'bg-blue-600 text-white font-semibold shadow-xs'
                        : 'text-slate-600 hover:bg-slate-100 hover:text-slate-900'
                    }`}
                  >
                    <Icon name={sub.subIcon || sub.icon} className={`w-3.5 h-3.5 ${isSubActive ? 'text-white' : 'text-slate-400'}`} />
                    <span>{sub.label}</span>
                  </button>
                );
              })}
            </div>
          </div>
        )}

        {isAdmin && (
          <button
            onClick={() => setActiveTab('settings')}
            title={isCollapsed ? "Cài đặt hệ thống" : undefined}
            className={`w-full flex items-center ${isCollapsed ? 'justify-center px-2 py-3' : 'justify-between px-3.5 py-2.5'} rounded-xl font-medium text-sm transition-all duration-150 ${
              activeTab === 'settings'
                ? 'bg-blue-50 text-blue-600 font-semibold shadow-xs'
                : 'text-slate-600 hover:bg-slate-50 hover:text-slate-900'
            }`}
          >
            <div className={`flex items-center ${isCollapsed ? 'justify-center' : 'gap-3'}`}>
              <Icon name="settings" className={`w-5 h-5 ${activeTab === 'settings' ? 'text-blue-600' : 'text-slate-400'}`} />
              <span className={isCollapsed ? 'hidden' : 'inline'}>Cài đặt hệ thống</span>
            </div>
          </button>
        )}
      </nav>

      {/* Footer Profile & Logout */}
      <div className={`p-3 border-t border-slate-100 ${isCollapsed ? 'flex justify-center' : ''}`}>
        <button
          onClick={onLogout}
          title={isCollapsed ? "Đăng xuất" : undefined}
          className={`w-full flex items-center ${isCollapsed ? 'justify-center px-2 py-2.5' : 'gap-3 px-3.5 py-2.5'} rounded-xl text-sm font-medium text-rose-600 hover:bg-rose-50 transition-colors`}
        >
          <Icon name="log-out" className="w-5 h-5" />
          <span className={isCollapsed ? 'hidden' : 'inline'}>Đăng xuất</span>
        </button>
      </div>
    </aside>
  );
}

// ----------------------------------------------------------------------
// 3. TOPBAR COMPONENT
// ----------------------------------------------------------------------
function Topbar({ user, activeTab, setActiveTab, onOpenMobileDrawer, onLogout, dbConnected = true, isSidebarCollapsed = false, onToggleSidebar, tasks = [], onOpenTaskDetail }) {
  const [isNotifOpen, setIsNotifOpen] = useState(false);
  const [notifFilter, setNotifFilter] = useState('all'); // 'all', 'overdue', 'due'
  const [readNotifIds, setReadNotifIds] = useState(new Set());
  const notifRef = useRef(null);

  // Outside click listener to close popover
  useEffect(() => {
    function handleClickOutside(event) {
      if (notifRef.current && !notifRef.current.contains(event.target)) {
        setIsNotifOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  // Compute real-time notification list
  const notifications = useMemo(() => {
    const todayTime = new Date().setHours(0, 0, 0, 0);
    const result = [];

    tasks.forEach(t => {
      const st = (t.trang_thai || '').trim();
      if (st === 'Hoàn thành' || st.toLowerCase().includes('hủy')) return;

      const dlTime = parseDateToTimestamp(t.deadline);
      if (!dlTime || dlTime === 0) return;

      if (dlTime < todayTime) {
        // Overdue
        const diffDays = Math.max(1, Math.ceil((todayTime - dlTime) / (1000 * 60 * 60 * 24)));
        result.push({
          id: `notif-overdue-${t.id || t.so_cong_van}`,
          type: 'overdue',
          title: t.ten_cong_viec || 'Công việc chưa đặt tên',
          so_cong_van: t.so_cong_van || '--',
          nguoi_phu_trach: t.nguoi_phu_trach || '--',
          badgeText: `Quá hạn ${diffDays} ngày`,
          badgeColor: 'rose',
          dlTime,
          task: t
        });
      } else if (dlTime >= todayTime && dlTime <= todayTime + (2 * 86400000)) {
        // Due Today or Soon (within 2 days)
        const diffDays = Math.round((dlTime - todayTime) / (1000 * 60 * 60 * 24));
        const badgeText = diffDays === 0 ? 'Hạn chót hôm nay' : `Hạn chót còn ${diffDays} ngày`;
        result.push({
          id: `notif-due-${t.id || t.so_cong_van}`,
          type: 'due',
          title: t.ten_cong_viec || 'Công việc chưa đặt tên',
          so_cong_van: t.so_cong_van || '--',
          nguoi_phu_trach: t.nguoi_phu_trach || '--',
          badgeText: badgeText,
          badgeColor: 'amber',
          dlTime,
          task: t
        });
      }
    });

    // Sort overdue first, then by deadline
    return result.sort((a, b) => {
      if (a.type === 'overdue' && b.type !== 'overdue') return -1;
      if (a.type !== 'overdue' && b.type === 'overdue') return 1;
      return a.dlTime - b.dlTime;
    });
  }, [tasks]);

  // Filtered Notifications based on selected tab ('all', 'overdue', 'due')
  const filteredNotifs = useMemo(() => {
    if (notifFilter === 'overdue') return notifications.filter(n => n.type === 'overdue');
    if (notifFilter === 'due') return notifications.filter(n => n.type === 'due');
    return notifications;
  }, [notifications, notifFilter]);

  // Unread Count
  const unreadCount = useMemo(() => {
    return notifications.filter(n => !readNotifIds.has(n.id)).length;
  }, [notifications, readNotifIds]);

  // Mark all as read
  const handleMarkAllRead = () => {
    const allIds = new Set(notifications.map(n => n.id));
    setReadNotifIds(allIds);
  };

  // Click on a notification item
  const handleItemClick = (notif) => {
    setReadNotifIds(prev => new Set([...prev, notif.id]));
    setIsNotifOpen(false);
    if (onOpenTaskDetail) {
      onOpenTaskDetail(notif.task);
    } else if (setActiveTab) {
      setActiveTab('tasks');
    }
  };

  const getTitle = () => {
    switch (activeTab) {
      case 'dashboard': return 'Dashboard';
      case 'tasks': return 'Quản lý công việc';
      case 'employees': return 'Nhân viên';
      case 'kpi': return 'Đánh giá công việc';
      case 'reports': return 'Báo cáo tổng hợp';
      case 'schedule': return 'Lịch công tác';
      case 'categories':
      case 'category-agencies': return 'Quản lý danh mục - Nơi ban hành';
      case 'category-statuses': return 'Quản lý danh mục - Trạng thái công việc';
      case 'category-employees': return 'Quản lý danh mục - Công chức';
      case 'category-accounts': return 'Quản lý danh mục - Tài khoản';
      case 'settings': return 'Cài đặt hệ thống';
      default: return 'Dashboard';
    }
  };

  const roleColor = user?.role === 'ADMIN' || user?.department === 'ALL'
    ? 'bg-purple-100 text-purple-700 border-purple-200'
    : user?.role === 'EDIT'
      ? 'bg-emerald-100 text-emerald-700 border-emerald-200'
      : 'bg-amber-100 text-amber-700 border-amber-200';

  return (
    <header className="h-16 bg-white border-b border-slate-200 px-4 md:px-6 flex items-center justify-between shrink-0 z-20">
      {/* Left: Mobile Toggle, Desktop Sidebar Toggle & Breadcrumb */}
      <div className="flex items-center gap-3">
        <button
          onClick={onOpenMobileDrawer}
          className="md:hidden p-2 rounded-lg text-slate-600 hover:bg-slate-100"
        >
          <i data-lucide="menu" className="w-5 h-5"></i>
        </button>

        {onToggleSidebar && (
          <button
            type="button"
            onClick={onToggleSidebar}
            className="hidden md:flex items-center justify-center w-9 h-9 rounded-xl bg-slate-50 border border-slate-200/80 text-slate-600 hover:text-blue-600 hover:bg-blue-50/80 hover:border-blue-200/80 active:scale-95 transition-all duration-200 shadow-2xs group"
            title={isSidebarCollapsed ? "Mở rộng thanh menu (Expand Sidebar)" : "Thu gọn thanh menu (Collapse Sidebar)"}
          >
            <Icon
              name={isSidebarCollapsed ? "panel-left-open" : "panel-left-close"}
              className="w-4.5 h-4.5 transition-transform duration-200 group-hover:scale-110"
            />
          </button>
        )}

        <div>
          <h1 className="text-base md:text-lg font-bold text-slate-900 leading-tight">{getTitle()}</h1>
          <div className="hidden sm:flex items-center gap-1.5 text-xs text-slate-400">
            <span>Trang chủ</span>
            <span>/</span>
            <span className="text-slate-600 font-medium">{getTitle()}</span>
          </div>
        </div>
      </div>

      {/* Right: Dynamic DB Status Badge, Notifications & User */}
      <div className="flex items-center gap-3 md:gap-4">
        {/* Dynamic Database Connection Status Indicator */}
        <div
          className={`flex items-center gap-2 px-3 py-1.5 rounded-full text-xs font-medium border shadow-2xs cursor-default transition-all duration-200 ${
            dbConnected
              ? 'bg-emerald-50 text-emerald-700 border-emerald-200/80'
              : 'bg-rose-50 text-rose-700 border-rose-200/80 animate-pulse'
          }`}
          title={dbConnected ? 'Hệ thống đã kết nối thành công với Google Sheets Database' : 'Cảnh báo: Không thể kết nối với Google Sheets Database'}
        >
          <span className="relative flex h-2 w-2">
            <span className={`animate-ping absolute inline-flex h-full w-full rounded-full opacity-75 ${dbConnected ? 'bg-emerald-400' : 'bg-rose-400'}`}></span>
            <span className={`relative inline-flex rounded-full h-2 w-2 ${dbConnected ? 'bg-emerald-500' : 'bg-rose-500'}`}></span>
          </span>
          <span className="hidden sm:inline font-bold">
            {dbConnected ? 'Đã kết nối database' : 'LỖI KẾT NỐI DATABASE'}
          </span>
          <span className="sm:hidden font-bold">
            {dbConnected ? 'DB OK' : 'LỖI DB'}
          </span>
        </div>

        {/* Notification Bell Container with Facebook-style Popover */}
        <div ref={notifRef} className="relative">
          <button
            type="button"
            onClick={() => setIsNotifOpen(prev => !prev)}
            className={`relative p-2 rounded-xl transition-all duration-200 ${
              isNotifOpen
                ? 'bg-blue-50 text-blue-600 border border-blue-200/80 shadow-2xs'
                : 'text-slate-500 hover:bg-slate-100 hover:text-slate-700'
            }`}
            title="Thông báo công việc thời gian thực"
          >
            <Icon name="bell" className="w-5 h-5" />
            {unreadCount > 0 && (
              <span className="absolute -top-1 -right-1 px-1.5 py-0.5 rounded-full bg-rose-600 text-white font-extrabold text-[10px] leading-none ring-2 ring-white shadow-xs animate-pulse">
                {unreadCount > 99 ? '99+' : unreadCount}
              </span>
            )}
          </button>

          {/* Facebook-style Notification Dropdown Popover */}
          {isNotifOpen && (
            <div className="absolute right-0 mt-2.5 w-80 sm:w-96 bg-white rounded-2xl border border-slate-200 shadow-2xl z-50 overflow-hidden animate-scaleUp">
              {/* Header */}
              <div className="p-3.5 sm:p-4 border-b border-slate-100 bg-slate-50/70 flex items-center justify-between">
                <div>
                  <h3 className="font-extrabold text-slate-900 text-sm leading-tight">Thông báo hệ thống</h3>
                  <p className="text-[11px] text-slate-500 font-medium">Cập nhật công việc trễ hạn & đến hạn</p>
                </div>
                {unreadCount > 0 && (
                  <button
                    type="button"
                    onClick={handleMarkAllRead}
                    className="text-[11px] font-bold text-blue-600 hover:text-blue-800 transition-colors"
                  >
                    Đánh dấu đã đọc
                  </button>
                )}
              </div>

              {/* Filter Tabs */}
              <div className="flex border-b border-slate-100 px-3 pt-2 bg-white gap-1">
                <button
                  type="button"
                  onClick={() => setNotifFilter('all')}
                  className={`px-3 py-1.5 text-xs font-bold rounded-lg transition-colors ${
                    notifFilter === 'all'
                      ? 'bg-blue-50 text-blue-600'
                      : 'text-slate-500 hover:bg-slate-50 hover:text-slate-800'
                  }`}
                >
                  Tất cả ({notifications.length})
                </button>
                <button
                  type="button"
                  onClick={() => setNotifFilter('overdue')}
                  className={`px-3 py-1.5 text-xs font-bold rounded-lg transition-colors ${
                    notifFilter === 'overdue'
                      ? 'bg-rose-50 text-rose-600'
                      : 'text-slate-500 hover:bg-slate-50 hover:text-slate-800'
                  }`}
                >
                  Quá hạn ({notifications.filter(n => n.type === 'overdue').length})
                </button>
                <button
                  type="button"
                  onClick={() => setNotifFilter('due')}
                  className={`px-3 py-1.5 text-xs font-bold rounded-lg transition-colors ${
                    notifFilter === 'due'
                      ? 'bg-amber-50 text-amber-600'
                      : 'text-slate-500 hover:bg-slate-50 hover:text-slate-800'
                  }`}
                >
                  Đến hạn ({notifications.filter(n => n.type === 'due').length})
                </button>
              </div>

              {/* Notification List */}
              <div className="max-h-80 overflow-y-auto divide-y divide-slate-100">
                {filteredNotifs.length === 0 ? (
                  <div className="p-8 text-center">
                    <Icon name="bell-off" className="w-8 h-8 text-slate-300 mx-auto mb-2" />
                    <p className="text-xs font-semibold text-slate-600">Không có thông báo mới</p>
                    <p className="text-[11px] text-slate-400 mt-0.5">Tất cả công việc đang trong tiến độ an toàn</p>
                  </div>
                ) : (
                  filteredNotifs.map(n => {
                    const isUnread = !readNotifIds.has(n.id);
                    return (
                      <div
                        key={n.id}
                        onClick={() => handleItemClick(n)}
                        className={`p-3 sm:p-3.5 flex items-start gap-3 hover:bg-slate-50 transition-colors cursor-pointer group ${
                          isUnread ? 'bg-blue-50/30 font-semibold' : ''
                        }`}
                      >
                        {/* Type Icon Badge */}
                        <div className={`w-9 h-9 rounded-xl flex items-center justify-center shrink-0 mt-0.5 shadow-2xs ${
                          n.type === 'overdue'
                            ? 'bg-rose-50 border border-rose-200/80 text-rose-600'
                            : 'bg-amber-50 border border-amber-200/80 text-amber-600'
                        }`}>
                          <Icon name={n.type === 'overdue' ? 'alert-circle' : 'clock'} className="w-4 h-4" />
                        </div>

                        {/* Details */}
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center justify-between gap-1 mb-0.5">
                            <span className={`text-[10px] font-extrabold px-2 py-0.5 rounded-full border ${
                              n.type === 'overdue'
                                ? 'bg-rose-100/80 text-rose-700 border-rose-200'
                                : 'bg-amber-100/80 text-amber-700 border-amber-200'
                            }`}>
                              {n.badgeText}
                            </span>
                            {isUnread && (
                              <span className="w-2 h-2 rounded-full bg-blue-600 shrink-0" title="Chưa đọc"></span>
                            )}
                          </div>
                          <h4 className="text-xs font-bold text-slate-900 group-hover:text-blue-600 transition-colors line-clamp-2 leading-snug">
                            {n.title}
                          </h4>
                          <p className="text-[11px] text-slate-500 font-medium truncate mt-0.5">
                            Số CV: <span className="font-bold text-slate-700">{n.so_cong_van}</span> • Phụ trách: {n.nguoi_phu_trach}
                          </p>
                        </div>
                      </div>
                    );
                  })
                )}
              </div>

              {/* Footer */}
              <div className="p-2.5 bg-slate-50/70 border-t border-slate-100 text-center">
                <button
                  type="button"
                  onClick={() => {
                    setIsNotifOpen(false);
                    if (setActiveTab) setActiveTab('tasks');
                  }}
                  className="text-xs font-bold text-blue-600 hover:text-blue-800 transition-colors"
                >
                  Xem tất cả công việc →
                </button>
              </div>
            </div>
          )}
        </div>

        {/* User Info */}
        <div className="flex items-center gap-3 pl-3 border-l border-slate-200">
          <div className="w-8 h-8 rounded-full bg-blue-600 text-white flex items-center justify-center font-bold text-xs shadow-xs">
            {user?.name ? user.name.charAt(0).toUpperCase() : 'U'}
          </div>
          <div className="hidden sm:block text-left">
            <div className="text-xs font-bold text-slate-800 leading-tight">{user?.name}</div>
            <div className="hidden items-center gap-1 mt-0.5">
              <span className={`text-[10px] font-bold px-1.5 py-0.2 border rounded ${roleColor}`}>
                {user?.role}
              </span>
              <span className="text-[10px] text-slate-500 font-medium">({user?.department})</span>
            </div>
          </div>
          <button
            onClick={onLogout}
            className="p-1.5 text-slate-400 hover:text-rose-600 hover:bg-rose-50 rounded-lg transition-colors ml-1"
            title="Đăng xuất khỏi hệ thống"
          >
            <i data-lucide="log-out" className="w-4 h-4"></i>
          </button>
        </div>
      </div>
    </header>
  );
}

// ----------------------------------------------------------------------
// 4. MOBILE DRAWER COMPONENT
// ----------------------------------------------------------------------
function MobileDrawer({ isOpen, onClose, activeTab, setActiveTab, user, onLogout }) {
  if (!isOpen) return null;

  const isAdmin = user?.role === 'ADMIN' || user?.department === 'ALL';
  const [isCatOpen, setIsCatOpen] = useState(() => activeTab.startsWith('category') || activeTab === 'categories');

  useEffect(() => {
    if (activeTab.startsWith('category') || activeTab === 'categories') {
      setIsCatOpen(true);
    }
  }, [activeTab]);

  const menuItems = [
    { id: 'dashboard', label: 'Dashboard', icon: 'layout-dashboard' },
    { id: 'tasks', label: 'Quản lý công việc', icon: 'check-square' },
    { id: 'kpi', label: 'Đánh giá công việc', icon: 'award' },
    { id: 'reports', label: 'Báo cáo tổng hợp', icon: 'bar-chart-3' },
    { id: 'schedule', label: 'Lịch công tác', icon: 'calendar' }
  ];

  const subMenuItems = [
    { id: 'category-agencies', label: 'Nơi ban hành', icon: 'building' },
    { id: 'category-statuses', label: 'Trạng thái công việc', icon: 'check-circle-2' },
    { id: 'category-employees', label: 'Công chức', icon: 'users-2' },
    { id: 'category-accounts', label: 'Tài khoản', icon: 'shield' }
  ];

  const isCatActive = activeTab === 'categories' || activeTab.startsWith('category-');

  return (
    <div className="fixed inset-0 z-50 md:hidden flex">
      <div className="fixed inset-0 bg-slate-900/40 backdrop-blur-xs" onClick={onClose}></div>

      <div className="relative flex-1 max-w-xs w-full bg-white h-full shadow-2xl flex flex-col z-10 animation-slideRight">
        <div className="p-4 border-b border-slate-100 flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-lg bg-blue-600 text-white flex items-center justify-center font-bold">
              UB
            </div>
            <div>
              <h3 className="font-extrabold text-slate-900 text-xs uppercase leading-tight">UBND XÃ ĐỊNH MỸ</h3>
              <p className="text-[11px] font-bold text-blue-600">QUẢN LÝ CÔNG VIỆC</p>
            </div>
          </div>
          <button onClick={onClose} className="p-1.5 rounded-lg text-slate-400 hover:bg-slate-100">
            <i data-lucide="x" className="w-5 h-5"></i>
          </button>
        </div>

        <nav className="flex-1 p-3 space-y-1 overflow-y-auto">
          {menuItems.map(item => (
            <button
              key={item.id}
              onClick={() => { setActiveTab(item.id); onClose(); }}
              className={`w-full flex items-center gap-3 px-3 py-3 rounded-xl font-medium text-sm ${activeTab === item.id ? 'bg-blue-50 text-blue-600 font-semibold' : 'text-slate-600'
                }`}
            >
              <i data-lucide={item.icon} className="w-5 h-5"></i>
              <span>{item.label}</span>
            </button>
          ))}

          {isAdmin && (
            <div className="pt-1">
              <button
                type="button"
                onClick={() => setIsCatOpen(prev => !prev)}
                className={`w-full flex items-center justify-between px-3 py-3 rounded-xl font-medium text-sm ${
                  isCatActive ? 'bg-blue-50 text-blue-600 font-semibold' : 'text-slate-600'
                }`}
              >
                <div className="flex items-center gap-3">
                  <i data-lucide="folder-tree" className="w-5 h-5"></i>
                  <span>Danh mục</span>
                </div>
                <i data-lucide="chevron-down" className={`w-4 h-4 transition-transform duration-200 ${isCatOpen ? 'rotate-180' : ''}`}></i>
              </button>

              {isCatOpen && (
                <div className="pl-4 pr-1 space-y-1 mt-1">
                  {subMenuItems.map(sub => {
                    const isSubActive = activeTab === sub.id;
                    return (
                      <button
                        key={sub.id}
                        type="button"
                        onClick={() => { setActiveTab(sub.id); onClose(); }}
                        className={`w-full flex items-center gap-2.5 px-3 py-2.5 rounded-lg text-xs font-medium ${
                          isSubActive ? 'bg-blue-600 text-white font-semibold' : 'text-slate-600 hover:bg-slate-100'
                        }`}
                      >
                        <i data-lucide={sub.icon} className="w-4 h-4"></i>
                        <span>{sub.label}</span>
                      </button>
                    );
                  })}
                </div>
              )}
            </div>
          )}

          {isAdmin && (
            <button
              onClick={() => { setActiveTab('settings'); onClose(); }}
              className={`w-full flex items-center gap-3 px-3 py-3 rounded-xl font-medium text-sm ${activeTab === 'settings' ? 'bg-blue-50 text-blue-600 font-semibold' : 'text-slate-600'}`}
            >
              <i data-lucide="settings" className="w-5 h-5"></i>
              <span>Cài đặt</span>
            </button>
          )}
        </nav>

        <div className="p-4 border-t border-slate-100">
          <button
            onClick={() => { onLogout(); onClose(); }}
            className="w-full flex items-center gap-3 px-3 py-2.5 text-sm font-medium text-rose-600 rounded-xl hover:bg-rose-50"
          >
            <i data-lucide="log-out" className="w-5 h-5"></i>
            <span>Đăng xuất</span>
          </button>
        </div>
      </div>
    </div>
  );
}

// Helper date formatter: Converts any date input (YYYY-MM-DD, ISO string, Excel serial number string/number, DD/MM/YYYY) -> dd/MM/yyyy
function formatDate(dateVal) {
  if (dateVal === null || dateVal === undefined) return '--';
  const rawStr = String(dateVal).trim();
  if (rawStr === '' || rawStr === '--' || rawStr.toLowerCase() === 'khong' || rawStr.toLowerCase() === 'n/a') return '--';

  // 1. Handle numeric / Excel serial number (e.g. 46371, 46185, 47295)
  const num = Number(rawStr);
  if (!isNaN(num) && num > 1000 && num < 100000) {
    const excelEpoch = new Date(Date.UTC(1899, 11, 30));
    const dt = new Date(excelEpoch.getTime() + Math.floor(num) * 86400000);
    if (!isNaN(dt.getTime())) {
      const day = String(dt.getUTCDate()).padStart(2, '0');
      const month = String(dt.getUTCMonth() + 1).padStart(2, '0');
      const year = dt.getUTCFullYear();
      return `${day}/${month}/${year}`;
    }
  }

  // 2. Handle DD/MM/YYYY or MM/DD/YYYY or DD-MM-YYYY format
  if (/^\d{1,2}[\/\.-]\d{1,2}[\/\.-]\d{4}$/.test(rawStr)) {
    const parts = rawStr.split(/[\/\.-]/);
    const p1 = parseInt(parts[0], 10);
    const p2 = parseInt(parts[1], 10);
    const year = parts[2];
    let day, month;
    if (p2 > 12) {
      month = p1;
      day = p2;
    } else {
      day = p1;
      month = p2;
    }
    const dayStr = String(day).padStart(2, '0');
    const monthStr = String(month).padStart(2, '0');
    return `${dayStr}/${monthStr}/${year}`;
  }

  // 3. YYYY-MM-DD or YYYY/MM/DD (ISO style)
  if (/^\d{4}[\/\.-]\d{1,2}[\/\.-]\d{1,2}/.test(rawStr)) {
    const dateOnly = rawStr.split('T')[0];
    const parts = dateOnly.split(/[\/\.-]/);
    if (parts.length >= 3) {
      const year = parts[0];
      const month = parts[1].padStart(2, '0');
      const day = parts[2].padStart(2, '0');
      return `${day}/${month}/${year}`;
    }
  }

  // 4. Try JS Date parser as fallback
  const parsedDate = new Date(rawStr);
  if (!isNaN(parsedDate.getTime())) {
    const day = String(parsedDate.getDate()).padStart(2, '0');
    const month = String(parsedDate.getMonth() + 1).padStart(2, '0');
    const year = parsedDate.getFullYear();
    return `${day}/${month}/${year}`;
  }

  return rawStr;
}

// Helper function to parse any date representation to a numeric timestamp for precise sorting
function parseDateToTimestamp(dateVal) {
  if (dateVal === null || dateVal === undefined) return 0;
  const rawStr = String(dateVal).trim();
  if (rawStr === '' || rawStr === '--' || rawStr.toLowerCase() === 'khong' || rawStr.toLowerCase() === 'n/a') return 0;

  // 1. Handle numeric / Excel serial number (e.g. 46371, 46185, 47295)
  const num = Number(rawStr);
  if (!isNaN(num) && num > 1000 && num < 100000) {
    const excelEpoch = new Date(Date.UTC(1899, 11, 30));
    return excelEpoch.getTime() + Math.floor(num) * 86400000;
  }

  // 2. Handle DD/MM/YYYY or MM/DD/YYYY or DD-MM-YYYY format
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
    return new Date(Date.UTC(year, month, day)).getTime();
  }

  // 3. YYYY-MM-DD or YYYY/MM/DD (ISO style)
  if (/^\d{4}[\/\.-]\d{1,2}[\/\.-]\d{1,2}/.test(rawStr)) {
    const dateOnly = rawStr.split('T')[0];
    const parts = dateOnly.split(/[\/\.-]/);
    if (parts.length >= 3) {
      const year = parseInt(parts[0], 10);
      const month = parseInt(parts[1], 10) - 1;
      const day = parseInt(parts[2], 10);
      return new Date(Date.UTC(year, month, day)).getTime();
    }
  }

  // 4. Try JS Date parser as fallback
  const parsedDate = new Date(rawStr);
  if (!isNaN(parsedDate.getTime())) {
    return parsedDate.getTime();
  }

  return 0;
}

// Helper function to extract month (1-12) and year from date string or task fallback fields
function parseMonthYear(dateVal, fallbackMonth = null, fallbackYear = null) {
  if (dateVal !== null && dateVal !== undefined) {
    const str = String(dateVal).trim();
    if (str !== '' && str !== '--' && str.toLowerCase() !== 'khong' && str.toLowerCase() !== 'n/a') {
      // 1. YYYY-MM-DD or YYYY/MM/DD
      if (/^\d{4}[\/\.-]\d{1,2}[\/\.-]\d{1,2}/.test(str)) {
        const parts = str.split('T')[0].split(/[\/\.-]/);
        if (parts.length >= 3) {
          return {
            year: parseInt(parts[0], 10),
            month: parseInt(parts[1], 10)
          };
        }
      }

      // 2. DD/MM/YYYY or DD-MM-YYYY
      if (/^\d{1,2}[\/\.-]\d{1,2}[\/\.-]\d{4}/.test(str)) {
        const parts = str.split(/[\/\.-]/);
        if (parts.length >= 3) {
          return {
            month: parseInt(parts[1], 10),
            year: parseInt(parts[2], 10)
          };
        }
      }

      // 3. Fallback to parseDateToTimestamp or Date object
      const ts = parseDateToTimestamp(str);
      if (ts > 0) {
        const d = new Date(ts);
        return {
          month: d.getUTCMonth() + 1,
          year: d.getUTCFullYear()
        };
      }
    }
  }

  const m = fallbackMonth ? parseInt(String(fallbackMonth), 10) : null;
  const y = fallbackYear ? parseInt(String(fallbackYear), 10) : null;
  return {
    month: m && !isNaN(m) && m >= 1 && m <= 12 ? m : null,
    year: y && !isNaN(y) ? y : null
  };
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

// Helper function to calculate evaluation dynamically based on status, deadline, completion date, and current date
function calculateEvaluation(task, refDate) {
  if (!task) return '';
  const status = String(task.trang_thai || '').trim();
  const lowerStatus = status.toLowerCase();

  // 1. Tạm dừng hoặc Hủy / Đã hủy -> Cột đánh giá để trống
  if (lowerStatus === 'tạm dừng' || lowerStatus === 'hủy' || lowerStatus === 'đã hủy' || lowerStatus.includes('tạm dừng') || lowerStatus.includes('hủy')) {
    return '';
  }

  const tDeadline = parseDateToTimestamp(task.deadline);

  // 2. Đang thực hiện (hoặc status bao gồm đang thực hiện / quá hạn)
  if (lowerStatus === 'đang thực hiện' || lowerStatus.includes('đang thực hiện') || lowerStatus === 'quá hạn') {
    if (!tDeadline) return '';
    const tCurrent = getMidnightTimestamp(refDate);
    if (tDeadline < tCurrent) return 'Trễ hạn';
    if (tDeadline === tCurrent) return 'Đến hạn';
    return '';
  }

  // 3. Hoàn thành
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

// Helper function to check if a task is overdue based on evaluation (danh_gia) or status
function isTaskOverdue(task) {
  if (!task) return false;

  // 1. Check dynamic evaluation result
  const evalResult = calculateEvaluation(task);
  if (evalResult === 'Trễ hạn') return true;

  // 2. Check danh_gia field if present ("Trễ hạn", "Hoàn Thành Trễ hạn", etc.)
  if (task.danh_gia && typeof task.danh_gia === 'string') {
    const dg = task.danh_gia.toLowerCase().trim();
    if (dg.includes('trễ') || dg.includes('quá hạn') || dg.includes('overdue')) return true;
  }

  // 3. Check trang_thai field ("Trễ hạn", "Quá hạn")
  if (task.trang_thai && typeof task.trang_thai === 'string') {
    const tt = task.trang_thai.toLowerCase().trim();
    if (tt.includes('trễ') || tt.includes('quá hạn')) return true;
  }

  // 4. Check so_ngay_tre field
  if (task.so_ngay_tre) {
    const tre = Number(task.so_ngay_tre);
    if (!isNaN(tre) && tre > 0) return true;
  }

  return false;
}

// Custom DateInput component enforcing DD/MM/YYYY display format and dd/mm/yyyy placeholder
function DateInput({ value, onChange, placeholder = 'dd/mm/yyyy' }) {
  const formatToDisplay = (val) => {
    if (!val) return '';
    const res = formatDate(val);
    return res === '--' ? '' : res;
  };

  const [text, setText] = useState(formatToDisplay(value));
  const hiddenDateRef = useRef(null);

  useEffect(() => {
    setText(formatToDisplay(value));
  }, [value]);

  const handleTextChange = (e) => {
    let raw = e.target.value;
    raw = raw.replace(/[^\d/]/g, '');

    if (raw.length === 2 && !raw.includes('/') && e.nativeEvent?.inputType !== 'deleteContentBackward') {
      raw = raw + '/';
    } else if (raw.length === 5 && raw.split('/').length === 2 && e.nativeEvent?.inputType !== 'deleteContentBackward') {
      raw = raw + '/';
    }

    if (raw.length > 10) raw = raw.substring(0, 10);

    setText(raw);

    if (raw.length === 10) {
      const formatted = formatDate(raw);
      const valToSave = (formatted !== '--') ? formatted : raw;
      onChange(valToSave);
    } else if (raw === '') {
      onChange('');
    }
  };

  const handleHiddenDateChange = (e) => {
    const internalVal = e.target.value;
    if (internalVal) {
      const formatted = formatDate(internalVal);
      const valToSave = (formatted !== '--') ? formatted : internalVal;
      onChange(valToSave);
      setText(valToSave);
    }
  };

  const getPickerValue = (val) => {
    if (!val) return '';
    if (/^\d{4}-\d{2}-\d{2}$/.test(val)) return val;
    const parts = String(val).trim().split('/');
    if (parts.length === 3 && parts[2].length === 4) {
      const p1 = parseInt(parts[0], 10);
      const p2 = parseInt(parts[1], 10);
      const yyyy = parts[2];
      let dd, mm;
      if (p2 > 12) {
        mm = String(p1).padStart(2, '0');
        dd = String(p2).padStart(2, '0');
      } else {
        dd = String(p1).padStart(2, '0');
        mm = String(p2).padStart(2, '0');
      }
      return `${yyyy}-${mm}-${dd}`;
    }
    const ts = parseDateToTimestamp(val);
    if (ts > 0) {
      const d = new Date(ts);
      const yyyy = d.getUTCFullYear();
      const mm = String(d.getUTCMonth() + 1).padStart(2, '0');
      const dd = String(d.getUTCDate()).padStart(2, '0');
      return `${yyyy}-${mm}-${dd}`;
    }
    return '';
  };

  return (
    <div className="w-full relative flex items-center">
      <input
        type="text"
        value={text}
        onChange={handleTextChange}
        placeholder={placeholder}
        maxLength={10}
        className="form-input pr-9 w-full font-sans text-xs"
      />
      <input
        type="date"
        ref={hiddenDateRef}
        value={getPickerValue(value)}
        onChange={handleHiddenDateChange}
        className="sr-only opacity-0 w-0 h-0 absolute pointer-events-none"
      />
      <button
        type="button"
        onClick={() => {
          if (hiddenDateRef.current && hiddenDateRef.current.showPicker) {
            hiddenDateRef.current.showPicker();
          } else if (hiddenDateRef.current) {
            hiddenDateRef.current.focus();
          }
        }}
        className="absolute right-2 p-1 text-slate-400 hover:text-blue-600 transition-colors"
        title="Chọn ngày"
      >
        <i data-lucide="calendar" className="w-4 h-4"></i>
      </button>
    </div>
  );
}

// ----------------------------------------------------------------------
// HELPER: Searchable Select / Dropdown Component
// ----------------------------------------------------------------------
function SearchableSelect({
  options = [],
  value = '',
  onChange,
  placeholder = '-- Chọn hoặc tìm kiếm --',
  className = '',
  required = false
}) {
  const [isOpen, setIsOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const containerRef = useRef(null);

  useEffect(() => {
    function handleClickOutside(event) {
      if (containerRef.current && !containerRef.current.contains(event.target)) {
        setIsOpen(false);
      }
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const filteredOptions = useMemo(() => {
    if (!searchQuery.trim()) return options;
    const q = searchQuery.trim().toLowerCase();
    return options.filter(opt => {
      const labelStr = typeof opt === 'object' ? (opt.label || opt.value || '') : String(opt);
      const subStr = typeof opt === 'object' ? (opt.subtext || '') : '';
      return labelStr.toLowerCase().includes(q) || subStr.toLowerCase().includes(q);
    });
  }, [options, searchQuery]);

  const selectedDisplay = useMemo(() => {
    if (!value) return '';
    const found = options.find(opt => (typeof opt === 'object' ? opt.value : opt) === value);
    if (found) {
      return typeof found === 'object' ? (found.label || found.value) : String(found);
    }
    return String(value);
  }, [options, value]);

  const handleSelect = (itemValue) => {
    onChange(itemValue);
    setIsOpen(false);
    setSearchQuery('');
  };

  return (
    <div ref={containerRef} className={`relative w-full ${className}`}>
      <div
        onClick={() => setIsOpen(prev => !prev)}
        className={`form-select flex items-center justify-between cursor-pointer bg-white min-h-[38px] py-1.5 px-3 border border-slate-300 rounded-lg text-xs transition-all ${
          isOpen ? 'ring-2 ring-blue-500 border-blue-500 shadow-sm' : 'hover:border-slate-400'
        }`}
      >
        <span className={value ? 'text-slate-800 font-medium truncate' : 'text-slate-400 font-normal truncate'}>
          {selectedDisplay || placeholder}
        </span>
        <svg className={`w-4 h-4 text-slate-400 shrink-0 transition-transform ${isOpen ? 'rotate-180 text-blue-600' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 9l-7 7-7-7" />
        </svg>
      </div>

      {isOpen && (
        <div className="absolute z-50 mt-1 w-full bg-white rounded-xl shadow-xl border border-slate-200 p-2 space-y-1.5 animate-fadeIn max-h-60 flex flex-col">
          <div className="relative shrink-0">
            <input
              type="text"
              autoFocus
              placeholder="Gõ từ khóa tìm kiếm..."
              value={searchQuery}
              onChange={e => setSearchQuery(e.target.value)}
              className="w-full pl-8 pr-7 py-1.5 text-xs bg-slate-50 border border-slate-200 rounded-lg focus:bg-white focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
            <svg className="w-3.5 h-3.5 text-slate-400 absolute left-2.5 top-2.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <circle cx="11" cy="11" r="8" strokeWidth="2"></circle>
              <line x1="21" y1="21" x2="16.65" y2="16.65" strokeWidth="2"></line>
            </svg>
            {searchQuery && (
              <button
                type="button"
                onClick={() => setSearchQuery('')}
                className="absolute right-2 top-2 text-slate-400 hover:text-slate-600 text-xs px-1"
              >
                ✕
              </button>
            )}
          </div>

          <div className="flex-1 overflow-y-auto max-h-44 space-y-0.5 custom-scrollbar">
            {!required && (
              <div
                onClick={() => handleSelect('')}
                className={`px-3 py-1.5 text-xs rounded-lg cursor-pointer transition-colors ${
                  !value ? 'bg-blue-50 text-blue-700 font-bold' : 'text-slate-500 hover:bg-slate-100'
                }`}
              >
                -- Chưa chọn --
              </div>
            )}

            {filteredOptions.length > 0 ? (
              filteredOptions.map((opt, idx) => {
                const itemVal = typeof opt === 'object' ? opt.value : opt;
                const itemLabel = typeof opt === 'object' ? opt.label : opt;
                const itemSub = typeof opt === 'object' ? opt.subtext : null;
                const isSelected = itemVal === value;

                return (
                  <div
                    key={itemVal + idx}
                    onClick={() => handleSelect(itemVal)}
                    className={`px-3 py-2 text-xs rounded-lg cursor-pointer transition-colors flex items-center justify-between ${
                      isSelected ? 'bg-blue-50 text-blue-700 font-bold' : 'text-slate-700 hover:bg-slate-100'
                    }`}
                  >
                    <div>
                      <div className="font-semibold leading-tight">{itemLabel}</div>
                      {itemSub && <div className="text-[10px] text-slate-400 font-normal mt-0.5">{itemSub}</div>}
                    </div>
                    {isSelected && (
                      <svg className="w-4 h-4 text-blue-600 shrink-0 ml-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M5 13l4 4L19 7" />
                      </svg>
                    )}
                  </div>
                );
              })
            ) : (
              <div className="px-3 py-3 text-xs text-slate-400 text-center font-medium">
                Không tìm thấy kết quả phù hợp
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

// ----------------------------------------------------------------------
// 5. DASHBOARD VIEW COMPONENT
// ----------------------------------------------------------------------
function DashboardView({ tasks, filters, setFilters, onOpenDetail, categories }) {
  // Extract dynamic department list (reads directly from Settings!A4:A500 via categories.departments)
  const departmentList = useMemo(() => {
    if (categories?.departments && Array.isArray(categories.departments) && categories.departments.length > 0) {
      return categories.departments;
    }
    const deptsFromTasks = Array.from(new Set((tasks || []).map(t => t.phong_ban).filter(Boolean)));
    if (deptsFromTasks.length > 0) return deptsFromTasks;
    return window.INITIAL_CATEGORIES?.departments || ['Kinh tế', 'VH - XH'];
  }, [categories, tasks]);

  // Chart references
  const monthlyChartRef = useRef(null);
  const statusChartRef = useRef(null);
  const staffChartRef = useRef(null);

  // Auto-assign current real-time Month & Year on initialization if not set
  useEffect(() => {
    const now = new Date();
    const curMonth = String(now.getMonth() + 1);
    const curYear = String(now.getFullYear());
    if (!filters.month || !filters.year) {
      setFilters(prev => ({
        ...prev,
        month: prev.month || curMonth,
        year: prev.year || curYear
      }));
    }
  }, []);

  // Filter tasks for dashboard view based on department, month, year
  const filteredDashboardTasks = useMemo(() => {
    return tasks.filter(task => {
      // 1. Department Filter
      if (filters.department && filters.department !== '' && filters.department !== 'ALL') {
        const taskDept = (task.phong_ban || '').trim().toLowerCase();
        const filterDept = filters.department.trim().toLowerCase();
        if (taskDept !== filterDept) return false;
      }

      const dateInfo = parseMonthYear(task.ngay_tao, task.thang, task.nam);

      // 2. Month Filter
      if (filters.month !== undefined && filters.month !== null && filters.month !== '' && filters.month !== 'ALL') {
        const filterMonthNum = parseInt(String(filters.month).replace(/[^\d]/g, ''), 10);
        if (!isNaN(filterMonthNum) && filterMonthNum > 0) {
          if (dateInfo.month !== filterMonthNum) return false;
        }
      }

      // 3. Year Filter
      if (filters.year !== undefined && filters.year !== null && filters.year !== '' && filters.year !== 'ALL') {
        const filterYearNum = parseInt(String(filters.year).replace(/[^\d]/g, ''), 10);
        if (!isNaN(filterYearNum) && filterYearNum > 0) {
          if (dateInfo.year !== filterYearNum) return false;
        }
      }
      return true;
    }).sort((a, b) => {
      const timeA = parseDateToTimestamp(a.ngay_tao);
      const timeB = parseDateToTimestamp(b.ngay_tao);
      if (timeA !== timeB) {
        return timeB - timeA;
      }
      return (Number(b.id) || 0) - (Number(a.id) || 0);
    });
  }, [tasks, filters.department, filters.month, filters.year]);

  // Compute metrics from filtered tasks
  const total = filteredDashboardTasks.length;
  const inProgress = filteredDashboardTasks.filter(t => t.trang_thai === 'Đang thực hiện').length;
  const completed = filteredDashboardTasks.filter(t => t.trang_thai === 'Hoàn thành').length;
  const overdue = filteredDashboardTasks.filter(t => isTaskOverdue(t)).length;
  const paused = filteredDashboardTasks.filter(t => t.trang_thai === 'Tạm dừng').length;
  const noDeadline = filteredDashboardTasks.filter(t => !t.deadline || t.deadline === '--' || t.deadline.trim() === '').length;

  // Status counts for Pie/Doughnut Chart
  const statusCounts = useMemo(() => {
    const inProg = filteredDashboardTasks.filter(t => t.trang_thai === 'Đang thực hiện').length;
    const comp = filteredDashboardTasks.filter(t => t.trang_thai === 'Hoàn thành').length;
    const pau = filteredDashboardTasks.filter(t => t.trang_thai === 'Tạm dừng').length;
    const canc = filteredDashboardTasks.filter(t => t.trang_thai === 'Hủy' || t.trang_thai === 'Đã hủy').length;
    return { inProg, comp, pau, canc };
  }, [filteredDashboardTasks]);

  // Calculate Top 10 Employees with most tasks
  const staffTaskCounts = useMemo(() => {
    const counts = {};
    filteredDashboardTasks.forEach(t => {
      const emp = t.nguoi_phu_trach && t.nguoi_phu_trach.trim() !== '' ? t.nguoi_phu_trach.trim() : 'Chưa phân công';
      counts[emp] = (counts[emp] || 0) + 1;
    });
    return Object.entries(counts)
      .map(([name, count]) => ({ name, count }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 10);
  }, [filteredDashboardTasks]);

  // Aggregate 12-Month Created & Completed Tasks dynamically from real task dates
  const monthlyChartData = useMemo(() => {
    const created = Array(12).fill(0);
    const completed = Array(12).fill(0);

    // Filter tasks by department and year (if specified) to populate all 12 months
    const baseTasks = tasks.filter(t => {
      if (filters.department && filters.department !== '' && filters.department !== 'ALL') {
        const taskDept = (t.phong_ban || '').trim().toLowerCase();
        const filterDept = filters.department.trim().toLowerCase();
        if (taskDept !== filterDept) return false;
      }
      if (filters.year && filters.year !== '' && filters.year !== 'ALL') {
        const filterYearNum = parseInt(String(filters.year).replace(/[^\d]/g, ''), 10);
        const dateInfo = parseMonthYear(t.ngay_tao, t.thang, t.nam);
        if (!isNaN(filterYearNum) && dateInfo.year && Number(dateInfo.year) !== filterYearNum) {
          return false;
        }
      }
      return true;
    });

    baseTasks.forEach(t => {
      // 1. Created task aggregation by month
      const createdInfo = parseMonthYear(t.ngay_tao, t.thang, t.nam);
      if (createdInfo.month >= 1 && createdInfo.month <= 12) {
        created[createdInfo.month - 1] += 1;
      }

      // 2. Completed task aggregation by month
      if (t.trang_thai === 'Hoàn thành') {
        const compDate = t.ngay_hoan_thanh || t.ngay_tao;
        const compInfo = parseMonthYear(compDate, t.thang, t.nam);
        if (compInfo.month >= 1 && compInfo.month <= 12) {
          completed[compInfo.month - 1] += 1;
        }
      }
    });

    return { created, completed };
  }, [tasks, filters.department, filters.year]);

  useEffect(() => {
    // Render Charts using Chart.js if loaded
    if (window.Chart) {
      // 1. Monthly Bar Chart (Cột 1 - Bên trái)
      if (monthlyChartRef.current) {
        const ctx = monthlyChartRef.current.getContext('2d');
        if (monthlyChartRef.current.chartInstance) {
          monthlyChartRef.current.chartInstance.destroy();
        }
        monthlyChartRef.current.chartInstance = new window.Chart(ctx, {
          type: 'bar',
          data: {
            labels: ['T1', 'T2', 'T3', 'T4', 'T5', 'T6', 'T7', 'T8', 'T9', 'T10', 'T11', 'T12'],
            datasets: [
              { label: 'CV Tạo mới', data: monthlyChartData.created, backgroundColor: '#3B82F6', borderRadius: 4 },
              { label: 'CV Hoàn thành', data: monthlyChartData.completed, backgroundColor: '#10B981', borderRadius: 4 }
            ]
          },
          options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
              legend: { position: 'top', labels: { boxWidth: 12, font: { size: 12 } } }
            },
            scales: {
              x: { grid: { display: false } },
              y: { beginAtZero: true, grid: { color: '#F1F5F9' }, ticks: { precision: 0 } }
            }
          }
        });
      }

      // 2. Status Doughnut Chart (Cột 2 - Ở giữa)
      if (statusChartRef.current) {
        const ctxStatus = statusChartRef.current.getContext('2d');
        if (statusChartRef.current.chartInstance) {
          statusChartRef.current.chartInstance.destroy();
        }

        statusChartRef.current.chartInstance = new window.Chart(ctxStatus, {
          type: 'doughnut',
          data: {
            labels: ['Đang thực hiện', 'Hoàn thành', 'Tạm dừng', 'Hủy'],
            datasets: [{
              data: [
                statusCounts.inProg,
                statusCounts.comp,
                statusCounts.pau,
                statusCounts.canc
              ],
              backgroundColor: ['#3B82F6', '#EF4444', '#10B981', '#8B5CF6'],
              borderWidth: 2,
              borderColor: '#ffffff'
            }]
          },
          options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
              legend: {
                position: 'bottom',
                labels: {
                  boxWidth: 10,
                  padding: 10,
                  font: { size: 11, family: 'Inter, sans-serif' }
                }
              },
              tooltip: {
                callbacks: {
                  label: (context) => ` ${context.label}: ${context.parsed} CV`
                }
              }
            },
            cutout: '58%'
          }
        });
      }

      // 3. Staff Horizontal Bar Chart (Cột 3 - Bên phải)
      if (staffChartRef.current) {
        const ctx2 = staffChartRef.current.getContext('2d');
        if (staffChartRef.current.chartInstance) {
          staffChartRef.current.chartInstance.destroy();
        }

        const fullNames = staffTaskCounts.map(item => item.name);
        const shortNames = staffTaskCounts.map(item => item.name.length > 15 ? item.name.substring(0, 14) + '...' : item.name);
        const dataValues = staffTaskCounts.map(item => item.count);

        // Custom plugin to render count numbers at the end of each horizontal bar
        const barValuesPlugin = {
          id: 'barValuesPlugin',
          afterDatasetsDraw(chart) {
            const { ctx } = chart;
            chart.data.datasets.forEach((dataset, i) => {
              const meta = chart.getDatasetMeta(i);
              meta.data.forEach((bar, index) => {
                const val = dataset.data[index];
                if (val !== undefined && val !== null) {
                  ctx.save();
                  ctx.fillStyle = '#475569';
                  ctx.font = '600 11px Inter, sans-serif';
                  ctx.textAlign = 'left';
                  ctx.textBaseline = 'middle';
                  ctx.fillText(val, bar.x + 6, bar.y);
                  ctx.restore();
                }
              });
            });
          }
        };

        staffChartRef.current.chartInstance = new window.Chart(ctx2, {
          type: 'bar',
          data: {
            labels: shortNames,
            datasets: [{
              label: 'Số công việc',
              data: dataValues,
              backgroundColor: '#3B82F6',
              borderRadius: 4,
              barThickness: 14
            }]
          },
          options: {
            indexAxis: 'y',
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
              legend: { display: false },
              tooltip: {
                callbacks: {
                  title: (context) => fullNames[context[0].dataIndex],
                  label: (context) => `Số công việc: ${context.parsed.x}`
                }
              }
            },
            scales: {
              x: {
                beginAtZero: true,
                grid: { color: '#F1F5F9' },
                ticks: { precision: 0 }
              },
              y: {
                grid: { display: false },
                ticks: { font: { size: 11 } }
              }
            }
          },
          plugins: [barValuesPlugin]
        });
      }
    }
  }, [filteredDashboardTasks, statusCounts, staffTaskCounts, monthlyChartData]);

  // Year options generation (5 years: currentYear - 3 to currentYear + 1)
  const yearOptions = useMemo(() => {
    const years = new Set();
    const currentYear = new Date().getFullYear();
    for (let y = currentYear - 3; y <= currentYear + 1; y++) {
      years.add(y);
    }
    tasks.forEach(t => {
      const d = parseMonthYear(t.ngay_tao || t.deadline || t.ngay_hoan_thanh, t.thang, t.nam);
      if (d.year) years.add(d.year);
    });
    return Array.from(years).sort((a, b) => b - a);
  }, [tasks]);

  return (
    <div className="space-y-6">
      {/* Filter Bar */}
      <div className="bg-white rounded-xl border border-slate-200 p-4 shadow-xs">
        <div className="flex flex-col sm:flex-row flex-wrap items-start sm:items-end gap-3.5">
          {/* Department Filter */}
          <div className="w-full sm:w-48">
            <label className="block text-[11px] font-bold text-slate-500 uppercase mb-1">Phòng ban</label>
            <select
              value={filters.department || ''}
              onChange={e => setFilters({ ...filters, department: e.target.value })}
              className="form-select w-full"
            >
              <option value="">-- Tất cả phòng ban --</option>
              {departmentList.map((dept, idx) => (
                <option key={idx} value={dept}>{dept}</option>
              ))}
            </select>
          </div>

          {/* Month Filter */}
          <div className="w-full sm:w-36">
            <label className="block text-[11px] font-bold text-slate-500 uppercase mb-1">Tháng</label>
            <select
              value={filters.month || ''}
              onChange={e => setFilters({ ...filters, month: e.target.value })}
              className="form-select w-full"
            >
              <option value="">Tất cả</option>
              {Array.from({ length: 12 }, (_, i) => (
                <option key={i + 1} value={String(i + 1)}>Tháng {i + 1}</option>
              ))}
            </select>
          </div>

          {/* Year Filter */}
          <div className="w-full sm:w-32">
            <label className="block text-[11px] font-bold text-slate-500 uppercase mb-1">Năm</label>
            <select
              value={filters.year || ''}
              onChange={e => setFilters({ ...filters, year: e.target.value })}
              className="form-select w-full"
            >
              <option value="">Tất cả</option>
              {yearOptions.map(y => (
                <option key={y} value={String(y)}>{y}</option>
              ))}
            </select>
          </div>

          {/* Filter & Reset Action Buttons */}
          <div className="flex items-center gap-2.5 pt-1 sm:pt-0">
            <button
              onClick={() => {
                if (window.lucide) window.lucide.createIcons();
              }}
              className="btn-primary text-xs h-[38px] px-4 font-semibold shadow-xs whitespace-nowrap"
            >
              <i data-lucide="filter" className="w-3.5 h-3.5"></i> Lọc
            </button>
            <button
              onClick={() => {
                const now = new Date();
                setFilters({
                  ...filters,
                  department: '',
                  month: String(now.getMonth() + 1),
                  year: String(now.getFullYear())
                });
              }}
              className="btn-secondary h-[38px] px-3.5 text-xs font-medium text-slate-600 whitespace-nowrap"
              title="Làm mới bộ lọc"
            >
              <i data-lucide="rotate-ccw" className="w-3.5 h-3.5"></i> Làm mới
            </button>
          </div>
        </div>
      </div>

      {/* 6 KPI Cards Grid */}
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4">
        <KPICard title="Tổng công việc" count={total} color="blue" icon="check-square" sub="+12% so với tháng trước" />
        <KPICard title="Đang thực hiện" count={inProgress} color="sky" icon="clock" sub="Đang xử lý" />
        <KPICard title="Hoàn thành" count={completed} color="emerald" icon="check-circle-2" sub="85% Tỷ lệ hoàn thành" />
        <KPICard title="Quá hạn" count={overdue} color="rose" icon="alert-triangle" sub="Cần đẩy nhanh" />
        <KPICard title="Tạm dừng" count={paused} color="amber" icon="pause-circle" sub="Tạm hoãn" />
        <KPICard title="Không có hạn" count={noDeadline} color="slate" icon="calendar-off" sub="Không có deadline" />
      </div>

      {/* Charts Section */}
      <div className="space-y-5">
        {/* Row 1: Biểu đồ Cột 12 tháng (Full Row / 100% Width) */}
        <div className="bg-white rounded-xl border border-slate-200 p-5 shadow-xs flex flex-col justify-between">
          <h3 className="text-sm font-bold text-slate-800 mb-4 flex items-center gap-2">
            <i data-lucide="bar-chart-2" className="w-4 h-4 text-blue-600"></i>
            Công việc tạo mới & Hoàn thành theo Tháng
          </h3>
          <div className="h-80 relative">
            <canvas ref={monthlyChartRef}></canvas>
          </div>
        </div>

        {/* Row 2: Biểu đồ Tròn & Biểu đồ Nhân viên (50/50 Layout) */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-5 items-stretch">
          {/* Biểu đồ tròn Trạng thái (50% Width) */}
          <div className="bg-white rounded-xl border border-slate-200 p-5 shadow-xs flex flex-col justify-between">
            <h3 className="text-sm font-bold text-slate-800 mb-4 flex items-center gap-2">
              <i data-lucide="pie-chart" className="w-4 h-4 text-blue-600"></i>
              Công việc theo trạng thái
            </h3>
            <div className="h-72 relative flex items-center justify-center">
              <canvas ref={statusChartRef}></canvas>
            </div>
          </div>

          {/* Biểu đồ Nhân viên (50% Width) */}
          <div className="bg-white rounded-xl border border-slate-200 p-5 shadow-xs flex flex-col justify-between">
            <h3 className="text-sm font-bold text-slate-800 mb-4 flex items-center gap-2">
              <i data-lucide="users" className="w-4 h-4 text-blue-600"></i>
              Công việc theo nhân viên
            </h3>
            <div className="h-72 relative">
              <canvas ref={staffChartRef}></canvas>
            </div>
          </div>
        </div>
      </div>

      {/* Recent Tasks Table */}
      <div className="bg-white rounded-xl border border-slate-200 shadow-xs overflow-hidden">
        <div className="p-4 border-b border-slate-100 flex items-center justify-between">
          <h3 className="text-sm font-bold text-slate-800 flex items-center gap-2">
            <i data-lucide="list-todo" className="w-4 h-4 text-blue-600"></i>
            10 Công việc mới cập nhật gần đây
          </h3>
        </div>
        <div className="overflow-x-auto">
          <table className="custom-table w-full">
            <thead>
              <tr>
                <th>Số công văn</th>
                <th>Tên công việc</th>
                <th>Phòng ban</th>
                <th>Ngày tạo</th>
                <th>Deadline</th>
                <th>Trạng thái</th>
                <th>Đánh giá</th>
                <th className="text-center">Thao tác</th>
              </tr>
            </thead>
            <tbody>
              {filteredDashboardTasks.slice(0, 10).map(task => (
                <tr key={task.id}>
                  <td className="align-top whitespace-nowrap">
                    <div className={`font-bold ${isTaskOverdue(task) ? 'text-rose-600' : 'text-slate-900'}`}>{task.so_cong_van || '--'}</div>
                    <div className="text-xs text-slate-500 font-normal mt-0.5">{task.noi_ban_hanh || 'UBND tỉnh An Giang'}</div>
                  </td>
                  <td className="align-top max-w-xs md:max-w-md">
                    <div className="line-clamp-2 text-xs font-medium text-slate-800 leading-relaxed" title={task.ten_cong_viec}>
                      {task.ten_cong_viec}
                    </div>
                  </td>
                  <td className="align-top whitespace-nowrap font-medium text-slate-700 text-xs">{task.phong_ban || 'Kinh tế'}</td>
                  <td className="align-top whitespace-nowrap text-xs text-slate-600">{formatDate(task.ngay_tao)}</td>
                  <td className="align-top whitespace-nowrap text-xs text-slate-600">{formatDate(task.deadline)}</td>
                  <td className="align-top whitespace-nowrap"><StatusBadge status={task.trang_thai} /></td>
                  <td className="align-top whitespace-nowrap"><RatingBadge task={task} rating={calculateEvaluation(task)} /></td>
                  <td className="align-top whitespace-nowrap text-center">
                    <button
                      type="button"
                      onClick={() => onOpenDetail(task)}
                      className="p-1.5 rounded-lg text-blue-600 hover:text-blue-700 hover:bg-blue-100/80 bg-blue-50 border border-blue-200/70 transition-colors inline-flex items-center justify-center cursor-pointer shadow-2xs"
                      title="Xem chi tiết"
                    >
                      <svg className="w-4 h-4 text-blue-600" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                        <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"></path>
                        <circle cx="12" cy="12" r="3"></circle>
                      </svg>
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

function KPICard({ title, count, color, icon, sub }) {
  const colorMap = {
    blue: 'border-l-blue-600 text-blue-600 bg-blue-50',
    sky: 'border-l-sky-500 text-sky-600 bg-sky-50',
    emerald: 'border-l-emerald-600 text-emerald-600 bg-emerald-50',
    rose: 'border-l-rose-600 text-rose-600 bg-rose-50',
    amber: 'border-l-amber-500 text-amber-600 bg-amber-50',
    slate: 'border-l-slate-500 text-slate-600 bg-slate-100',
  };

  return (
    <div className={`kpi-card border-l-4 ${colorMap[color].split(' ')[0]}`}>
      <div className="flex items-center justify-between mb-2">
        <span className="text-xs font-semibold text-slate-500">{title}</span>
        <div className={`w-7 h-7 rounded-lg flex items-center justify-center ${colorMap[color].split(' ').slice(1).join(' ')}`}>
          <i data-lucide={icon} className="w-4 h-4"></i>
        </div>
      </div>
      <div className="text-2xl font-bold text-slate-900 tracking-tight">{count}</div>
      <div className="text-[11px] text-slate-400 font-medium mt-1 truncate">{sub}</div>
    </div>
  );
}

// ----------------------------------------------------------------------
// 6. TASKS VIEW COMPONENT (CORE SCREEN)
// ----------------------------------------------------------------------
function TasksView({
  tasks,
  employees,
  user,
  filters,
  setFilters,
  selectedTaskIds,
  setSelectedTaskIds,
  onOpenAddTask,
  onOpenEditTask,
  onOpenDetail,
  onConfirmDelete,
  onBulkDelete,
  onBulkComplete,
  onOpenMobileFilter,
  categories,
  isViewOnly
}) {
  const isAdmin = user?.role === 'ADMIN' || user?.department === 'ALL';
  const userDept = user?.department || '';
  const isDeptRestricted = !isAdmin && userDept && userDept !== 'ALL';

  // Extract dynamic department list (reads directly from Settings!A4:A6 via categories.departments)
  const departmentList = useMemo(() => {
    if (categories?.departments && Array.isArray(categories.departments) && categories.departments.length > 0) {
      return categories.departments;
    }
    return window.INITIAL_CATEGORIES?.departments || ['Phòng Kinh tế', 'Phòng VH - XH', 'Văn phòng UBND'];
  }, [categories]);

  // Draft filter state (user selections before pressing "Tìm kiếm")
  const [draftFilters, setDraftFilters] = useState(() => ({
    taskName: '',
    docNo: '',
    department: isDeptRestricted ? userDept : '',
    assignee: '',
    status: '',
    rating: '',
    fromDate: '',
    toDate: ''
  }));

  useEffect(() => {
    if (isDeptRestricted) {
      setDraftFilters(prev => ({ ...prev, department: userDept }));
      setActiveFilters(prev => ({ ...prev, department: userDept }));
    }
  }, [isDeptRestricted, userDept]);

  // Dependent Employee list filtered by selected Department in draftFilters (only active employees with status "Đang làm việc")
  const filteredEmployees = useMemo(() => {
    const allEmps = (employees && Array.isArray(employees) && employees.length > 0) ? employees : (window.INITIAL_EMPLOYEES || []);
    const activeEmps = allEmps.filter(emp => isEmployeeActive(emp));
    const targetDept = isDeptRestricted ? userDept : draftFilters.department;
    if (!targetDept || targetDept.trim() === '') {
      return activeEmps;
    }
    return activeEmps.filter(emp => (emp.phong_ban || '').trim().toLowerCase() === targetDept.trim().toLowerCase());
  }, [employees, draftFilters.department, isDeptRestricted, userDept]);

  // Active filter state (applied to table only on "Tìm kiếm" click or Reset)
  const [activeFilters, setActiveFilters] = useState(() => ({
    taskName: '',
    docNo: '',
    department: isDeptRestricted ? userDept : '',
    assignee: '',
    status: '',
    rating: '',
    fromDate: '',
    toDate: ''
  }));

  const [currentPage, setCurrentPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);
  const [sortField, setSortField] = useState('id');
  const [sortOrder, setSortOrder] = useState('desc');

  const handleSort = (field) => {
    if (sortField === field) {
      setSortOrder(prev => prev === 'asc' ? 'desc' : 'asc');
    } else {
      setSortField(field);
      setSortOrder('desc');
    }
  };

  // Trigger search action
  const handleSearch = () => {
    setActiveFilters({ ...draftFilters });
    setCurrentPage(1);
  };

  // Trigger reset action
  const handleReset = () => {
    const emptyFilters = {
      taskName: '',
      docNo: '',
      department: isDeptRestricted ? userDept : '',
      assignee: '',
      status: '',
      rating: '',
      fromDate: '',
      toDate: ''
    };
    setDraftFilters(emptyFilters);
    setActiveFilters(emptyFilters);
    setCurrentPage(1);
  };

  // Filter logic applied strictly from activeFilters
  const filteredTasks = useMemo(() => {
    return tasks.filter(task => {
      // 1. Tên công việc
      if (activeFilters.taskName && activeFilters.taskName.trim() !== '') {
        const q = activeFilters.taskName.trim().toLowerCase();
        if (!task.ten_cong_viec || !task.ten_cong_viec.toLowerCase().includes(q)) return false;
      }

      // 2. Số công văn
      if (activeFilters.docNo && activeFilters.docNo.trim() !== '') {
        const q = activeFilters.docNo.trim().toLowerCase();
        if (!task.so_cong_van || !task.so_cong_van.toLowerCase().includes(q)) return false;
      }

      // 3. Phòng ban
      if (activeFilters.department && activeFilters.department.trim() !== '') {
        if (!task.phong_ban || task.phong_ban.trim() !== activeFilters.department.trim()) return false;
      }

      // 4. Từ ngày -> Đến ngày theo Ngày tạo (task.ngay_tao)
      const fromTime = activeFilters.fromDate ? parseDateToTimestamp(activeFilters.fromDate) : 0;
      const toTime = activeFilters.toDate ? parseDateToTimestamp(activeFilters.toDate) : 0;

      if (fromTime > 0 || toTime > 0) {
        const taskTime = parseDateToTimestamp(task.ngay_tao);
        if (taskTime === 0) return false;
        if (fromTime > 0 && taskTime < fromTime) return false;
        if (toTime > 0 && taskTime > (toTime + 86400000 - 1)) return false;
      }

      // 5. Người phụ trách
      if (activeFilters.assignee && task.nguoi_phu_trach !== activeFilters.assignee) {
        return false;
      }

      // 6. Trạng thái
      if (activeFilters.status && task.trang_thai !== activeFilters.status) {
        return false;
      }

      // 7. Đánh giá
      if (activeFilters.rating && activeFilters.rating.trim() !== '') {
        const evalVal = calculateEvaluation(task);
        if (evalVal !== activeFilters.rating.trim()) return false;
      }

      return true;
    }).sort((a, b) => {
      let aVal = a[sortField];
      let bVal = b[sortField];

      // If sorting by date fields, use parseDateToTimestamp
      if (sortField === 'ngay_tao' || sortField === 'deadline' || sortField === 'ngay_hoan_thanh') {
        const timeA = parseDateToTimestamp(aVal);
        const timeB = parseDateToTimestamp(bVal);
        if (timeA !== timeB) {
          return sortOrder === 'asc' ? timeA - timeB : timeB - timeA;
        }
      } else {
        if (aVal === undefined || aVal === null) aVal = '';
        if (bVal === undefined || bVal === null) bVal = '';

        if (aVal !== bVal) {
          if (typeof aVal === 'number' && typeof bVal === 'number') {
            return sortOrder === 'asc' ? aVal - bVal : bVal - aVal;
          }
          const comp = String(aVal).localeCompare(String(bVal), 'vi', { numeric: true });
          if (comp !== 0) {
            return sortOrder === 'asc' ? comp : -comp;
          }
        }
      }

      const aId = Number(a.id) || 0;
      const bId = Number(b.id) || 0;
      return sortOrder === 'asc' ? aId - bId : bId - aId;
    });
  }, [tasks, activeFilters, sortField, sortOrder]);

  const totalPages = Math.ceil(filteredTasks.length / pageSize) || 1;
  const paginatedTasks = filteredTasks.slice((currentPage - 1) * pageSize, currentPage * pageSize);

  const toggleSelectAll = (e) => {
    if (e.target.checked) {
      setSelectedTaskIds(paginatedTasks.map(t => t.id));
    } else {
      setSelectedTaskIds([]);
    }
  };

  const toggleSelectTask = (id) => {
    setSelectedTaskIds(prev => prev.includes(id) ? prev.filter(i => i !== id) : [...prev, id]);
  };

  const handleExportExcel = async () => {
    if (!filteredTasks || filteredTasks.length === 0) {
      if (addToast) addToast('warning', 'Không có dữ liệu', 'Không có công việc nào khớp với bộ lọc hiện tại để xuất Excel!');
      return;
    }

    try {
      if (window.XLSX) {
        const excelRows = filteredTasks.map((task, index) => ({
          'STT': index + 1,
          'Số công văn': task.so_cong_van || '',
          'Nơi ban hành': task.noi_ban_hanh || '',
          'Tên công việc': task.ten_cong_viec || '',
          'Mô tả / Nội dung': task.mo_ta || '',
          'Phòng ban': task.phong_ban || '',
          'Người phụ trách': task.nguoi_phu_trach || '',
          'Đơn vị / Người phối hợp': task.don_vi_phoi_hop || '',
          'Ngày tạo': formatDate(task.ngay_tao),
          'Deadline': formatDate(task.deadline),
          'Ngày hoàn thành': formatDate(task.ngay_hoan_thanh),
          'Trạng thái': task.trang_thai || '',
          'Kết quả': task.ket_qua || '',
          'Ghi chú': task.ghi_chu || '',
          'Đánh giá': calculateEvaluation(task)
        }));

        const worksheet = window.XLSX.utils.json_to_sheet(excelRows);
        worksheet['!cols'] = [
          { wch: 6 },  // STT
          { wch: 22 }, // Số công văn
          { wch: 22 }, // Nơi ban hành
          { wch: 45 }, // Tên công việc
          { wch: 35 }, // Mô tả
          { wch: 18 }, // Phòng ban
          { wch: 22 }, // Người phụ trách
          { wch: 14 }, // Ngày tạo
          { wch: 14 }, // Deadline
          { wch: 16 }, // Ngày hoàn thành
          { wch: 16 }, // Trạng thái
          { wch: 25 }, // Kết quả
          { wch: 25 }, // Ghi chú
          { wch: 16 }  // Đánh giá
        ];

        const workbook = window.XLSX.utils.book_new();
        window.XLSX.utils.book_append_sheet(workbook, worksheet, 'DanhSachCongViec');
        const now = new Date();
        const dateStr = `${now.getFullYear()}${String(now.getMonth() + 1).padStart(2, '0')}${String(now.getDate()).padStart(2, '0')}`;
        const filename = `Danh_sach_cong_viec_${dateStr}.xlsx`;
        window.XLSX.writeFile(workbook, filename);
        if (addToast) addToast('success', 'Xuất Excel thành công', `Đã tải xuống ${filteredTasks.length} công việc ra tệp ${filename}!`);
        return;
      }

      // Fallback to Backend POST /api/export-excel
      const res = await fetch('/api/export-excel', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ tasks: filteredTasks })
      });

      if (!res.ok) throw new Error(`HTTP error ${res.status}`);

      const blob = await res.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `Danh_sach_cong_viec.xlsx`;
      document.body.appendChild(a);
      a.click();
      window.URL.revokeObjectURL(url);
      a.remove();

      if (addToast) addToast('success', 'Xuất Excel thành công', `Đã tải xuống file Excel cho ${filteredTasks.length} công việc!`);
    } catch (e) {
      console.error('Export Excel error:', e);
      if (addToast) addToast('danger', 'Lỗi xuất Excel', 'Không thể tạo file Excel. Vui lòng thử lại!');
    }
  };

  return (
    <div className="space-y-2">
      {/* Filter Toolbar (Structured 2-Row 5-Column Grid Layout) */}
      <div className="bg-white rounded-xl border border-slate-200 p-3.5 shadow-xs space-y-3">
        {/* ROW 1: 4 Filter Inputs (Tên CV, Số CV, Phòng ban, Người phụ trách) & Actions (Tìm kiếm, Đặt lại) */}
        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-3 items-end">
          {/* Col 1: Tên công việc */}
          <div>
            <label className="block text-[11px] font-bold text-slate-500 uppercase mb-1 flex items-center gap-1">
              <i data-lucide="sliders-horizontal" className="w-3.5 h-3.5 text-blue-600"></i>
              <span>Tên công việc</span>
            </label>
            <input
              type="text"
              placeholder="Nhập tên công việc..."
              value={draftFilters.taskName}
              onChange={e => setDraftFilters({ ...draftFilters, taskName: e.target.value })}
              onKeyDown={e => { if (e.key === 'Enter') handleSearch(); }}
              className="form-input w-full"
            />
          </div>

          {/* Col 2: Số công văn */}
          <div>
            <label className="block text-[11px] font-bold text-slate-500 uppercase mb-1">Số công văn</label>
            <input
              type="text"
              placeholder="Nhập số công văn..."
              value={draftFilters.docNo}
              onChange={e => setDraftFilters({ ...draftFilters, docNo: e.target.value })}
              onKeyDown={e => { if (e.key === 'Enter') handleSearch(); }}
              className="form-input w-full"
            />
          </div>

          {/* Col 3: Phòng ban */}
          <div>
            <label className="block text-[11px] font-bold text-slate-500 uppercase mb-1">Phòng ban</label>
            <select
              value={draftFilters.department}
              disabled={isDeptRestricted}
              onChange={e => {
                if (isDeptRestricted) return;
                const selectedDept = e.target.value;
                setDraftFilters(prev => ({
                  ...prev,
                  department: selectedDept,
                  assignee: ''
                }));
              }}
              className={`form-select w-full ${isDeptRestricted ? 'bg-slate-100 opacity-90 cursor-not-allowed text-slate-700 font-semibold' : ''}`}
            >
              {!isDeptRestricted && <option value="">-- Tất cả phòng ban --</option>}
              {departmentList.map(dept => (
                <option key={dept} value={dept}>{dept}</option>
              ))}
            </select>
          </div>

          {/* Col 4: Người phụ trách (Searchable Dropdown) */}
          <div>
            <label className="block text-[11px] font-bold text-slate-500 uppercase mb-1">Người phụ trách</label>
            <SearchableSelect
              options={[
                { value: '', label: '-- Tất cả --' },
                ...(filteredEmployees?.map(e => ({
                  value: e.ho_ten,
                  label: e.ho_ten,
                  subtext: e.chuc_vu ? `${e.chuc_vu} - ${e.phong_ban || ''}` : e.phong_ban
                })) || [])
              ]}
              value={draftFilters.assignee}
              onChange={val => setDraftFilters({ ...draftFilters, assignee: val })}
              placeholder="-- Tất cả --"
              required={true}
            />
          </div>

          {/* Col 5: Row 1 Actions (Tìm kiếm & Đặt lại) */}
          <div className="flex items-center gap-2 w-full">
            <button
              onClick={handleSearch}
              className="flex-1 btn-primary text-xs h-[38px] font-semibold whitespace-nowrap shadow-xs justify-center"
              title="Thực hiện tìm kiếm"
            >
              <i data-lucide="search" className="w-3.5 h-3.5"></i> Tìm kiếm
            </button>
            <button
              onClick={handleReset}
              className="flex-1 btn-secondary text-xs h-[38px] font-medium text-slate-600 whitespace-nowrap justify-center"
              title="Đặt lại bộ lọc"
            >
              <i data-lucide="rotate-ccw" className="w-3.5 h-3.5"></i> Đặt lại
            </button>
          </div>
        </div>

        {/* ROW 2: 4 Filter Inputs (Trạng thái, Đánh giá, Từ ngày, Đến ngày) & Actions (Thêm mới, Xuất Excel) */}
        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-3 items-end pt-1 border-t border-slate-100">
          {/* Col 1: Trạng thái */}
          <div>
            <label className="block text-[11px] font-bold text-slate-500 uppercase mb-1">Trạng thái</label>
            <select
              value={draftFilters.status}
              onChange={e => setDraftFilters({ ...draftFilters, status: e.target.value })}
              className="form-select w-full"
            >
              <option value="">-- Tất cả --</option>
              <option value="Hoàn thành">Hoàn thành</option>
              <option value="Đang thực hiện">Đang thực hiện</option>
              <option value="Tạm dừng">Tạm dừng</option>
            </select>
          </div>

          {/* Col 2: Đánh giá */}
          <div>
            <label className="block text-[11px] font-bold text-slate-500 uppercase mb-1">Đánh giá</label>
            <select
              value={draftFilters.rating}
              onChange={e => setDraftFilters({ ...draftFilters, rating: e.target.value })}
              className="form-select w-full"
            >
              <option value="">-- Tất cả --</option>
              <option value="Trước hạn">Trước hạn</option>
              <option value="Đúng hạn">Đúng hạn</option>
              <option value="Đến hạn">Đến hạn</option>
              <option value="Trễ hạn">Trễ hạn</option>
            </select>
          </div>

          {/* Col 3: Từ ngày */}
          <div>
            <label className="block text-[11px] font-bold text-slate-500 uppercase mb-1">Từ ngày</label>
            <DateInput
              value={draftFilters.fromDate}
              onChange={val => setDraftFilters({ ...draftFilters, fromDate: val })}
              placeholder="dd/mm/yyyy"
            />
          </div>

          {/* Col 4: Đến ngày */}
          <div>
            <label className="block text-[11px] font-bold text-slate-500 uppercase mb-1">Đến ngày</label>
            <DateInput
              value={draftFilters.toDate}
              onChange={val => setDraftFilters({ ...draftFilters, toDate: val })}
              placeholder="dd/mm/yyyy"
            />
          </div>

          {/* Col 5: Row 2 Actions (Thêm mới & Xuất Excel) */}
          <div className="flex items-center gap-2 w-full">
            {!isViewOnly ? (
              <button onClick={onOpenAddTask} className="flex-1 btn-primary text-xs h-[38px] font-semibold shadow-xs justify-center">
                <i data-lucide="plus" className="w-3.5 h-3.5"></i> Thêm mới
              </button>
            ) : (
              <div className="flex-1"></div>
            )}
            <button onClick={handleExportExcel} className="flex-1 btn-success text-xs h-[38px] font-semibold shadow-xs justify-center hover:bg-emerald-700 transition-colors" title="Xuất danh sách công việc hiện tại ra file Excel (.xlsx)">
              <i data-lucide="file-spreadsheet" className="w-3.5 h-3.5"></i> Xuất Excel
            </button>
          </div>
        </div>
      </div>

      {/* Bulk Actions Bar */}
      {selectedTaskIds.length > 0 && !isViewOnly && (
        <div className="bg-blue-50 border border-blue-200 rounded-xl p-3 flex items-center justify-between animate-fadeIn">
          <span className="text-xs font-semibold text-blue-800">
            Đã chọn <strong className="text-blue-900">{selectedTaskIds.length}</strong> công việc
          </span>
          <div className="flex items-center gap-2">
            <button onClick={onBulkComplete} className="btn-success h-8 text-xs">
              <i data-lucide="check-circle" className="w-3.5 h-3.5"></i> Hoàn thành
            </button>
            <button onClick={onBulkDelete} className="btn-secondary h-8 text-xs text-rose-600 border-rose-200 hover:bg-rose-50">
              <i data-lucide="trash-2" className="w-3.5 h-3.5"></i> Xóa
            </button>
          </div>
        </div>
      )}

      {/* DESKTOP TABLE VIEW */}
      <div className="hidden md:block bg-white rounded-xl border border-slate-200 shadow-xs overflow-hidden">
        <div className="overflow-x-auto custom-scrollbar">
          <table className="custom-table w-full min-w-[1050px]">
            <thead>
              <tr>
                {!isViewOnly && (
                  <th className="w-9 text-center px-1">
                    <input
                      type="checkbox"
                      checked={selectedTaskIds.length > 0 && selectedTaskIds.length === paginatedTasks.length}
                      onChange={toggleSelectAll}
                      className="rounded border-slate-300 text-blue-600"
                    />
                  </th>
                )}
                <th className="w-10 text-center px-1">STT</th>
                <th className="w-28 text-left px-2 break-words">Số công văn</th>
                <th className="text-left px-2 min-w-[200px]">Tên công việc</th>
                <th className="w-32 text-left px-2 break-words">Người phụ trách</th>
                <th className="w-36 text-left px-2 break-words">Đơn vị / Người phối hợp</th>
                <th className="w-24 text-center px-1.5 whitespace-nowrap">Deadline</th>
                <th className="w-28 text-center px-1.5 whitespace-nowrap">Ngày hoàn thành</th>
                <th className="w-28 text-center px-1.5 whitespace-nowrap">Trạng thái</th>
                <th className="w-24 text-center px-1.5 whitespace-nowrap">Đánh giá</th>
                <th className="w-24 text-center px-1">Thao tác</th>
              </tr>
            </thead>
            <tbody>
              {paginatedTasks.map((task, idx) => (
                <tr key={task.id} className={selectedTaskIds.includes(task.id) ? 'bg-blue-50/50' : ''}>
                  {!isViewOnly && (
                    <td className="text-center px-1">
                      <input
                        type="checkbox"
                        checked={selectedTaskIds.includes(task.id)}
                        onChange={() => toggleSelectTask(task.id)}
                        className="rounded border-slate-300 text-blue-600"
                      />
                    </td>
                  )}
                  <td className="text-slate-400 font-mono text-[11px] text-center px-1">{(currentPage - 1) * pageSize + idx + 1}</td>
                  <td className="align-top text-xs px-2 py-2 w-28">
                    <div
                      className={`font-bold cursor-pointer hover:underline leading-tight break-words ${
                        isTaskOverdue(task) ? 'text-rose-600 font-extrabold' : 'text-blue-600'
                      }`}
                      onClick={() => onOpenDetail(task)}
                      title={task.so_cong_van}
                    >
                      {task.so_cong_van || '--'}
                    </div>
                    <div className="text-[10px] text-slate-400 font-normal mt-0.5 truncate" title={task.noi_ban_hanh}>
                      {task.noi_ban_hanh || 'UBND tỉnh'}
                    </div>
                  </td>
                  <td className="align-top py-2 px-2 text-xs font-medium text-slate-900 cursor-pointer hover:text-blue-600 min-w-[200px]" onClick={() => onOpenDetail(task)}>
                    <div className="line-clamp-2 leading-snug" title={task.ten_cong_viec}>
                      {task.ten_cong_viec}
                    </div>
                  </td>
                  <td className="align-top text-xs px-2 py-2 w-32">
                    <div className="text-[10px] text-slate-400 font-normal truncate" title={task.phong_ban}>
                      {task.phong_ban || 'Kinh tế'}
                    </div>
                    <div className="font-bold text-slate-800 text-xs mt-0.5 truncate" title={task.nguoi_phu_trach}>
                      {task.nguoi_phu_trach || 'Chưa phân công'}
                    </div>
                  </td>
                  <td className="align-top text-xs px-2 py-2 w-36">
                    <div className="text-xs font-medium text-slate-700 leading-tight line-clamp-2" title={task.don_vi_phoi_hop || ''}>
                      {task.don_vi_phoi_hop && task.don_vi_phoi_hop !== '--' ? task.don_vi_phoi_hop : ''}
                    </div>
                  </td>
                  <td className="text-xs font-medium text-slate-800 align-top text-center py-2 px-1.5 w-24 whitespace-nowrap">{formatDate(task.deadline) !== '--' ? formatDate(task.deadline) : ''}</td>
                  <td className="text-xs font-medium text-slate-800 align-top text-center py-2 px-1.5 w-28 whitespace-nowrap">{formatDate(task.ngay_hoan_thanh) !== '--' ? formatDate(task.ngay_hoan_thanh) : ''}</td>
                  <td className="align-top text-center py-2 px-1.5 w-28 whitespace-nowrap"><StatusBadge status={task.trang_thai} /></td>
                  <td className="align-top text-center py-2 px-1.5 w-24 whitespace-nowrap"><RatingBadge task={task} rating={calculateEvaluation(task)} /></td>
                  <td className="align-top text-center py-2 px-1 w-24 whitespace-nowrap">
                    <div className="flex items-center justify-center gap-1.5 opacity-100 visible">
                      <button
                        type="button"
                        onClick={() => onOpenDetail(task)}
                        className="p-1.5 rounded-lg text-slate-700 hover:text-blue-600 hover:bg-slate-200/80 bg-slate-100 border border-slate-200 transition-colors inline-flex items-center justify-center cursor-pointer shadow-2xs"
                        title="Xem chi tiết"
                      >
                        <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                          <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"></path>
                          <circle cx="12" cy="12" r="3"></circle>
                        </svg>
                      </button>
                      {!isViewOnly && (
                        <>
                          <button
                            type="button"
                            onClick={() => onOpenEditTask(task)}
                            className="p-1.5 rounded-lg text-blue-600 hover:text-blue-700 hover:bg-blue-100/80 bg-blue-50 border border-blue-200/70 transition-colors inline-flex items-center justify-center cursor-pointer shadow-2xs"
                            title="Chỉnh sửa thông tin công việc"
                          >
                            <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                              <path d="M12 20h9"></path>
                              <path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4L16.5 3.5z"></path>
                            </svg>
                          </button>
                          {canDeleteTask(task, isAdmin) ? (
                            <button
                              type="button"
                              onClick={() => onConfirmDelete(task.id)}
                              className="p-1.5 rounded-lg text-rose-600 hover:text-rose-700 hover:bg-rose-100/80 bg-rose-50 border border-rose-200/70 transition-colors inline-flex items-center justify-center cursor-pointer shadow-2xs"
                              title="Xóa công việc"
                            >
                              <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                <polyline points="3 6 5 6 21 6"></polyline>
                                <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path>
                              </svg>
                            </button>
                          ) : (
                            <button
                              type="button"
                              disabled
                              className="p-1.5 rounded-lg text-slate-300 bg-slate-100 border border-slate-200 cursor-not-allowed opacity-40 inline-flex items-center justify-center"
                              title="Công việc đã hoàn thành: Chỉ Admin mới có quyền xóa"
                            >
                              <svg className="w-3.5 h-3.5 text-slate-400" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                <polyline points="3 6 5 6 21 6"></polyline>
                                <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path>
                              </svg>
                            </button>
                          )}
                        </>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {/* Pagination Footer */}
        <div className="p-4 border-t border-slate-100 flex items-center justify-between text-xs text-slate-500">
          <div className="flex items-center gap-2">
            <span>Hiển thị</span>
            <select value={pageSize} onChange={e => { setPageSize(Number(e.target.value)); setCurrentPage(1); }} className="form-select h-8 text-xs py-0">
              <option value={10}>10 dòng</option>
              <option value={25}>25 dòng</option>
              <option value={50}>50 dòng</option>
            </select>
            <span>/ Tổng {filteredTasks.length} dòng</span>
          </div>

          <div className="flex items-center gap-1">
            <button disabled={currentPage === 1} onClick={() => setCurrentPage(p => p - 1)} className="p-1.5 rounded-lg border border-slate-200 hover:bg-slate-50 disabled:opacity-40">
              <i data-lucide="chevron-left" className="w-4 h-4"></i>
            </button>
            <span className="px-3 py-1 font-semibold text-slate-700">Trang {currentPage} / {totalPages}</span>
            <button disabled={currentPage === totalPages} onClick={() => setCurrentPage(p => p + 1)} className="p-1.5 rounded-lg border border-slate-200 hover:bg-slate-50 disabled:opacity-40">
              <i data-lucide="chevron-right" className="w-4 h-4"></i>
            </button>
          </div>
        </div>
      </div>

      {/* MOBILE CARD LIST VIEW (360px - 430px Optimized) */}
      <div className="block md:hidden space-y-3">
        {paginatedTasks.map(task => (
          <div key={task.id} className="bg-white rounded-xl border border-slate-200 p-4 shadow-xs space-y-3">
            <div className="flex items-start justify-between gap-2">
              <span className={`text-xs font-bold px-2 py-0.5 rounded-md ${
                isTaskOverdue(task) ? 'text-rose-600 bg-rose-50 border border-rose-200' : 'text-blue-600 bg-blue-50'
              }`}>
                {task.so_cong_van}
              </span>
              <StatusBadge status={task.trang_thai} />
            </div>

            <h4 onClick={() => onOpenDetail(task)} className="font-bold text-slate-900 text-sm leading-snug cursor-pointer active:text-blue-600">
              {task.ten_cong_viec}
            </h4>

            <div className="grid grid-cols-2 gap-2 text-xs text-slate-500 pt-2 border-t border-slate-100">
              <div>
                <span className="block text-[10px] text-slate-400 uppercase font-semibold">Người phụ trách</span>
                <span className="font-medium text-slate-700">{task.nguoi_phu_trach || 'Chưa phân công'}</span>
              </div>
              <div>
                <span className="block text-[10px] text-slate-400 uppercase font-semibold">
                  {formatDate(task.ngay_hoan_thanh) !== '--' ? 'Deadline / Hoàn thành' : 'Deadline'}
                </span>
                <span className="font-mono text-slate-700">
                  {formatDate(task.ngay_hoan_thanh) !== '--'
                    ? `${formatDate(task.deadline)} (Hoàn thành: ${formatDate(task.ngay_hoan_thanh)})`
                    : formatDate(task.deadline)}
                </span>
              </div>
            </div>

            {/* Progress Bar simulation */}
            <div className="w-full bg-slate-100 h-1.5 rounded-full overflow-hidden">
              <div
                className={`h-full ${task.trang_thai === 'Hoàn thành' ? 'bg-emerald-500' : task.trang_thai === 'Đang thực hiện' ? 'bg-blue-500' : 'bg-amber-500'}`}
                style={{ width: task.trang_thai === 'Hoàn thành' ? '100%' : task.trang_thai === 'Đang thực hiện' ? '50%' : '20%' }}
              ></div>
            </div>

            <div className="flex items-center justify-between pt-1">
              <RatingBadge task={task} rating={calculateEvaluation(task)} />
              <div className="flex items-center gap-2">
                <button onClick={() => onOpenDetail(task)} className="btn-secondary h-8 px-2.5 text-xs">Chi tiết</button>
                {!isViewOnly && (
                  <button onClick={() => onOpenEditTask(task)} className="btn-primary h-8 px-2.5 text-xs">Sửa</button>
                )}
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function StatusBadge({ status }) {
  if (status === 'Hoàn thành') {
    return <span className="badge badge-completed"><span className="badge-dot"></span>Hoàn thành</span>;
  }
  if (status === 'Đang thực hiện') {
    return <span className="badge badge-progress"><span className="badge-dot"></span>Đang thực hiện</span>;
  }
  if (status === 'Quá hạn') {
    return <span className="badge badge-overdue"><span className="badge-dot"></span>Quá hạn</span>;
  }
  if (status === 'Tạm dừng') {
    return <span className="badge badge-paused"><span className="badge-dot"></span>Tạm dừng</span>;
  }
  return <span className="badge badge-canceled"><span className="badge-dot"></span>{status}</span>;
}

function RatingBadge({ rating, task }) {
  const evalVal = task ? calculateEvaluation(task) : (rating || '');
  if (evalVal === 'Trước hạn') return <span className="text-xs font-semibold text-emerald-600 bg-emerald-50 px-2 py-0.5 rounded">Trước hạn</span>;
  if (evalVal === 'Đúng hạn') return <span className="text-xs font-semibold text-blue-600 bg-blue-50 px-2 py-0.5 rounded">Đúng hạn</span>;
  if (evalVal === 'Đến hạn') return <span className="text-xs font-semibold text-amber-600 bg-amber-50 px-2 py-0.5 rounded">Đến hạn</span>;
  if (evalVal === 'Trễ hạn') return <span className="text-xs font-semibold text-rose-600 bg-rose-50 px-2 py-0.5 rounded">Trễ hạn</span>;
  if (evalVal === 'Tốt') return <span className="text-xs font-semibold text-emerald-600 bg-emerald-50 px-2 py-0.5 rounded">Trước hạn</span>;
  if (evalVal === 'Hoàn Thành Trễ hạn') return <span className="text-xs font-semibold text-rose-600 bg-rose-50 px-2 py-0.5 rounded">Trễ hạn</span>;
  return null;
}

// ----------------------------------------------------------------------
// 7. MODAL: THÊM CÔNG VIỆC
// ----------------------------------------------------------------------
function AddTaskModal({ categories, employees, defaultDepartment = '', onClose, onSubmit }) {
  const agencyList = useMemo(() => {
    const defaults = [
      'UBND tỉnh',
      'Sở Tài Chính',
      'Sở Nông nghiệp và PTNT',
      'Chi cục Thủy lợi',
      'Sở Xây dựng',
      'Văn phòng UBND',
      'Sở Công Thương'
    ];
    const catList = categories?.agencies || [];
    return Array.from(new Set([...defaults, ...catList]));
  }, [categories]);

  const departmentList = useMemo(() => {
    if (categories?.departments && Array.isArray(categories.departments) && categories.departments.length > 0) {
      return categories.departments;
    }
    return window.INITIAL_CATEGORIES?.departments || ['Phòng Kinh tế', 'Phòng VH - XH', 'Văn phòng UBND'];
  }, [categories]);

  const [formData, setFormData] = useState(() => {
    const initialDept = (defaultDepartment && defaultDepartment !== 'ALL') ? defaultDepartment : (departmentList[0] || 'Phòng Kinh tế');
    return {
      noi_ban_hanh: agencyList[0] || 'UBND tỉnh',
      so_cong_van: '',
      ten_cong_viec: '',
      mo_ta: '',
      phong_ban: initialDept,
      nguoi_phu_trach: '',
      don_vi_phoi_hop: '',
      ngay_tao: formatDate(new Date()),
      deadline: '',
      ket_qua: ''
    };
  });

  // Dependent Employee list filtered by selected Department in AddTaskModal (only active employees with status "Đang làm việc")
  const filteredEmployees = useMemo(() => {
    const allEmps = (employees && Array.isArray(employees) && employees.length > 0) ? employees : (window.INITIAL_EMPLOYEES || []);
    const activeEmps = allEmps.filter(emp => isEmployeeActive(emp));
    if (!formData.phong_ban || formData.phong_ban.trim() === '') {
      return activeEmps;
    }
    return activeEmps.filter(emp => emp.phong_ban === formData.phong_ban);
  }, [employees, formData.phong_ban]);

  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!formData.ten_cong_viec || !formData.so_cong_van) {
      alert('Vui lòng điền đầy đủ Số công văn và Tên công việc!');
      return;
    }
    setIsSubmitting(true);
    try {
      await onSubmit(formData);
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="modal-backdrop">
      <div className="modal-content max-w-2xl max-h-[90vh] flex flex-col">
        <div className="modal-header">
          <h3 className="font-bold text-slate-900 text-base">Thêm mới Công việc Phòng Kinh tế</h3>
          <button onClick={onClose} disabled={isSubmitting} className="p-1 rounded-lg text-slate-400 hover:bg-slate-100">
            <i data-lucide="x" className="w-5 h-5"></i>
          </button>
        </div>

        <form onSubmit={handleSubmit} className="flex-1 flex flex-col min-h-0">
          <div className="modal-body space-y-4 max-h-[70vh] overflow-y-auto p-4 md:p-6">
            {/* Grid 1: Nơi ban hành (Dropdown) & Số công văn */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">Nơi ban hành *</label>
                <SearchableSelect
                  options={agencyList}
                  value={formData.noi_ban_hanh}
                  onChange={val => setFormData({ ...formData, noi_ban_hanh: val })}
                  placeholder="Chọn hoặc tìm Nơi ban hành..."
                  required={true}
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">Số công văn *</label>
                <input
                  type="text"
                  placeholder="Ví dụ: 102/UBND-KT"
                  value={formData.so_cong_van}
                  onChange={e => setFormData({ ...formData, so_cong_van: e.target.value })}
                  className="form-input"
                  required
                />
              </div>
            </div>

            {/* Block 2: Tên công việc / Trích yếu (Textarea) */}
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">Tên công việc / Trích yếu *</label>
              <textarea
                rows={3}
                placeholder="Nhập tên công việc hoặc nội dung trích yếu..."
                value={formData.ten_cong_viec}
                onChange={e => setFormData({ ...formData, ten_cong_viec: e.target.value })}
                className="form-input h-auto py-2"
                required
              ></textarea>
            </div>

            {/* Block 3: Mô tả nội dung (Single-line Input) */}
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">Mô tả nội dung</label>
              <input
                type="text"
                placeholder="Mô tả tóm tắt nội dung nhiệm vụ..."
                value={formData.mo_ta}
                onChange={e => setFormData({ ...formData, mo_ta: e.target.value })}
                className="form-input"
              />
            </div>

            {/* Grid 2: Phòng ban & Người phụ trách (Dependent Dropdown) */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">Phòng ban *</label>
                <select
                  value={formData.phong_ban}
                  onChange={e => {
                    const selectedDept = e.target.value;
                    setFormData(prev => ({
                      ...prev,
                      phong_ban: selectedDept,
                      nguoi_phu_trach: ''
                    }));
                  }}
                  className="form-select"
                >
                  {departmentList.map(d => <option key={d} value={d}>{d}</option>)}
                </select>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">Người phụ trách *</label>
                <SearchableSelect
                  options={filteredEmployees?.map(emp => ({
                    value: emp.ho_ten,
                    label: emp.ho_ten,
                    subtext: emp.chuc_vu ? `${emp.chuc_vu} - ${emp.phong_ban || ''}` : emp.phong_ban
                  })) || []}
                  value={formData.nguoi_phu_trach}
                  onChange={val => setFormData({ ...formData, nguoi_phu_trach: val })}
                  placeholder="-- Chọn hoặc tìm Người phụ trách --"
                  required={false}
                />
              </div>
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">Đơn vị / Người phối hợp</label>
              <input
                type="text"
                placeholder="Ví dụ: Phòng VH-XH, Chi cục Thủy lợi, Nguyễn Văn A..."
                value={formData.don_vi_phoi_hop}
                onChange={e => setFormData({ ...formData, don_vi_phoi_hop: e.target.value })}
                className="form-input"
              />
            </div>

            {/* Grid 3: Ngày tạo & Deadline */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">Ngày tạo / Ban hành</label>
                <DateInput
                  value={formData.ngay_tao}
                  onChange={val => setFormData({ ...formData, ngay_tao: val })}
                  placeholder="dd/mm/yyyy"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">Deadline hoàn thành</label>
                <DateInput
                  value={formData.deadline}
                  onChange={val => setFormData({ ...formData, deadline: val })}
                  placeholder="dd/mm/yyyy"
                />
              </div>
            </div>

            {/* Block 4: Sản phẩm / Kết quả ban hành (Textarea) */}
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">Sản phẩm / Kết quả ban hành</label>
              <textarea
                rows={3}
                placeholder="Nhập sản phẩm hoặc kết quả xử lý ban hành..."
                value={formData.ket_qua}
                onChange={e => setFormData({ ...formData, ket_qua: e.target.value })}
                className="form-input h-auto py-2"
              ></textarea>
            </div>
          </div>

          <div className="modal-footer">
            <button type="button" onClick={onClose} disabled={isSubmitting} className="btn-secondary">Hủy</button>
            <button type="submit" disabled={isSubmitting} className="btn-primary inline-flex items-center gap-1.5 min-w-[140px] justify-center">
              {isSubmitting ? (
                <>
                  <Spinner className="w-4 h-4 text-white" />
                  <span>Đang lưu...</span>
                </>
              ) : (
                <>
                  <i data-lucide="check" className="w-4 h-4"></i>
                  <span>Lưu công việc</span>
                </>
              )}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

// ----------------------------------------------------------------------
// 8. MODAL: CHỈNH SỬA THÔNG TIN CÔNG VIỆC
// ----------------------------------------------------------------------
function EditTaskModal({ task, categories, employees, onClose, onSubmit }) {
  const agencyList = useMemo(() => {
    const defaults = [
      'UBND tỉnh',
      'Sở Tài Chính',
      'Sở Nông nghiệp và PTNT',
      'Chi cục Thủy lợi',
      'Sở Xây dựng',
      'Văn phòng UBND',
      'Sở Công Thương'
    ];
    const catList = categories?.agencies || [];
    const set = new Set([...defaults, ...catList]);
    if (task.noi_ban_hanh && task.noi_ban_hanh.trim() !== '') {
      set.add(task.noi_ban_hanh.trim());
    }
    return Array.from(set);
  }, [categories, task]);

  const departmentList = useMemo(() => {
    const catDepts = (categories?.departments && Array.isArray(categories.departments) && categories.departments.length > 0)
      ? categories.departments
      : (window.INITIAL_CATEGORIES?.departments || ['Phòng Kinh tế', 'Phòng VH - XH', 'Văn phòng UBND']);
    const set = new Set([...catDepts]);
    if (task.phong_ban && task.phong_ban.trim() !== '') {
      set.add(task.phong_ban.trim());
    }
    return Array.from(set);
  }, [categories, task]);

  const [formData, setFormData] = useState({
    id: task.id,
    excel_row: task.excel_row || null,
    noi_ban_hanh: task.noi_ban_hanh || agencyList[0] || 'UBND tỉnh',
    so_cong_van: task.so_cong_van || '',
    ten_cong_viec: task.ten_cong_viec || '',
    mo_ta: task.mo_ta || '',
    phong_ban: task.phong_ban || departmentList[0] || 'Phòng Kinh tế',
    nguoi_phu_trach: task.nguoi_phu_trach || '',
    don_vi_phoi_hop: task.don_vi_phoi_hop || '',
    ngay_tao: formatDate(task.ngay_tao) !== '--' ? formatDate(task.ngay_tao) : (task.ngay_tao || ''),
    deadline: formatDate(task.deadline) !== '--' ? formatDate(task.deadline) : (task.deadline || ''),
    ngay_hoan_thanh: formatDate(task.ngay_hoan_thanh) !== '--' ? formatDate(task.ngay_hoan_thanh) : (task.ngay_hoan_thanh || ''),
    trang_thai: task.trang_thai || 'Đang thực hiện',
    ket_qua: task.ket_qua || '',
    ghi_chu: task.ghi_chu || '',
    danh_gia: task.danh_gia || ''
  });

  // Dependent Employee list filtered by selected Department in EditTaskModal (only active employees with status "Đang làm việc")
  const filteredEmployees = useMemo(() => {
    const allEmps = (employees && Array.isArray(employees) && employees.length > 0) ? employees : (window.INITIAL_EMPLOYEES || []);
    const activeEmps = allEmps.filter(emp => isEmployeeActive(emp));
    if (!formData.phong_ban || formData.phong_ban.trim() === '') {
      return activeEmps;
    }
    return activeEmps.filter(emp => emp.phong_ban === formData.phong_ban);
  }, [employees, formData.phong_ban]);

  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!formData.ten_cong_viec || !formData.so_cong_van) {
      alert('Vui lòng điền đầy đủ Số công văn và Tên công việc!');
      return;
    }
    if (!formData.ngay_hoan_thanh || !formData.ngay_hoan_thanh.trim()) {
      alert('Vui lòng nhập Ngày hoàn thành thực tế!');
      return;
    }
    if (!formData.ket_qua || !formData.ket_qua.trim()) {
      alert('Vui lòng nhập Sản phẩm / Kết quả ban hành!');
      return;
    }
    setIsSubmitting(true);
    try {
      await onSubmit(formData);
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="modal-backdrop">
      <div className="modal-content max-w-2xl max-h-[90vh] flex flex-col">
        <div className="modal-header">
          <div>
            <h3 className="font-bold text-slate-900 text-base">Chỉnh sửa thông tin công việc</h3>
            <span className="text-xs font-semibold text-blue-600 bg-blue-50 px-2 py-0.5 rounded mt-1 inline-block">
              Mã CV #{task.id} - {task.so_cong_van || 'Chưa có số CV'}
            </span>
          </div>
          <button onClick={onClose} className="p-1 rounded-lg text-slate-400 hover:bg-slate-100">
            <i data-lucide="x" className="w-5 h-5"></i>
          </button>
        </div>

        <form onSubmit={handleSubmit} className="flex-1 flex flex-col min-h-0">
          <div className="modal-body space-y-4 max-h-[70vh] overflow-y-auto p-4 md:p-6">
            {/* Grid 1: Nơi ban hành (Dropdown) & Số công văn */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">Nơi ban hành *</label>
                <SearchableSelect
                  options={agencyList}
                  value={formData.noi_ban_hanh}
                  onChange={val => setFormData({ ...formData, noi_ban_hanh: val })}
                  placeholder="Chọn hoặc tìm Nơi ban hành..."
                  required={true}
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">Số công văn *</label>
                <input
                  type="text"
                  placeholder="Ví dụ: 102/UBND-KT"
                  value={formData.so_cong_van}
                  onChange={e => setFormData({ ...formData, so_cong_van: e.target.value })}
                  className="form-input"
                  required
                />
              </div>
            </div>

            {/* Block 2: Tên công việc / Trích yếu (Textarea) */}
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">Tên công việc / Trích yếu *</label>
              <textarea
                rows={3}
                placeholder="Nhập tên công việc hoặc nội dung trích yếu..."
                value={formData.ten_cong_viec}
                onChange={e => setFormData({ ...formData, ten_cong_viec: e.target.value })}
                className="form-input h-auto py-2"
                required
              ></textarea>
            </div>

            {/* Block 3: Mô tả nội dung (Single-line Input) */}
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">Mô tả nội dung</label>
              <input
                type="text"
                placeholder="Mô tả tóm tắt nội dung nhiệm vụ..."
                value={formData.mo_ta}
                onChange={e => setFormData({ ...formData, mo_ta: e.target.value })}
                className="form-input"
              />
            </div>

            {/* Grid 2: Phòng ban & Người phụ trách (Dependent Dropdown) */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">Phòng ban *</label>
                <select
                  value={formData.phong_ban}
                  onChange={e => {
                    const selectedDept = e.target.value;
                    setFormData(prev => {
                      const isAssigneeValid = (employees || []).some(emp => emp.phong_ban === selectedDept && emp.ho_ten === prev.nguoi_phu_trach && isEmployeeActive(emp));
                      return {
                        ...prev,
                        phong_ban: selectedDept,
                        nguoi_phu_trach: isAssigneeValid ? prev.nguoi_phu_trach : ''
                      };
                    });
                  }}
                  className="form-select"
                >
                  {departmentList.map(d => <option key={d} value={d}>{d}</option>)}
                </select>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">Người phụ trách *</label>
                <SearchableSelect
                  options={filteredEmployees?.map(emp => ({
                    value: emp.ho_ten,
                    label: emp.ho_ten,
                    subtext: emp.chuc_vu ? `${emp.chuc_vu} - ${emp.phong_ban || ''}` : emp.phong_ban
                  })) || []}
                  value={formData.nguoi_phu_trach}
                  onChange={val => setFormData({ ...formData, nguoi_phu_trach: val })}
                  placeholder="-- Chọn hoặc tìm Người phụ trách --"
                  required={false}
                />
              </div>
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">Đơn vị / Người phối hợp</label>
              <input
                type="text"
                placeholder="Ví dụ: Phòng VH-XH, Chi cục Thủy lợi, Nguyễn Văn A..."
                value={formData.don_vi_phoi_hop}
                onChange={e => setFormData({ ...formData, don_vi_phoi_hop: e.target.value })}
                className="form-input"
              />
            </div>

            {/* Grid 3: Ngày tạo & Deadline */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">Ngày tạo / Ban hành</label>
                <DateInput
                  value={formData.ngay_tao}
                  onChange={val => setFormData({ ...formData, ngay_tao: val })}
                  placeholder="dd/mm/yyyy"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">Deadline hoàn thành</label>
                <DateInput
                  value={formData.deadline}
                  onChange={val => setFormData({ ...formData, deadline: val })}
                  placeholder="dd/mm/yyyy"
                />
              </div>
            </div>

            {/* Grid 4: Trạng thái & Ngày hoàn thành */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">Trạng thái công việc *</label>
                <select
                  value={formData.trang_thai}
                  onChange={e => setFormData({ ...formData, trang_thai: e.target.value })}
                  className="form-select"
                >
                  <option value="Đang thực hiện">Đang thực hiện</option>
                  <option value="Hoàn thành">Hoàn thành</option>
                  <option value="Quá hạn">Quá hạn</option>
                  <option value="Tạm dừng">Tạm dừng</option>
                  <option value="Hủy">Hủy</option>
                </select>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">Ngày hoàn thành thực tế *</label>
                <DateInput
                  value={formData.ngay_hoan_thanh}
                  onChange={val => setFormData({ ...formData, ngay_hoan_thanh: val })}
                  placeholder="dd/mm/yyyy"
                />
              </div>
            </div>

            {/* Block 5: Sản phẩm / Kết quả ban hành (Textarea) */}
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">Sản phẩm / Kết quả ban hành *</label>
              <textarea
                rows={3}
                placeholder="Ví dụ: Báo cáo số 45/BC-STC..."
                value={formData.ket_qua}
                onChange={e => setFormData({ ...formData, ket_qua: e.target.value })}
                className="form-input h-auto py-2"
                required
              ></textarea>
            </div>
          </div>

          <div className="modal-footer">
            <button type="button" onClick={onClose} disabled={isSubmitting} className="btn-secondary">Hủy</button>
            <button type="submit" disabled={isSubmitting} className="btn-primary inline-flex items-center gap-1.5 min-w-[150px] justify-center">
              {isSubmitting ? (
                <>
                  <Spinner className="w-4 h-4 text-white" />
                  <span>Đang lưu thay đổi...</span>
                </>
              ) : (
                <>
                  <i data-lucide="check" className="w-4 h-4"></i>
                  <span>Lưu thay đổi</span>
                </>
              )}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

// ----------------------------------------------------------------------
// 9. MODAL: CHI TIẾT CÔNG VIỆC
// ----------------------------------------------------------------------
function TaskDetailModal({ task, isViewOnly, onClose, onOpenEditTask, onOpenPrintSubmission }) {
  return (
    <div className="modal-backdrop">
      <div className="modal-content max-w-2xl">
        <div className="modal-header">
          <div>
            <span className={`text-xs font-bold px-2 py-0.5 rounded ${
              isTaskOverdue(task) ? 'text-rose-600 bg-rose-50 border border-rose-200' : 'text-blue-600 bg-blue-50'
            }`}>{task.so_cong_van}</span>
            <h3 className="font-bold text-slate-900 text-base mt-1">{task.ten_cong_viec}</h3>
          </div>
          <button onClick={onClose} className="p-1 rounded-lg text-slate-400 hover:bg-slate-100">
            <i data-lucide="x" className="w-5 h-5"></i>
          </button>
        </div>

        <div className="modal-body space-y-6">
          {/* Metadata Grid */}
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-4 p-4 bg-slate-50 rounded-xl border border-slate-200/60 text-xs">
            <div>
              <span className="block text-slate-400 uppercase font-semibold">Nơi ban hành</span>
              <span className="font-medium text-slate-800">{task.noi_ban_hanh}</span>
            </div>
            <div>
              <span className="block text-slate-400 uppercase font-semibold">Người phụ trách</span>
              <span className="font-medium text-slate-800">{task.nguoi_phu_trach || '--'}</span>
            </div>
            <div>
              <span className="block text-slate-400 uppercase font-semibold">Đơn vị / Người phối hợp</span>
              <span className="font-medium text-slate-800">{task.don_vi_phoi_hop || '--'}</span>
            </div>
            <div>
              <span className="block text-slate-400 uppercase font-semibold">Trạng thái</span>
              <StatusBadge status={task.trang_thai} />
            </div>
            <div>
              <span className="block text-slate-400 uppercase font-semibold">Ngày tạo</span>
              <span className="font-mono text-slate-700">{formatDate(task.ngay_tao)}</span>
            </div>
            <div>
              <span className="block text-slate-400 uppercase font-semibold">Deadline</span>
              <span className="font-mono text-slate-700">{formatDate(task.deadline)}</span>
            </div>
            <div>
              <span className="block text-slate-400 uppercase font-semibold">Ngày hoàn thành</span>
              <span className="font-mono text-slate-700">{formatDate(task.ngay_hoan_thanh)}</span>
            </div>
          </div>

          {/* Description */}
          {task.mo_ta && (
            <div>
              <h4 className="text-xs font-bold text-slate-700 uppercase mb-2">Mô tả nội dung</h4>
              <p className="text-sm text-slate-600 bg-white p-3 rounded-xl border border-slate-200">{task.mo_ta}</p>
            </div>
          )}

          {/* Timeline of Updates */}
          <div>
            <h4 className="text-xs font-bold text-slate-700 uppercase mb-3">Lịch sử & Timeline xử lý</h4>
            <div className="space-y-3 pl-4 border-l-2 border-slate-200 text-xs">
              <div className="relative">
                <div className="absolute -left-[21px] top-0 w-3.5 h-3.5 rounded-full bg-blue-600 ring-4 ring-white"></div>
                <div className="font-semibold text-slate-800">Khởi tạo công việc</div>
                <div className="text-slate-400">Tạo ngày {formatDate(task.ngay_tao)} bởi Văn thư Phòng</div>
              </div>
              <div className="relative">
                <div className="absolute -left-[21px] top-0 w-3.5 h-3.5 rounded-full bg-emerald-500 ring-4 ring-white"></div>
                <div className="font-semibold text-slate-800">Cập nhật tiến độ gần nhất</div>
                <div className="text-slate-500">Trạng thái: <strong>{task.trang_thai}</strong> - Sản phẩm: {task.ket_qua || 'Chưa có sản phẩm'}</div>
              </div>
            </div>
          </div>
        </div>

        <div className="modal-footer flex items-center justify-between">
          {onOpenPrintSubmission && (
            <button
              type="button"
              onClick={() => onOpenPrintSubmission(task)}
              className="btn-secondary text-xs text-blue-700 border-blue-200 bg-blue-50/80 hover:bg-blue-100 font-semibold inline-flex items-center gap-1.5 shadow-2xs"
            >
              <i data-lucide="file-text" className="w-4 h-4"></i> In phiếu trình
            </button>
          )}
          <div className="flex items-center gap-2">
            <button type="button" onClick={onClose} className="btn-secondary text-xs">
              Đóng
            </button>
            {!isViewOnly && (
              <button type="button" onClick={() => onOpenEditTask(task)} className="btn-primary text-xs">
                <i data-lucide="edit-3" className="w-4 h-4"></i> Chỉnh sửa thông tin
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

// ----------------------------------------------------------------------
// SUBMISSION PRINT MODAL (PHIẾU TRÌNH GIẢI QUYẾT CÔNG VIỆC CHUẨN A4)
// ----------------------------------------------------------------------
function SubmissionPrintModal({ task, onClose, addToast }) {
  if (!task) return null;

  const a4PageRef = useRef(null);

  const getTodayVietnameseDate = () => {
    const now = new Date();
    const d = String(now.getDate()).padStart(2, '0');
    const m = String(now.getMonth() + 1).padStart(2, '0');
    const y = now.getFullYear();
    return `Định Mỹ, ngày ${d} tháng ${m} năm ${y}`;
  };

  const phongBanName = (task.phong_ban || 'Kinh tế').toUpperCase();
  const todayDateStr = getTodayVietnameseDate();

  // Dynamic initial fillings
  const defaultKinhGui = 'Lãnh đạo UBND xã Định Mỹ';

  const defaultVanDeTrinh = task.ten_cong_viec
    ? `V/v ${task.ten_cong_viec}`
    : 'V/v góp ý dự thảo Kế hoạch Đào tạo nâng cao chất lượng lao động ngành nông nghiệp, hình thành lực lượng nông dân số, nông dân chuyên nghiệp và đội ngũ quản trị hợp tác xã hiện đại giai đoạn 2026-2030 trên địa bàn tỉnh An Giang.';

  const defaultCanCu = (() => {
    const soCV = task.so_cong_van ? `Công văn số ${task.so_cong_van}` : 'Công văn số 9959/SNNMT-CCPTNTQLCL';
    const dateStr = formatDate(task.ngay_tao) !== '--' ? ` ngày ${formatDate(task.ngay_tao)}` : ' ngày 14 tháng 8 năm 2026';
    const noiBanHanhStr = (task.noi_ban_hanh && task.noi_ban_hanh !== '--') ? ` của ${task.noi_ban_hanh}` : ' của Sở Nông nghiệp và Môi trường tỉnh An Giang';
    const noiDungStr = (task.mo_ta || task.ten_cong_viec) ? ` v/v ${task.mo_ta || task.ten_cong_viec}` : '';
    return `Thực hiện theo ${soCV}${dateStr}${noiBanHanhStr}${noiDungStr}.`;
  })();

  const defaultTheLoai = 'Công văn';
  const defaultNoiDungVB = task.mo_ta || task.ten_cong_viec || 'góp ý dự thảo Kế hoạch Đào tạo nâng cao chất lượng lao động...';
  const defaultNoiNhan = (task.noi_ban_hanh && task.noi_ban_hanh !== '--') ? task.noi_ban_hanh : (task.noi_ban_hanh || 'Sở Nông nghiệp và Môi trường tỉnh An Giang');
  const defaultNguoiTrinh = task.nguoi_phu_trach || 'Trần Quốc Phong';

  const handlePrint = () => {
    try {
      const pageNode = a4PageRef.current;
      if (!pageNode) {
        window.print();
        return;
      }

      const printHtml = `
        <!DOCTYPE html>
        <html lang="vi">
        <head>
          <meta charset="UTF-8">
          <title>Phiếu trình giải quyết công việc</title>
          <style>
            @page {
              size: A4 portrait;
              margin: 10mm 15mm 10mm 15mm;
            }
            body {
              margin: 0;
              padding: 0;
              background: #ffffff;
              font-family: "Times New Roman", Times, serif;
              font-size: 13pt;
              line-height: 1.35;
              color: #000000;
              -webkit-print-color-adjust: exact;
              print-color-adjust: exact;
            }
            .a4-page {
              width: 100%;
              min-height: auto;
              padding: 0;
              margin: 0;
              box-shadow: none;
              font-family: "Times New Roman", Times, serif;
              font-size: 13pt;
              line-height: 1.35;
              color: #000000;
            }
            .header-table {
              width: 100%;
              border-collapse: collapse;
              margin-bottom: 15px;
            }
            .header-table td {
              vertical-align: top;
              width: 50%;
              text-align: center;
            }
            .unit-name {
              font-weight: bold;
              font-size: 12pt;
            }
            .nation-title {
              font-weight: bold;
              font-size: 12pt;
              white-space: nowrap;
            }
            .date-text {
              font-style: italic;
              font-size: 12pt;
              margin-top: 4px;
              white-space: nowrap;
            }
            .main-title {
              text-align: center;
              font-weight: bold;
              font-size: 15pt;
              margin: 20px 0 10px 0;
              text-transform: uppercase;
            }
            .recipient-line {
              font-weight: bold;
              margin-bottom: 12px;
              font-size: 13pt;
              text-align: center;
            }
            .issue-section {
              margin-bottom: 15px;
              text-align: justify;
            }
            .content-table {
              width: 100%;
              border-collapse: collapse;
              margin-top: 5px;
              margin-bottom: 20px;
            }
            .content-table th, .content-table td {
              border: 1px solid #000000;
              padding: 10px 12px;
              vertical-align: top;
            }
            .content-table th {
              text-align: center;
              font-weight: bold;
              background-color: #f5f5f5;
              font-size: 12pt;
            }
            .signature-box {
              text-align: center;
              margin-top: 10px;
            }
            .signature-title {
              font-weight: bold;
              font-size: 12pt;
            }
            .signature-subtitle {
              font-style: italic;
              font-size: 11pt;
              margin-bottom: 50px;
            }
            .signature-name {
              font-weight: bold;
              font-size: 12pt;
              text-transform: uppercase;
            }
            [contenteditable="true"] {
              outline: none !important;
              background-color: transparent !important;
            }
          </style>
        </head>
        <body>
          ${pageNode.outerHTML.replace(/contenteditable="true"/gi, '').replace(/contenteditable="false"/gi, '')}
        </body>
        </html>
      `;

      let iframe = document.getElementById('print-a4-iframe');
      if (!iframe) {
        iframe = document.createElement('iframe');
        iframe.id = 'print-a4-iframe';
        iframe.style.position = 'fixed';
        iframe.style.right = '0';
        iframe.style.bottom = '0';
        iframe.style.width = '0';
        iframe.style.height = '0';
        iframe.style.border = '0';
        iframe.style.visibility = 'hidden';
        document.body.appendChild(iframe);
      }

      const doc = iframe.contentWindow.document;
      doc.open();
      doc.write(printHtml);
      doc.close();

      setTimeout(() => {
        iframe.contentWindow.focus();
        iframe.contentWindow.print();
      }, 250);
    } catch (err) {
      console.error('Lỗi in phiếu:', err);
      window.print();
    }
  };

  const handleExportWord = () => {
    try {
      const pageNode = a4PageRef.current;
      let bodyHtml = pageNode ? pageNode.outerHTML : '';
      
      // Remove contenteditable attributes for clean Word document
      bodyHtml = bodyHtml
        .replace(/contenteditable="true"/gi, '')
        .replace(/contenteditable="false"/gi, '');

      const htmlContent = `
        <html xmlns:o='urn:schemas-microsoft-com:office:office'
              xmlns:w='urn:schemas-microsoft-com:office:word'
              xmlns:m='http://schemas.microsoft.com/office/2004/12/omml'
              xmlns='http://www.w3.org/TR/REC-html40'>
        <head>
          <meta charset='utf-8'>
          <title>Phiếu trình giải quyết công việc</title>
          <!--[if gte mso 9]>
          <xml>
            <w:WordDocument>
              <w:View>Print</w:View>
              <w:Zoom>100</w:Zoom>
              <w:DoNotOptimizeForBrowser/>
            </w:WordDocument>
          </xml>
          <![endif]-->
          <style>
            @page Section1 {
              size: 210mm 297mm;
              margin: 15mm 15mm 15mm 20mm;
              mso-header-margin: 36pt;
              mso-footer-margin: 36pt;
              mso-paper-source: 0;
            }
            div.Section1 {
              page: Section1;
            }
            body {
              font-family: 'Times New Roman', Times, serif;
              font-size: 13pt;
              line-height: 1.35;
              color: #000000;
              background-color: #ffffff;
            }
            .a4-page {
              width: 100%;
              padding: 0;
              margin: 0;
              font-family: 'Times New Roman', Times, serif;
              font-size: 13pt;
              line-height: 1.35;
              color: #000000;
            }
            .header-table {
              width: 100%;
              border-collapse: collapse;
              margin-bottom: 15px;
            }
            .header-table td {
              vertical-align: top;
              width: 50%;
              text-align: center;
            }
            .unit-name {
              font-weight: bold;
              font-size: 12pt;
            }
            .nation-title {
              font-weight: bold;
              font-size: 12pt;
              white-space: nowrap;
            }
            .date-text {
              font-style: italic;
              font-size: 12pt;
              margin-top: 4px;
              white-space: nowrap;
            }
            .main-title {
              text-align: center;
              font-weight: bold;
              font-size: 15pt;
              margin: 20px 0 10px 0;
              text-transform: uppercase;
            }
            .recipient-line {
              font-weight: bold;
              margin-bottom: 12px;
              font-size: 13pt;
              text-align: center;
            }
            .issue-section {
              margin-bottom: 15px;
              text-align: justify;
            }
            .content-table {
              width: 100%;
              border-collapse: collapse;
              margin-top: 5px;
              margin-bottom: 20px;
            }
            .content-table th, .content-table td {
              border: 1px solid #000000;
              padding: 10px 12px;
              vertical-align: top;
            }
            .content-table th {
              text-align: center;
              font-weight: bold;
              background-color: #f5f5f5;
              font-size: 12pt;
            }
            .signature-box {
              text-align: center;
              margin-top: 10px;
            }
            .signature-title {
              font-weight: bold;
              font-size: 12pt;
            }
            .signature-subtitle {
              font-style: italic;
              font-size: 11pt;
              margin-bottom: 50px;
            }
            .signature-name {
              font-weight: bold;
              font-size: 12pt;
              text-transform: uppercase;
            }
          </style>
        </head>
        <body>
          <div class="Section1">
            ${bodyHtml}
          </div>
        </body>
        </html>
      `;

      const blob = new Blob(['\ufeff', htmlContent], { type: 'application/msword;charset=utf-8' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      const cleanSoCV = (task.so_cong_van || `Task_${task.id}`).replace(/[\/\\]/g, '_');
      a.download = `Phieu_trinh_${cleanSoCV}.doc`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
      if (addToast) addToast('success', 'Xuất Word', 'Đã tải xuống tệp Phiếu trình (.doc)');
    } catch (err) {
      console.error('Lỗi xuất Word:', err);
      if (addToast) addToast('danger', 'Lỗi xuất Word', 'Không thể tạo file Word: ' + err.message);
    }
  };

  return (
    <div className="modal-backdrop overflow-y-auto py-6">
      <div className="modal-content max-w-5xl bg-slate-900/90 p-0 overflow-hidden shadow-2xl my-auto rounded-2xl border border-slate-700">
        {/* Top Action Bar */}
        <div className="bg-slate-900 text-white p-4 flex items-center justify-between no-print border-b border-slate-800">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl bg-blue-600/20 border border-blue-500/30 text-blue-400 flex items-center justify-center shrink-0">
              <Icon name="file-text" className="w-5 h-5" />
            </div>
            <div>
              <h3 className="font-bold text-sm text-white flex items-center gap-2">
                Soạn thảo & In Phiếu trình giải quyết công việc
                <span className="text-[10px] font-semibold uppercase px-2 py-0.5 rounded-full bg-emerald-500/20 text-emerald-300 border border-emerald-500/30">Chuẩn A4</span>
              </h3>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={handlePrint}
              className="px-3.5 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-xl text-xs font-bold inline-flex items-center gap-2 transition-all shadow-md active:scale-95 cursor-pointer"
            >
              <Icon name="printer" className="w-4 h-4" /> In phiếu
            </button>
            <button
              type="button"
              onClick={handleExportWord}
              className="px-3.5 py-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-xs font-bold inline-flex items-center gap-2 transition-all shadow-md active:scale-95 cursor-pointer"
            >
              <Icon name="download" className="w-4 h-4" /> Xuất Word (.doc)
            </button>
            <button type="button" onClick={onClose} className="p-2 rounded-xl text-slate-400 hover:bg-slate-800 hover:text-white transition-colors cursor-pointer">
              <Icon name="x" className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Editable A4 Sheet Container */}
        <div className="p-4 md:p-8 overflow-y-auto max-h-[82vh] bg-slate-900/60 flex justify-center">
          <div className="a4-page shadow-2xl" ref={a4PageRef}>
            {/* Phần Quốc hiệu & Tên cơ quan */}
            <table className="header-table">
              <tbody>
                <tr>
                  <td>
                    <div className="unit-name" contentEditable={true} suppressContentEditableWarning={true}>
                      UBND XÃ ĐỊNH MỸ
                    </div>
                    <div style={{ fontWeight: 'bold', textDecoration: 'underline' }} contentEditable={true} suppressContentEditableWarning={true}>
                      PHÒNG {phongBanName}
                    </div>
                  </td>
                  <td>
                    <div className="nation-title">CỘNG HÒA XÃ HỘI CHỦ NGHĨA VIỆT NAM</div>
                    <div style={{ fontWeight: 'bold', fontSize: '12pt', textDecoration: 'underline' }} contentEditable={true} suppressContentEditableWarning={true}>
                      Độc lập - Tự do - Hạnh phúc
                    </div>
                    <div className="date-text" contentEditable={true} suppressContentEditableWarning={true}>
                      {todayDateStr}
                    </div>
                  </td>
                </tr>
              </tbody>
            </table>

            {/* Tiêu đề phiếu trình */}
            <div className="main-title">PHIẾU TRÌNH GIẢI QUYẾT CÔNG VIỆC</div>

            <div className="recipient-line">
              Kính gửi: <span contentEditable={true} suppressContentEditableWarning={true} style={{ fontWeight: 'normal' }}>{defaultKinhGui}</span>
            </div>

            {/* Vấn đề trình */}
            <div className="issue-section">
              <b>* Vấn đề trình:</b> <span contentEditable={true} suppressContentEditableWarning={true}>{defaultVanDeTrinh}</span>
            </div>

            {/* Bảng nội dung và ý kiến bung rộng */}
            <table className="content-table">
              <thead>
                <tr>
                  <th style={{ width: '58%' }}>NỘI DUNG</th>
                  <th style={{ width: '42%' }}>Ý KIẾN CỦA VĂN PHÒNG HĐND VÀ UBND</th>
                </tr>
              </thead>
              <tbody>
                <tr>
                  <td style={{ textAlign: 'justify' }}>
                    <div style={{ marginBottom: '10px', textAlign: 'justify' }} contentEditable={true} suppressContentEditableWarning={true}>
                      <b>- Căn cứ:</b> {defaultCanCu}
                    </div>
                    <div style={{ marginBottom: '10px', textAlign: 'justify' }} contentEditable={true} suppressContentEditableWarning={true}>
                      <b>- Thể loại văn bản:</b> {defaultTheLoai}
                    </div>
                    <div style={{ marginBottom: '10px', textAlign: 'justify' }} contentEditable={true} suppressContentEditableWarning={true}>
                      <b>- Nội dung văn bản:</b> {defaultNoiDungVB}
                    </div>
                    <div style={{ textAlign: 'justify' }} contentEditable={true} suppressContentEditableWarning={true}>
                      <b>- Nơi nhận:</b> {defaultNoiNhan}
                    </div>
                  </td>
                  <td>
                    {/* Ý kiến văn phòng (các dòng dấu chấm phía trên) */}
                    <div style={{ marginBottom: '25px', lineHeight: '1.8' }} contentEditable={true} suppressContentEditableWarning={true}>
                      ..................................................<br />
                      ..................................................<br />
                      ..................................................<br />
                      ..................................................
                    </div>
                    
                    {/* Ngày tháng năm & Ý kiến lãnh đạo UBND xã */}
                    <div style={{ textAlign: 'center', fontStyle: 'italic', marginBottom: '15px', whiteSpace: 'nowrap' }} contentEditable={true} suppressContentEditableWarning={true}>
                      Định Mỹ, ngày ... tháng ... năm 2026
                    </div>
                    <div style={{ textAlign: 'center', fontWeight: 'bold', marginBottom: '40px' }} contentEditable={true} suppressContentEditableWarning={true}>
                      Ý KIẾN CỦA LÃNH ĐẠO UBND XÃ
                    </div>
                    <div style={{ textAlign: 'center' }} contentEditable={true} suppressContentEditableWarning={true}>
                      ..................................................
                    </div>
                  </td>
                </tr>
                <tr>
                  <td colSpan="2" style={{ backgroundColor: '#fbfbfb' }}>
                    <div style={{ fontWeight: 'bold', textAlign: 'center', marginBottom: '8px' }} contentEditable={true} suppressContentEditableWarning={true}>
                      ĐỀ XUẤT CỦA CƠ QUAN TRÌNH (NGƯỜI TRÌNH)
                    </div>
                    <div style={{ textAlign: 'center', marginBottom: '15px' }} contentEditable={true} suppressContentEditableWarning={true}>
                      Kính trình lãnh đạo UBND xã ký phát hành Công văn trên.
                    </div>
                    <div className="signature-box">
                      <div className="signature-title" contentEditable={true} suppressContentEditableWarning={true}>Lãnh đạo phòng, đơn vị/người trình</div>
                      <div className="signature-subtitle" contentEditable={true} suppressContentEditableWarning={true}>(Ký tên, ghi rõ họ tên)</div>
                      <div style={{ height: '40px' }}></div>
                      <div className="signature-name" contentEditable={true} suppressContentEditableWarning={true}>{defaultNguoiTrinh}</div>
                    </div>
                  </td>
                </tr>
              </tbody>
            </table>
          </div>
        </div>

        {/* Footer controls */}
        <div className="bg-slate-900 p-4 border-t border-slate-800 flex items-center justify-between no-print">
          <span className="text-xs text-slate-400 font-sans flex items-center gap-2">
            <span>Mã công việc: <strong className="text-slate-200">#{task.id}</strong></span>
            <span>•</span>
            <span>Số CV: <strong className="text-blue-400">{task.so_cong_van || '--'}</strong></span>
          </span>
          <div className="flex items-center gap-2">
            <button type="button" onClick={onClose} className="px-3.5 py-1.5 rounded-xl border border-slate-700 text-slate-300 hover:bg-slate-800 text-xs font-semibold transition-colors cursor-pointer">
              Hủy / Đóng
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

// ----------------------------------------------------------------------
// 10. EMPLOYEES VIEW COMPONENT
// ----------------------------------------------------------------------
function EmployeesView({ employees, setEmployees, categories, onRefresh, addToast }) {
  const empList = employees || [];
  const [showAddEmpModal, setShowAddEmpModal] = useState(false);
  const [editingEmp, setEditingEmp] = useState(null);
  const [deletingEmp, setDeletingEmp] = useState(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  useEffect(() => {
    if (window.lucide) {
      window.lucide.createIcons();
    }
  });

  // Filter States
  const [filterName, setFilterName] = useState('');
  const [filterDepartment, setFilterDepartment] = useState('');
  const [filterStatus, setFilterStatus] = useState('');

  // Pagination States
  const [currentPage, setCurrentPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);

  useEffect(() => {
    setCurrentPage(1);
  }, [filterName, filterDepartment, filterStatus, empList]);

  const departmentList = useMemo(() => {
    if (categories?.departments && Array.isArray(categories.departments) && categories.departments.length > 0) {
      return categories.departments;
    }
    return window.INITIAL_CATEGORIES?.departments || ['Phòng Kinh tế', 'Phòng VH - XH', 'Văn phòng UBND'];
  }, [categories]);

  const statusList = useMemo(() => {
    return ['Đang làm việc', 'Tạm nghỉ', 'Nghỉ việc'];
  }, []);

  const filteredEmpList = useMemo(() => {
    return empList.filter(emp => {
      // 1. Filter Name or Code
      if (filterName.trim()) {
        const query = filterName.trim().toLowerCase();
        const matchName = (emp.ho_ten || '').toLowerCase().includes(query);
        const matchCode = (emp.ma_nv || '').toLowerCase().includes(query);
        if (!matchName && !matchCode) return false;
      }

      // 2. Filter Department
      if (filterDepartment) {
        if ((emp.phong_ban || '').toLowerCase() !== filterDepartment.toLowerCase()) {
          return false;
        }
      }

      // 3. Filter Status
      if (filterStatus) {
        const rawEmpSt = emp.trang_thai || emp.ghi_chu || '';
        const empSt = (rawEmpSt === 'Kích hoạt' ? 'Đang làm việc' : rawEmpSt).toLowerCase();
        const targetSt = filterStatus.toLowerCase();
        if (!empSt.includes(targetSt)) {
          return false;
        }
      }

      return true;
    });
  }, [empList, filterName, filterDepartment, filterStatus]);

  const totalPages = Math.max(1, Math.ceil(filteredEmpList.length / pageSize));
  const paginatedEmpList = useMemo(() => {
    const start = (currentPage - 1) * pageSize;
    return filteredEmpList.slice(start, start + pageSize);
  }, [filteredEmpList, currentPage, pageSize]);

  const handleResetFilters = () => {
    setFilterName('');
    setFilterDepartment('');
    setFilterStatus('');
    setCurrentPage(1);
  };

  const [addFormData, setAddFormData] = useState({
    ho_ten: '',
    phong_ban: 'Phòng Kinh tế',
    chuc_vu: 'Chuyên viên',
    trang_thai: 'Đang làm việc'
  });

  const [editFormData, setEditFormData] = useState({
    ma_nv: '',
    ho_ten: '',
    phong_ban: '',
    chuc_vu: '',
    sdt: '',
    email: '',
    ghi_chu: 'Đang làm việc'
  });

  useEffect(() => {
    if (editingEmp) {
      const currentSt = editingEmp.ghi_chu || editingEmp.trang_thai || 'Đang làm việc';
      setEditFormData({
        ma_nv: editingEmp.ma_nv || '',
        ho_ten: editingEmp.ho_ten || '',
        phong_ban: editingEmp.phong_ban || 'Phòng Kinh tế',
        chuc_vu: editingEmp.chuc_vu || 'Chuyên viên',
        sdt: editingEmp.sdt || '',
        email: editingEmp.email || '',
        ghi_chu: currentSt === 'Kích hoạt' ? 'Đang làm việc' : currentSt
      });
    }
  }, [editingEmp]);

  const handleAddSubmit = async (e) => {
    e.preventDefault();
    if (!addFormData.ho_ten.trim()) {
      alert('Vui lòng nhập Họ và tên công chức!');
      return;
    }

    const maxNum = (empList || []).reduce((max, emp) => {
      const match = (emp.ma_nv || '').match(/\d+/);
      const num = match ? parseInt(match[0], 10) : 0;
      return num > max ? num : max;
    }, 0);
    const tempMaNV = `NV${String(maxNum + 1).padStart(3, '0')}`;
    const newEmp = {
      ma_nv: tempMaNV,
      ho_ten: addFormData.ho_ten.trim(),
      phong_ban: addFormData.phong_ban || 'Phòng Kinh tế',
      chuc_vu: addFormData.chuc_vu || 'Chuyên viên',
      trang_thai: addFormData.trang_thai || 'Đang làm việc',
      ghi_chu: addFormData.trang_thai || 'Đang làm việc'
    };

    // 1. INSTANT OPTIMISTIC UI UPDATE (0ms Latency)
    if (setEmployees) {
      setEmployees(prev => [...(prev || []), newEmp]);
    }
    setShowAddEmpModal(false);
    setAddFormData({
      ho_ten: '',
      phong_ban: 'Phòng Kinh tế',
      chuc_vu: 'Chuyên viên',
      trang_thai: 'Đang làm việc'
    });
    if (addToast) addToast('success', 'Thành công', `Đã thêm công chức "${newEmp.ho_ten}" (${tempMaNV})`);

    // 2. Background Async Server Call
    try {
      const res = await fetch('/api/add', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json; charset=utf-8' },
        body: JSON.stringify({ type: 'employees', data: newEmp })
      });
      if (!res.ok) {
        const errData = await res.json().catch(() => ({}));
        if (addToast) addToast('danger', 'Lỗi ghi dữ liệu Google Sheets', errData.error || 'Không thể lưu công chức vào Google Sheets!');
      }
      if (onRefresh) {
        await onRefresh(true);
      }
    } catch (err) {
      console.error('Error adding employee:', err);
      if (addToast) addToast('danger', 'Lỗi kết nối Cloud', 'Không thể kết nối đến máy chủ Google Sheets!');
    }
  };

  const handleEditSubmit = async (e) => {
    e.preventDefault();
    if (!editFormData.ho_ten.trim()) {
      alert('Vui lòng nhập Họ và tên công chức!');
      return;
    }

    const updatedEmp = {
      ma_nv: editFormData.ma_nv,
      ho_ten: editFormData.ho_ten.trim(),
      phong_ban: editFormData.phong_ban,
      chuc_vu: editFormData.chuc_vu,
      trang_thai: editFormData.ghi_chu || 'Đang làm việc',
      ghi_chu: editFormData.ghi_chu || 'Đang làm việc'
    };

    // 1. INSTANT OPTIMISTIC UI UPDATE (0ms Latency)
    if (setEmployees) {
      setEmployees(prev => (prev || []).map(emp => emp.ma_nv === updatedEmp.ma_nv ? { ...emp, ...updatedEmp } : emp));
    }
    setEditingEmp(null);
    if (addToast) addToast('success', 'Thành công', `Đã cập nhật thông tin công chức "${updatedEmp.ho_ten}"`);

    // 2. Background Async Server Call
    try {
      const res = await fetch('/api/update', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json; charset=utf-8' },
        body: JSON.stringify({ type: 'employees', data: updatedEmp })
      });
      if (!res.ok) {
        const errData = await res.json().catch(() => ({}));
        if (addToast) addToast('danger', 'Lỗi ghi dữ liệu Google Sheets', errData.error || 'Không thể cập nhật công chức vào Google Sheets!');
      }
      if (onRefresh) {
        await onRefresh();
      }
    } catch (err) {
      console.error('Error updating employee:', err);
      if (addToast) addToast('danger', 'Lỗi kết nối Cloud', 'Không thể kết nối đến máy chủ Google Sheets!');
      if (onRefresh) {
        await onRefresh();
      }
    }
  };

  const handleDeleteConfirm = async (empToDelete) => {
    // 1. INSTANT OPTIMISTIC UI UPDATE (0ms Latency)
    if (setEmployees) {
      setEmployees(prev => (prev || []).filter(emp => emp.ma_nv !== empToDelete.ma_nv));
    }
    setDeletingEmp(null);
    if (addToast) addToast('success', 'Đã xóa', `Đã xóa công chức "${empToDelete.ho_ten}" khỏi hệ thống`);

    // 2. Background Async Server Call
    try {
      const res = await fetch('/api/delete', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json; charset=utf-8' },
        body: JSON.stringify({ type: 'employees', id: empToDelete.ma_nv, data: { ma_nv: empToDelete.ma_nv } })
      });
      if (!res.ok) {
        const errData = await res.json().catch(() => ({}));
        if (addToast) addToast('danger', 'Lỗi ghi dữ liệu Google Sheets', errData.error || 'Không thể xóa công chức khỏi Google Sheets!');
      }
      if (onRefresh) {
        await onRefresh();
      }
    } catch (err) {
      console.error('Error deleting employee:', err);
      if (addToast) addToast('danger', 'Lỗi kết nối Cloud', 'Không thể kết nối đến máy chủ Google Sheets!');
      if (onRefresh) {
        await onRefresh();
      }
    }
  };

  const getStatusBadge = (statusStr) => {
    let rawStatus = (statusStr || '').trim();
    if (!rawStatus || rawStatus === 'Kích hoạt' || rawStatus.includes('Ã') || rawStatus.includes('º') || rawStatus.includes('Â') || rawStatus.includes('?')) {
      rawStatus = 'Đang làm việc';
    }

    const lower = rawStatus.toLowerCase();
    if (lower.includes('tạm nghỉ') || lower.includes('tam nghi')) {
      return (
        <span className="inline-flex items-center gap-1.5 text-[11px] font-bold text-amber-700 bg-amber-50 px-2.5 py-0.5 rounded-full border border-amber-200">
          <span className="w-1.5 h-1.5 rounded-full bg-amber-500"></span>
          Tạm nghỉ
        </span>
      );
    }
    if (lower.includes('nghỉ việc') || lower.includes('nghi viec') || lower.includes('đã chuyển') || lower.includes('thôi việc')) {
      return (
        <span className="inline-flex items-center gap-1.5 text-[11px] font-bold text-rose-700 bg-rose-50 px-2.5 py-0.5 rounded-full border border-rose-200">
          <span className="w-1.5 h-1.5 rounded-full bg-rose-500"></span>
          Nghỉ việc
        </span>
      );
    }

    return (
      <span className="inline-flex items-center gap-1.5 text-[11px] font-bold text-blue-700 bg-blue-50 px-2.5 py-0.5 rounded-full border border-blue-200">
        <span className="w-1.5 h-1.5 rounded-full bg-blue-500"></span>
        Đang làm việc
      </span>
    );
  };

  return (
    <div className="space-y-4">
      {/* Header Title (Minimalist & Clean, outer card container removed) */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-2 px-1">
        <div>
          <h2 className="text-lg font-bold text-slate-900 leading-tight">Quản lý Công chức / Nhân sự</h2>
          <p className="text-xs text-slate-500">Dữ liệu đồng bộ trực tiếp từ Google Sheets Cloud</p>
        </div>
        <span className="text-xs font-semibold text-blue-600 bg-blue-50 px-2.5 py-1 rounded-lg border border-blue-200/60">
          Hiển thị {filteredEmpList.length} / {empList.length} công chức
        </span>
      </div>

      {/* Filter Bar with "Thêm mới công chức" Button */}
      <div className="bg-white rounded-xl border border-slate-200 p-4 shadow-xs space-y-3">
        <div className="text-xs font-bold text-slate-800 uppercase tracking-wider flex items-center justify-between border-b border-slate-100 pb-2.5">
          <div className="flex items-center gap-1.5">
            <i data-lucide="filter" className="w-3.5 h-3.5 text-blue-600"></i>
            <span>Bộ lọc tìm kiếm công chức</span>
          </div>
          <button
            onClick={() => setShowAddEmpModal(true)}
            className="btn-primary text-xs h-[32px] px-3 font-semibold shadow-xs inline-flex items-center gap-1.5"
            title="Thêm công chức mới"
          >
            <i data-lucide="user-plus" className="w-3.5 h-3.5"></i>
            <span>Thêm mới công chức</span>
          </button>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-4 gap-3 text-xs">
          {/* 1. Name Filter */}
          <div>
            <label className="block font-semibold text-slate-700 mb-1">Tìm theo tên / Mã NV</label>
            <div className="relative">
              <input
                type="text"
                placeholder="Ví dụ: Nguyễn Văn A..."
                value={filterName}
                onChange={e => setFilterName(e.target.value)}
                className="form-input pl-8"
              />
              <i data-lucide="search" className="w-3.5 h-3.5 text-slate-400 absolute left-2.5 top-2.5"></i>
            </div>
          </div>

          {/* 2. Department Filter */}
          <div>
            <label className="block font-semibold text-slate-700 mb-1">Lọc theo Phòng ban</label>
            <select
              value={filterDepartment}
              onChange={e => setFilterDepartment(e.target.value)}
              className="form-select"
            >
              <option value="">-- Tất cả phòng ban --</option>
              {departmentList.map(dept => (
                <option key={dept} value={dept}>{dept}</option>
              ))}
            </select>
          </div>

          {/* 3. Status Filter */}
          <div>
            <label className="block font-semibold text-slate-700 mb-1">Lọc theo Trạng thái</label>
            <select
              value={filterStatus}
              onChange={e => setFilterStatus(e.target.value)}
              className="form-select"
            >
              <option value="">-- Tất cả trạng thái --</option>
              {statusList.map(st => (
                <option key={st} value={st}>{st}</option>
              ))}
            </select>
          </div>

          {/* 4. Action Buttons */}
          <div className="flex items-end gap-2">
            <button
              type="button"
              className="btn-primary text-xs h-[36px] flex-1 font-semibold inline-flex items-center justify-center gap-1.5"
            >
              <i data-lucide="search" className="w-3.5 h-3.5"></i>
              <span>Tìm kiếm</span>
            </button>
            <button
              type="button"
              onClick={handleResetFilters}
              className="btn-secondary text-xs h-[36px] px-3 font-semibold inline-flex items-center justify-center gap-1.5"
              title="Đặt lại bộ lọc"
            >
              <i data-lucide="rotate-ccw" className="w-3.5 h-3.5"></i>
              <span>Đặt lại</span>
            </button>
          </div>
        </div>
      </div>

      {/* GridView Data Table */}
      <div className="bg-white rounded-xl border border-slate-200 shadow-xs overflow-hidden">
        <table className="custom-table">
          <thead>
            <tr>
              <th className="w-14 text-center">STT</th>
              <th className="w-28">Mã NV</th>
              <th>Họ và tên</th>
              <th>Phòng ban</th>
              <th>Chức vụ</th>
              <th className="w-36 text-center">Trạng thái</th>
              <th className="w-28 text-center">Thao tác</th>
            </tr>
          </thead>
          <tbody>
            {paginatedEmpList.map((emp, idx) => (
              <tr key={emp.ma_nv + idx} className="hover:bg-slate-50/80 transition-colors">
                <td className="text-center font-mono font-semibold text-slate-500">{(currentPage - 1) * pageSize + idx + 1}</td>
                <td className="font-mono font-semibold text-blue-600">{emp.ma_nv}</td>
                <td className="font-bold text-slate-900">{emp.ho_ten}</td>
                <td className="font-medium text-slate-700">{emp.phong_ban || 'Phòng Kinh tế'}</td>
                <td className="font-medium text-slate-700">{emp.chuc_vu || 'Chuyên viên'}</td>
                <td className="text-center">
                  {getStatusBadge(emp.trang_thai || emp.ghi_chu)}
                </td>
                <td className="text-center">
                  <div className="flex items-center justify-center gap-1.5">
                    <button
                      type="button"
                      onClick={() => setEditingEmp(emp)}
                      className="p-1.5 rounded-lg text-blue-600 hover:text-blue-700 hover:bg-blue-50 bg-blue-50/60 border border-blue-200/60 transition-colors inline-flex items-center justify-center opacity-100 cursor-pointer shadow-2xs"
                      title="Chỉnh sửa thông tin công chức"
                    >
                      <svg className="w-4 h-4 text-blue-600" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                        <path d="M12 20h9"></path>
                        <path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4L16.5 3.5z"></path>
                      </svg>
                    </button>
                    <button
                      type="button"
                      onClick={() => setDeletingEmp(emp)}
                      className="p-1.5 rounded-lg text-rose-600 hover:text-rose-700 hover:bg-rose-50 bg-rose-50/60 border border-rose-200/60 transition-colors inline-flex items-center justify-center opacity-100 cursor-pointer shadow-2xs"
                      title="Xóa công chức"
                    >
                      <svg className="w-4 h-4 text-rose-600" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                        <polyline points="3 6 5 6 21 6"></polyline>
                        <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path>
                        <line x1="10" y1="11" x2="10" y2="17"></line>
                        <line x1="14" y1="11" x2="14" y2="17"></line>
                      </svg>
                    </button>
                  </div>
                </td>
              </tr>
            ))}
            {empList.length === 0 && (
              <tr>
                <td colSpan={6} className="text-center py-8 text-slate-400 text-xs">
                  Chưa có dữ liệu công chức nào trong sheet Employees.
                </td>
              </tr>
            )}
          </tbody>
        </table>

        {/* Pagination Footer */}
        <div className="p-4 border-t border-slate-100 flex items-center justify-between text-xs text-slate-500">
          <div className="flex items-center gap-2">
            <span>Hiển thị</span>
            <select value={pageSize} onChange={e => { setPageSize(Number(e.target.value)); setCurrentPage(1); }} className="form-select h-8 text-xs py-0">
              <option value={10}>10 dòng</option>
              <option value={25}>25 dòng</option>
              <option value={50}>50 dòng</option>
            </select>
            <span>/ Tổng {filteredEmpList.length} dòng</span>
          </div>

          <div className="flex items-center gap-1">
            <button disabled={currentPage === 1} onClick={() => setCurrentPage(p => p - 1)} className="p-1.5 rounded-lg border border-slate-200 hover:bg-slate-50 disabled:opacity-40">
              <i data-lucide="chevron-left" className="w-4 h-4"></i>
            </button>
            <span className="px-3 py-1 font-semibold text-slate-700">Trang {currentPage} / {totalPages}</span>
            <button disabled={currentPage >= totalPages} onClick={() => setCurrentPage(p => p + 1)} className="p-1.5 rounded-lg border border-slate-200 hover:bg-slate-50 disabled:opacity-40">
              <i data-lucide="chevron-right" className="w-4 h-4"></i>
            </button>
          </div>
        </div>
      </div>

      {/* Add Employee Modal */}
      {showAddEmpModal && (
        <div className="modal-backdrop">
          <div className="modal-content max-w-md">
            <div className="modal-header">
              <h3 className="font-bold text-slate-900 text-sm">Thêm mới Công chức</h3>
              <button onClick={() => setShowAddEmpModal(false)} disabled={isSubmitting} className="p-1 rounded text-slate-400 hover:bg-slate-100">
                <i data-lucide="x" className="w-4 h-4"></i>
              </button>
            </div>
            <form onSubmit={handleAddSubmit}>
              <div className="modal-body space-y-3 text-xs">
                <div>
                  <label className="block font-semibold text-slate-700 mb-1">Họ và tên *</label>
                  <input
                    type="text"
                    placeholder="Ví dụ: Nguyễn Văn A"
                    value={addFormData.ho_ten}
                    onChange={e => setAddFormData({ ...addFormData, ho_ten: e.target.value })}
                    className="form-input"
                    required
                  />
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block font-semibold text-slate-700 mb-1">Phòng ban công tác</label>
                    <select
                      value={addFormData.phong_ban}
                      onChange={e => setAddFormData({ ...addFormData, phong_ban: e.target.value })}
                      className="form-select"
                    >
                      {departmentList.map(dept => (
                        <option key={dept} value={dept}>{dept}</option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label className="block font-semibold text-slate-700 mb-1">Chức vụ</label>
                    <input
                      type="text"
                      placeholder="Ví dụ: Chuyên viên"
                      value={addFormData.chuc_vu}
                      onChange={e => setAddFormData({ ...addFormData, chuc_vu: e.target.value })}
                      className="form-input"
                    />
                  </div>
                </div>

                <div>
                  <label className="block font-semibold text-slate-700 mb-1">Trạng thái</label>
                  <select
                    value={addFormData.trang_thai}
                    onChange={e => setAddFormData({ ...addFormData, trang_thai: e.target.value })}
                    className="form-select"
                  >
                    {statusList.map(st => (
                      <option key={st} value={st}>{st}</option>
                    ))}
                  </select>
                </div>
              </div>
              <div className="modal-footer">
                <button type="button" onClick={() => setShowAddEmpModal(false)} disabled={isSubmitting} className="btn-secondary text-xs">Hủy</button>
                <button type="submit" disabled={isSubmitting} className="btn-primary text-xs inline-flex items-center gap-1.5 min-w-[110px] justify-center">
                  {isSubmitting ? (
                    <>
                      <Spinner className="w-3.5 h-3.5 text-white" />
                      <span>Đang lưu...</span>
                    </>
                  ) : (
                    <span>Lưu công chức</span>
                  )}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Edit Employee Modal */}
      {editingEmp && (
        <div className="modal-backdrop">
          <div className="modal-content max-w-md">
            <div className="modal-header">
              <h3 className="font-bold text-slate-900 text-sm">Chỉnh sửa Thông tin Công chức ({editingEmp.ma_nv})</h3>
              <button onClick={() => setEditingEmp(null)} disabled={isSubmitting} className="p-1 rounded text-slate-400 hover:bg-slate-100">
                <i data-lucide="x" className="w-4 h-4"></i>
              </button>
            </div>
            <form onSubmit={handleEditSubmit}>
              <div className="modal-body space-y-3 text-xs">
                <div>
                  <label className="block font-semibold text-slate-700 mb-1">Họ và tên *</label>
                  <input
                    type="text"
                    value={editFormData.ho_ten}
                    onChange={e => setEditFormData({ ...editFormData, ho_ten: e.target.value })}
                    className="form-input"
                    required
                  />
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block font-semibold text-slate-700 mb-1">Phòng ban công tác</label>
                    <select
                      value={editFormData.phong_ban}
                      onChange={e => setEditFormData({ ...editFormData, phong_ban: e.target.value })}
                      className="form-select"
                    >
                      {departmentList.map(dept => (
                        <option key={dept} value={dept}>{dept}</option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label className="block font-semibold text-slate-700 mb-1">Chức vụ</label>
                    <input
                      type="text"
                      value={editFormData.chuc_vu}
                      onChange={e => setEditFormData({ ...editFormData, chuc_vu: e.target.value })}
                      className="form-input"
                    />
                  </div>
                </div>

                <div>
                  <label className="block font-semibold text-slate-700 mb-1">Trạng thái</label>
                  <select
                    value={editFormData.ghi_chu || 'Đang làm việc'}
                    onChange={e => setEditFormData({ ...editFormData, ghi_chu: e.target.value })}
                    className="form-select"
                  >
                    {statusList.map(st => (
                      <option key={st} value={st}>{st}</option>
                    ))}
                  </select>
                </div>
              </div>
              <div className="modal-footer">
                <button type="button" onClick={() => setEditingEmp(null)} disabled={isSubmitting} className="btn-secondary text-xs">Hủy</button>
                <button type="submit" disabled={isSubmitting} className="btn-primary text-xs inline-flex items-center gap-1.5 min-w-[120px] justify-center">
                  {isSubmitting ? (
                    <>
                      <Spinner className="w-3.5 h-3.5 text-white" />
                      <span>Đang lưu...</span>
                    </>
                  ) : (
                    <span>Lưu thay đổi</span>
                  )}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Confirm Delete Employee Modal */}
      {deletingEmp && (
        <ConfirmModal
          title="Xác nhận xóa Công chức"
          message={`Bạn có chắc chắn muốn xóa công chức "${deletingEmp.ho_ten}" (Mã NV: ${deletingEmp.ma_nv})? Thao tác này sẽ xóa hàng dữ liệu khỏi sheet Employees trong file Excel.`}
          onClose={() => setDeletingEmp(null)}
          onConfirm={() => handleDeleteConfirm(deletingEmp)}
        />
      )}
    </div>
  );
}

// ----------------------------------------------------------------------
// 11. KPI VIEW COMPONENT
// ----------------------------------------------------------------------
function KPIView({ tasks = [], employees = [], categories = {}, user, addToast }) {
  const isAdmin = user?.role === 'ADMIN' || user?.department === 'ALL';
  const userDept = user?.department || '';
  const isDeptRestricted = !isAdmin && userDept && userDept !== 'ALL';

  const [selectedDept, setSelectedDept] = useState(() => isDeptRestricted ? userDept : '');
  const [selectedEmpName, setSelectedEmpName] = useState('');
  const [selectedMonth, setSelectedMonth] = useState('');
  const [selectedYear, setSelectedYear] = useState('');
  const [detailModalInfo, setDetailModalInfo] = useState(null);

  useEffect(() => {
    if (isDeptRestricted) {
      setSelectedDept(userDept);
    }
  }, [isDeptRestricted, userDept]);

  useEffect(() => {
    if (window.lucide) {
      window.lucide.createIcons();
    }
  }, [selectedDept, selectedEmpName, selectedMonth, selectedYear]);

  // Department List
  const departmentList = useMemo(() => {
    if (categories?.departments && Array.isArray(categories.departments) && categories.departments.length > 0) {
      return categories.departments;
    }
    return window.INITIAL_CATEGORIES?.departments || ['Kinh tế', 'VH - XH'];
  }, [categories]);

  // Year Options for Year Filter Dropdown (5 years)
  const yearOptions = useMemo(() => {
    const years = new Set();
    const currentYear = new Date().getFullYear();
    for (let y = currentYear - 3; y <= currentYear + 1; y++) {
      years.add(y);
    }
    tasks.forEach(t => {
      const d = parseMonthYear(t.ngay_tao || t.deadline || t.ngay_hoan_thanh, t.thang, t.nam);
      if (d.year) years.add(d.year);
    });
    return Array.from(years).sort((a, b) => b - a);
  }, [tasks]);

  // Dependent Employees for Employee Filter Dropdown
  const filteredEmployeesForDropdown = useMemo(() => {
    const targetDept = isDeptRestricted ? userDept : selectedDept;
    if (!targetDept || targetDept === '') return employees;
    return employees.filter(emp => (emp.phong_ban || '').trim().toLowerCase() === targetDept.trim().toLowerCase());
  }, [employees, selectedDept, isDeptRestricted, userDept]);

  // Filter Employees based on active dropdown filters & department restriction
  const filteredEmployees = useMemo(() => {
    const targetDept = isDeptRestricted ? userDept : selectedDept;
    return employees.filter(emp => {
      if (targetDept && targetDept !== '' && (emp.phong_ban || '').trim().toLowerCase() !== targetDept.trim().toLowerCase()) {
        return false;
      }
      if (selectedEmpName && selectedEmpName !== '' && emp.ho_ten !== selectedEmpName) {
        return false;
      }
      return true;
    });
  }, [employees, selectedDept, selectedEmpName, isDeptRestricted, userDept]);

  // Calculate KPI metrics per employee with Month & Year filters
  const kpiData = useMemo(() => {
    const filterMonthNum = selectedMonth ? parseInt(String(selectedMonth), 10) : null;
    const filterYearNum = selectedYear ? parseInt(String(selectedYear), 10) : null;

    return filteredEmployees.map(emp => {
      let empTasks = tasks.filter(t => (t.nguoi_phu_trach || '').trim() === (emp.ho_ten || '').trim());

      // Filter by Month
      if (filterMonthNum && !isNaN(filterMonthNum) && filterMonthNum > 0) {
        empTasks = empTasks.filter(t => {
          const dateInfo = parseMonthYear(t.ngay_tao || t.deadline || t.ngay_hoan_thanh, t.thang, t.nam);
          return dateInfo.month === filterMonthNum;
        });
      }

      // Filter by Year
      if (filterYearNum && !isNaN(filterYearNum) && filterYearNum > 0) {
        empTasks = empTasks.filter(t => {
          const dateInfo = parseMonthYear(t.ngay_tao || t.deadline || t.ngay_hoan_thanh, t.thang, t.nam);
          return dateInfo.year === filterYearNum;
        });
      }

      const total = empTasks.length;
      const completedTasks = empTasks.filter(t => t.trang_thai === 'Hoàn thành');
      const completed = completedTasks.length;
      const overdueTasks = empTasks.filter(t => isTaskOverdue(t));
      const overdue = overdueTasks.length;
      const rate = total > 0 ? (completed / total) : 0;
      const score = Math.max(0, Math.round(rate * 100 - overdue * 5));

      return {
        ...emp,
        empTasks,
        completedTasks,
        overdueTasks,
        total,
        completed,
        overdue,
        rate: Math.round(rate * 100),
        score
      };
    }).sort((a, b) => b.score - a.score);
  }, [filteredEmployees, tasks, selectedMonth, selectedYear]);

  const handleOpenDetailModal = (emp, type) => {
    let tasksList = [];
    let label = '';
    if (type === 'completed') {
      tasksList = emp.completedTasks;
      label = 'Danh sách Công việc đã Hoàn thành';
    } else if (type === 'overdue') {
      tasksList = emp.overdueTasks;
      label = 'Danh sách Công việc Quá hạn';
    } else {
      tasksList = emp.empTasks;
      label = 'Danh sách Tất cả Công việc';
    }

    setDetailModalInfo({
      emp,
      type,
      label,
      tasksList
    });
  };

  const handleExportModalExcel = (modalData) => {
    if (!modalData || !modalData.tasksList || modalData.tasksList.length === 0) {
      if (addToast) addToast('warning', 'Không có dữ liệu', 'Không có công việc nào để xuất Excel!');
      return;
    }

    try {
      if (window.XLSX) {
        const excelRows = modalData.tasksList.map((task, index) => ({
          'STT': index + 1,
          'Số công văn': task.so_cong_van || '',
          'Nơi ban hành': task.noi_ban_hanh || '',
          'Tên công việc': task.ten_cong_viec || '',
          'Phòng ban': task.phong_ban || '',
          'Người phụ trách': task.nguoi_phu_trach || '',
          'Đơn vị / Người phối hợp': task.don_vi_phoi_hop || '',
          'Ngày tạo': formatDate(task.ngay_tao),
          'Deadline': formatDate(task.deadline),
          'Ngày hoàn thành': formatDate(task.ngay_hoan_thanh),
          'Trạng thái': task.trang_thai || '',
          'Đánh giá': calculateEvaluation(task)
        }));

        const worksheet = window.XLSX.utils.json_to_sheet(excelRows);
        worksheet['!cols'] = [
          { wch: 6 },
          { wch: 22 },
          { wch: 22 },
          { wch: 45 },
          { wch: 18 },
          { wch: 22 },
          { wch: 14 },
          { wch: 14 },
          { wch: 16 },
          { wch: 16 },
          { wch: 16 }
        ];

        const workbook = window.XLSX.utils.book_new();
        window.XLSX.utils.book_append_sheet(workbook, worksheet, 'KPI_Tasks');
        const sanitizedEmpName = (modalData.emp.ho_ten || 'Emp').replace(/\s+/g, '_');
        const filename = `KPI_${sanitizedEmpName}_${modalData.type}.xlsx`;
        window.XLSX.writeFile(workbook, filename);
        if (addToast) addToast('success', 'Xuất Excel thành công', `Đã tải xuống tệp ${filename}!`);
        return;
      }

      // Fallback
      fetch('/api/export-excel', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ tasks: modalData.tasksList })
      })
      .then(res => res.blob())
      .then(blob => {
        const url = window.URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `KPI_${(modalData.emp.ho_ten || 'Emp').replace(/\s+/g, '_')}.xlsx`;
        document.body.appendChild(a);
        a.click();
        window.URL.revokeObjectURL(url);
        a.remove();
        if (addToast) addToast('success', 'Xuất Excel thành công', 'Đã tải xuống file Excel chi tiết!');
      });
    } catch (e) {
      console.error('Export Excel error:', e);
      if (addToast) addToast('danger', 'Lỗi xuất Excel', 'Không thể tạo file Excel. Vui lòng thử lại!');
    }
  };

  return (
    <div className="space-y-4">
      {/* Header Info */}
      <div className="flex justify-end px-1">
        <span className="text-xs font-semibold text-blue-600 bg-blue-50 px-2.5 py-1 rounded-lg border border-blue-200/60">
          Hiển thị {kpiData.length} công chức
        </span>
      </div>

      {/* Filter Bar */}
      <div className="bg-white rounded-xl border border-slate-200 p-4 shadow-xs space-y-3">
        <div className="text-xs font-bold text-slate-800 uppercase tracking-wider flex items-center gap-1.5 border-b border-slate-100 pb-2.5">
          <i data-lucide="filter" className="w-3.5 h-3.5 text-blue-600"></i>
          <span>Bộ lọc tra cứu KPI Công chức</span>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-12 gap-3 text-xs items-end">
          {/* Department Filter */}
          <div className="lg:col-span-3">
            <label className="block font-semibold text-slate-700 mb-1">Lọc theo Phòng ban</label>
            <select
              value={selectedDept}
              disabled={isDeptRestricted}
              onChange={e => {
                if (isDeptRestricted) return;
                setSelectedDept(e.target.value);
                setSelectedEmpName('');
              }}
              className={`form-select w-full ${isDeptRestricted ? 'bg-slate-100 opacity-90 cursor-not-allowed text-slate-700 font-semibold' : ''}`}
            >
              {!isDeptRestricted && <option value="">-- Tất cả phòng ban --</option>}
              {departmentList.map(dept => (
                <option key={dept} value={dept}>{dept}</option>
              ))}
            </select>
          </div>

          {/* Employee Filter (Searchable Dropdown) */}
          <div className="lg:col-span-3">
            <label className="block font-semibold text-slate-700 mb-1">Lọc theo Công chức</label>
            <SearchableSelect
              options={[
                { value: '', label: '-- Tất cả công chức --' },
                ...(filteredEmployeesForDropdown?.map(emp => ({
                  value: emp.ho_ten,
                  label: emp.ho_ten,
                  subtext: emp.chuc_vu ? `${emp.chuc_vu} - ${emp.phong_ban || ''}` : emp.phong_ban
                })) || [])
              ]}
              value={selectedEmpName}
              onChange={val => setSelectedEmpName(val)}
              placeholder="-- Tất cả công chức --"
              required={true}
            />
          </div>

          {/* Month Filter */}
          <div className="lg:col-span-2">
            <label className="block font-semibold text-slate-700 mb-1">Lọc theo Tháng</label>
            <select
              value={selectedMonth}
              onChange={e => setSelectedMonth(e.target.value)}
              className="form-select w-full"
            >
              <option value="">-- Tất cả tháng --</option>
              {Array.from({ length: 12 }, (_, i) => (
                <option key={i + 1} value={String(i + 1)}>Tháng {i + 1}</option>
              ))}
            </select>
          </div>

          {/* Year Filter */}
          <div className="lg:col-span-2">
            <label className="block font-semibold text-slate-700 mb-1">Lọc theo Năm</label>
            <select
              value={selectedYear}
              onChange={e => setSelectedYear(e.target.value)}
              className="form-select w-full"
            >
              <option value="">-- Tất cả năm --</option>
              {yearOptions.map(y => (
                <option key={y} value={String(y)}>Năm {y}</option>
              ))}
            </select>
          </div>

          {/* Action Button */}
          <div className="lg:col-span-2 flex items-end">
            <button
              onClick={() => {
                setSelectedDept(isDeptRestricted ? userDept : '');
                setSelectedEmpName('');
                setSelectedMonth('');
                setSelectedYear('');
              }}
              className="btn-secondary text-xs h-[36px] w-full px-3 font-semibold inline-flex items-center justify-center gap-1.5 whitespace-nowrap"
              title="Đặt lại bộ lọc"
            >
              <i data-lucide="rotate-ccw" className="w-3.5 h-3.5"></i>
              <span>Đặt lại bộ lọc</span>
            </button>
          </div>
        </div>
      </div>

      {/* KPI Ranking Table */}
      <div className="bg-white rounded-xl border border-slate-200 shadow-xs overflow-hidden">
        <table className="custom-table w-full">
          <thead>
            <tr>
              <th className="w-16 text-center">Hạng</th>
              <th className="text-left">Công chức</th>
              <th className="text-left">Phòng ban & Chức vụ</th>
              <th className="w-24 text-center">Tổng CV</th>
              <th className="w-24 text-center">Hoàn thành</th>
              <th className="w-24 text-center">Quá hạn</th>
              <th className="w-24 text-center">Tỷ lệ %</th>
            </tr>
          </thead>
          <tbody>
            {kpiData.length === 0 ? (
              <tr>
                <td colSpan="7" className="text-center py-8 text-slate-400 text-xs font-medium">
                  Không tìm thấy công chức phù hợp với bộ lọc hiện tại.
                </td>
              </tr>
            ) : (
              kpiData.map((emp, idx) => (
                <tr key={emp.ma_nv || idx} className="hover:bg-slate-50/80 transition-colors">
                  <td className="text-center font-bold text-slate-400">#{idx + 1}</td>
                  <td className="text-left">
                    <div className="font-bold text-slate-900">{emp.ho_ten}</div>
                  </td>
                  <td className="text-left text-xs text-slate-500">
                    <div className="font-medium text-slate-700">{emp.phong_ban || '--'}</div>
                    <div className="text-[11px] text-slate-400">{emp.chuc_vu || 'Chuyên viên'}</div>
                  </td>
                  <td className="text-center font-bold">
                    <button
                      onClick={() => handleOpenDetailModal(emp, 'all')}
                      className="px-2.5 py-1 rounded-lg bg-blue-50 text-blue-700 hover:bg-blue-100 hover:scale-105 transition-all font-semibold cursor-pointer shadow-2xs"
                      title="Bấm để xem danh sách tất cả công việc"
                    >
                      {emp.total}
                    </button>
                  </td>
                  <td className="text-center font-bold">
                    <button
                      onClick={() => handleOpenDetailModal(emp, 'completed')}
                      className="px-2.5 py-1 rounded-lg bg-emerald-50 text-emerald-700 hover:bg-emerald-100 hover:scale-105 transition-all font-semibold cursor-pointer shadow-2xs"
                      title="Bấm để xem danh sách công việc đã hoàn thành"
                    >
                      {emp.completed}
                    </button>
                  </td>
                  <td className="text-center font-bold">
                    <button
                      onClick={() => handleOpenDetailModal(emp, 'overdue')}
                      className={`px-2.5 py-1 rounded-lg transition-all font-semibold cursor-pointer shadow-2xs ${
                        emp.overdue > 0
                          ? 'bg-rose-50 text-rose-700 hover:bg-rose-100 hover:scale-105'
                          : 'bg-slate-50 text-slate-500 hover:bg-slate-100'
                      }`}
                      title="Bấm để xem danh sách công việc quá hạn"
                    >
                      {emp.overdue}
                    </button>
                  </td>
                  <td className="text-center font-mono font-semibold text-slate-700">{emp.rate}%</td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {/* Detail Modal */}
      {detailModalInfo && (
        <div className="modal-backdrop z-50">
          <div className="modal-content max-w-3xl max-h-[85vh] flex flex-col p-0 overflow-hidden">
            {/* Modal Header */}
            <div className="p-4 border-b border-slate-200 bg-slate-50/80 flex items-center justify-between">
              <div>
                <h3 className="font-bold text-slate-900 text-base flex items-center gap-2">
                  <i data-lucide="list-checks" className="w-5 h-5 text-blue-600"></i>
                  <span>{detailModalInfo.label} - {detailModalInfo.emp.ho_ten}</span>
                </h3>
                <p className="text-xs text-slate-500 mt-0.5">
                  Phòng ban: {detailModalInfo.emp.phong_ban || 'N/A'} • Hiển thị {detailModalInfo.tasksList.length} công việc
                </p>
              </div>
              <div className="flex items-center gap-2">
                <button
                  onClick={() => handleExportModalExcel(detailModalInfo)}
                  className="btn-success text-xs h-8 px-3 font-semibold inline-flex items-center gap-1.5 shadow-xs hover:bg-emerald-700 transition-colors"
                  title="Tải tệp Excel danh sách công việc này"
                >
                  <i data-lucide="file-spreadsheet" className="w-3.5 h-3.5"></i>
                  <span>Xuất Excel</span>
                </button>
                <button
                  onClick={() => setDetailModalInfo(null)}
                  className="p-1.5 rounded-lg text-slate-400 hover:bg-slate-200 hover:text-slate-700 transition-colors"
                >
                  <i data-lucide="x" className="w-5 h-5"></i>
                </button>
              </div>
            </div>

            {/* Modal Body Table */}
            <div className="p-4 overflow-y-auto max-h-[60vh]">
              {detailModalInfo.tasksList.length === 0 ? (
                <div className="text-center py-8 text-slate-400 text-xs font-medium">
                  Không có công việc nào trong danh mục này.
                </div>
              ) : (
                <table className="custom-table w-full text-xs">
                  <thead>
                    <tr>
                      <th className="w-10 text-center">STT</th>
                      <th className="w-28">Số công văn</th>
                      <th>Tên công việc</th>
                      <th className="w-24 text-center">Deadline</th>
                      <th className="w-28 text-center">Ngày hoàn thành</th>
                      <th className="w-28 text-center">Trạng thái</th>
                    </tr>
                  </thead>
                  <tbody>
                    {detailModalInfo.tasksList.map((t, idx) => (
                      <tr key={t.id || idx} className="hover:bg-slate-50/80 transition-colors">
                        <td className="text-center font-mono text-slate-500">{idx + 1}</td>
                        <td className="font-semibold text-blue-600">{t.so_cong_van || '--'}</td>
                        <td className="font-medium text-slate-800">{t.ten_cong_viec}</td>
                        <td className="text-center text-xs font-medium text-slate-800">{formatDate(t.deadline) !== '--' ? formatDate(t.deadline) : ''}</td>
                        <td className="text-center text-xs font-medium text-slate-800">{formatDate(t.ngay_hoan_thanh) !== '--' ? formatDate(t.ngay_hoan_thanh) : ''}</td>
                        <td className="text-center"><StatusBadge status={t.trang_thai} /></td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>

            {/* Modal Footer */}
            <div className="p-3 border-t border-slate-100 bg-slate-50 flex items-center justify-between">
              <span className="text-xs text-slate-500 font-medium">
                Tổng số: <strong className="text-slate-800">{detailModalInfo.tasksList.length}</strong> công việc
              </span>
              <button
                onClick={() => setDetailModalInfo(null)}
                className="btn-secondary text-xs h-8 px-4 font-semibold"
              >
                Đóng
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ----------------------------------------------------------------------
// 11b. SCHEDULE VIEW COMPONENT (External Link Card Interface)
// ----------------------------------------------------------------------
function ScheduleView() {
  const scheduleUrl = "http://llvdinhmy.somee.com/llv";
  const displayUrl = "llvdinhmy.somee.com/llv";

  return (
    <div className="w-full max-w-4xl mx-auto py-4 md:py-8 px-2">
      {/* Main Preview Card */}
      <div className="bg-white rounded-2xl border border-slate-200/80 shadow-md overflow-hidden transition-all duration-300">
        
        {/* Banner / Header with Gradient */}
        <div className="relative bg-gradient-to-br from-blue-600 via-blue-700 to-indigo-800 text-white p-6 md:p-10 overflow-hidden">
          {/* Subtle Decorative Accents */}
          <div className="absolute -right-10 -bottom-10 w-48 h-48 rounded-full bg-white/10 blur-2xl pointer-events-none"></div>
          <div className="absolute left-1/2 -top-10 w-32 h-32 rounded-full bg-blue-400/20 blur-xl pointer-events-none"></div>

          <div className="relative z-10 flex flex-col md:flex-row items-start md:items-center justify-between gap-6">
            <div className="flex items-center gap-4">
              <div className="w-14 h-14 md:w-16 md:h-16 rounded-2xl bg-white/15 backdrop-blur-md border border-white/20 text-white flex items-center justify-center shadow-lg shrink-0">
                <Icon name="calendar" className="w-8 h-8 md:w-9 md:h-9 text-white" />
              </div>
              <div>
                <div className="inline-flex items-center gap-1.5 px-3 py-0.5 rounded-full text-[11px] font-semibold bg-emerald-500/20 text-emerald-200 border border-emerald-400/30 mb-2 backdrop-blur-xs">
                  <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse"></span>
                  Hệ thống sẵn sàng
                </div>
                <h2 className="text-xl md:text-2xl font-black text-white tracking-tight leading-tight">
                  Hệ thống Lịch công tác & Làm việc
                </h2>
              </div>
            </div>

            <a
              href={scheduleUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="w-full md:w-auto inline-flex items-center justify-center gap-2.5 px-5 py-3 rounded-xl bg-white text-blue-700 hover:bg-blue-50 font-bold text-sm shadow-lg transition-all duration-200 active:scale-95 group shrink-0"
            >
              <span>Xem Lịch công tác (Mở tab mới)</span>
              <Icon name="external-link" className="w-4 h-4 text-blue-600 transition-transform duration-200 group-hover:translate-x-0.5 group-hover:-translate-y-0.5" />
            </a>
          </div>
        </div>

        {/* Content & Action Footer Callout */}
        <div className="p-6 md:p-8 bg-white">
          {/* Action Footer Callout */}
          <div className="p-4 rounded-xl bg-blue-50/70 border border-blue-100 flex flex-col sm:flex-row items-center justify-between gap-4">
            <div className="flex items-center gap-3">
              <div className="w-9 h-9 rounded-lg bg-blue-600 text-white flex items-center justify-center shrink-0">
                <Icon name="link-2" className="w-5 h-5" />
              </div>
              <div>
                <p className="text-xs font-bold text-slate-800">Cổng thông tin Lịch công tác:</p>
                <p className="text-xs font-mono text-blue-600 break-all">{displayUrl}</p>
              </div>
            </div>

            <a
              href={scheduleUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="w-full sm:w-auto inline-flex items-center justify-center gap-2 px-4 py-2 rounded-lg bg-blue-600 hover:bg-blue-700 text-white font-semibold text-xs transition-colors shrink-0 shadow-xs"
            >
              <span>Truy cập ngay</span>
              <Icon name="arrow-right" className="w-3.5 h-3.5" />
            </a>
          </div>
        </div>

      </div>
    </div>
  );
}

// ----------------------------------------------------------------------
// 12. REPORTS VIEW COMPONENT
// ----------------------------------------------------------------------
function ReportsView({ tasks = [], employees = [], categories, user, addToast }) {
  const isDeptRestricted = user?.role !== 'ADMIN' && user?.department && user.department !== 'ALL';
  const userDept = user?.department || '';

  // Initial Filter States
  const [selectedDept, setSelectedDept] = useState(() => isDeptRestricted ? userDept : '');
  const [selectedMonth, setSelectedMonth] = useState('');
  const [selectedYear, setSelectedYear] = useState('');
  const [fromDate, setFromDate] = useState('');
  const [toDate, setToDate] = useState('');

  // Selected card modal state
  const [modalConfig, setModalConfig] = useState(null);
  // Selected task for detailed view modal
  const [selectedTaskForDetail, setSelectedTaskForDetail] = useState(null);

  useEffect(() => {
    if (window.lucide) {
      window.lucide.createIcons();
    }
  }, [selectedDept, selectedMonth, selectedYear, fromDate, toDate, modalConfig, selectedTaskForDetail]);

  // Department List
  const departmentList = useMemo(() => {
    if (categories?.departments && Array.isArray(categories.departments) && categories.departments.length > 0) {
      return categories.departments;
    }
    return window.INITIAL_CATEGORIES?.departments || ['Kinh tế', 'VH - XH', 'ĐC - XD', 'VP - TK', 'Tài chính'];
  }, [categories]);

  // Year Options (5 years: currentYear - 3 to currentYear + 1)
  const yearOptions = useMemo(() => {
    const years = new Set();
    const currentYear = new Date().getFullYear();
    for (let y = currentYear - 3; y <= currentYear + 1; y++) {
      years.add(y);
    }
    tasks.forEach(t => {
      const d = parseMonthYear(t.ngay_tao || t.deadline || t.ngay_hoan_thanh, t.thang, t.nam);
      if (d.year) years.add(d.year);
    });
    return Array.from(years).sort((a, b) => b - a);
  }, [tasks]);

  // Reset Filters
  const handleResetFilters = () => {
    setSelectedDept(isDeptRestricted ? userDept : '');
    setSelectedMonth('');
    setSelectedYear('');
    setFromDate('');
    setToDate('');
  };

  // Filter Tasks based on active toolbar settings
  const filteredReportTasks = useMemo(() => {
    const activeDept = isDeptRestricted ? userDept : selectedDept;
    const monthNum = selectedMonth ? parseInt(String(selectedMonth), 10) : null;
    const yearNum = selectedYear ? parseInt(String(selectedYear), 10) : null;
    const fromTime = fromDate ? parseDateToTimestamp(fromDate) : 0;
    const toTime = toDate ? (parseDateToTimestamp(toDate) + 86399999) : 0;

    return tasks.filter(t => {
      // 1. Department Filter
      if (activeDept && activeDept !== '') {
        if ((t.phong_ban || '').trim().toLowerCase() !== activeDept.trim().toLowerCase()) {
          return false;
        }
      }
      // 2. Month Filter
      if (monthNum && monthNum > 0) {
        const dInfo = parseMonthYear(t.ngay_tao || t.deadline || t.ngay_hoan_thanh, t.thang, t.nam);
        if (dInfo.month !== monthNum) return false;
      }
      // 3. Year Filter
      if (yearNum && yearNum > 0) {
        const dInfo = parseMonthYear(t.ngay_tao || t.deadline || t.ngay_hoan_thanh, t.thang, t.nam);
        if (dInfo.year !== yearNum) return false;
      }
      // 4. Date Range Filter (ngay_tao)
      const tTime = parseDateToTimestamp(t.ngay_tao);
      if (fromTime > 0 && tTime < fromTime) return false;
      if (toTime > 0 && tTime > toTime) return false;

      return true;
    });
  }, [tasks, selectedDept, isDeptRestricted, userDept, selectedMonth, selectedYear, fromDate, toDate]);

  // Breakdown metrics for the 6 core cards
  const metrics = useMemo(() => {
    const todayTime = new Date().setHours(0, 0, 0, 0);

    const total = filteredReportTasks;
    const completed = filteredReportTasks.filter(t => (t.trang_thai || '').trim() === 'Hoàn thành');
    
    const inProgressOnTime = filteredReportTasks.filter(t => {
      const st = (t.trang_thai || '').trim();
      if (st !== 'Đang thực hiện') return false;
      const dlTime = parseDateToTimestamp(t.deadline);
      return !t.deadline || dlTime === 0 || dlTime >= todayTime;
    });

    const inProgressOverdue = filteredReportTasks.filter(t => {
      const st = (t.trang_thai || '').trim();
      if (st !== 'Đang thực hiện') return false;
      const dlTime = parseDateToTimestamp(t.deadline);
      return dlTime > 0 && dlTime < todayTime;
    });

    const pausedOrCancelled = filteredReportTasks.filter(t => {
      const st = (t.trang_thai || '').trim().toLowerCase();
      return st === 'tạm dừng' || st === 'tam dung' || st === 'hủy' || st === 'huy' || st === 'hủy bỏ' || st === 'huy bo';
    });

    const noDeadline = filteredReportTasks.filter(t => {
      if (!t.deadline) return true;
      const str = String(t.deadline).trim().toLowerCase();
      return str === '' || str === '--' || str === 'n/a' || str === 'khong' || parseDateToTimestamp(t.deadline) === 0;
    });

    const totalCount = total.length;
    const completedCount = completed.length;
    const completionRate = totalCount > 0 ? Math.round((completedCount / totalCount) * 100) : 0;

    return {
      total,
      completed,
      inProgressOnTime,
      inProgressOverdue,
      pausedOrCancelled,
      noDeadline,
      completionRate
    };
  }, [filteredReportTasks]);

  // Export Modal Tasks to Excel
  const handleExportModalExcel = (taskList, categoryTitle) => {
    if (!window.XLSX) {
      if (addToast) addToast('error', 'Lỗi', 'Thư viện Excel chưa sẵn sàng!');
      else alert('Thư viện Excel chưa sẵn sàng!');
      return;
    }

    try {
      const excelRows = taskList.map((t, idx) => ({
        'STT': idx + 1,
        'Số công văn': t.so_cong_van || '',
        'Nơi ban hành': t.noi_ban_hanh || '',
        'Tên công việc': t.ten_cong_viec || '',
        'Mô tả': t.mo_ta || '',
        'Phòng ban': t.phong_ban || '',
        'Người phụ trách': t.nguoi_phu_trach || '',
        'Ngày tạo': t.ngay_tao || '',
        'Deadline': t.deadline || '',
        'Ngày hoàn thành': t.ngay_hoan_thanh || '',
        'Trạng thái': t.trang_thai || '',
        'Kết quả': t.ket_qua || '',
        'Ghi chú': t.ghi_chu || ''
      }));

      const worksheet = window.XLSX.utils.json_to_sheet(excelRows);
      worksheet['!cols'] = [
        { wch: 6 }, { wch: 20 }, { wch: 20 }, { wch: 40 }, { wch: 30 },
        { wch: 18 }, { wch: 20 }, { wch: 14 }, { wch: 14 }, { wch: 14 },
        { wch: 16 }, { wch: 20 }, { wch: 20 }
      ];

      const workbook = window.XLSX.utils.book_new();
      window.XLSX.utils.book_append_sheet(workbook, worksheet, 'BaoCaoChiTiet');
      const cleanTitle = (categoryTitle || 'BaoCao_CongViec').replace(/[^a-zA-Z0-9_\-]/g, '_');
      const filename = `${cleanTitle}_${new Date().toISOString().slice(0, 10)}.xlsx`;
      window.XLSX.writeFile(workbook, filename);
      if (addToast) addToast('success', 'Thành công', `Đã xuất tệp Excel "${filename}"`);
    } catch (e) {
      console.error('Error exporting Excel:', e);
      alert('Không thể xuất tệp Excel: ' + e.message);
    }
  };

  // Export All Filtered Report Tasks to Excel
  const handleExportAllReportExcel = () => {
    handleExportModalExcel(filteredReportTasks, 'BaoCao_TongHop_CongViec');
  };

  return (
    <div className="space-y-6">
      {/* Header Bar */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h2 className="text-lg font-extrabold text-slate-900 leading-tight">Báo cáo Tổng hợp Công việc</h2>
          <p className="text-xs text-slate-500 font-medium mt-0.5">Theo dõi, thống kê chi tiết tiến độ công việc theo khoảng thời gian và phòng ban</p>
        </div>
        <div className="flex gap-2">
          <button
            type="button"
            onClick={handleExportAllReportExcel}
            className="px-3.5 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white font-semibold text-xs shadow-xs hover:shadow transition-all flex items-center gap-1.5 active:scale-95"
          >
            <Icon name="file-spreadsheet" className="w-4 h-4" />
            <span>Xuất Excel</span>
          </button>
          <button
            type="button"
            onClick={() => window.print()}
            className="px-3.5 py-2 rounded-xl bg-white border border-slate-200 text-slate-700 hover:bg-slate-50 font-semibold text-xs shadow-2xs transition-colors flex items-center gap-1.5"
          >
            <Icon name="printer" className="w-4 h-4 text-slate-500" />
            <span>In Báo cáo (PDF)</span>
          </button>
        </div>
      </div>

      {/* Filter Bar */}
      <div className="bg-white rounded-2xl border border-slate-200/80 p-4 shadow-2xs space-y-3">
        <div className="flex items-center justify-between border-b border-slate-100 pb-2.5">
          <div className="flex items-center gap-2">
            <Icon name="filter" className="w-4 h-4 text-blue-600" />
            <h3 className="text-xs font-bold text-slate-800 uppercase tracking-wider">Bộ lọc tra cứu báo cáo</h3>
          </div>
          <button
            type="button"
            onClick={handleResetFilters}
            className="text-xs font-semibold text-slate-500 hover:text-blue-600 flex items-center gap-1 transition-colors"
          >
            <Icon name="rotate-ccw" className="w-3.5 h-3.5" />
            <span>Đặt lại bộ lọc</span>
          </button>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-3 items-end">
          {/* Department Filter */}
          <div>
            <label className="block text-[11px] font-bold text-slate-600 mb-1">Phòng ban</label>
            <select
              value={isDeptRestricted ? userDept : selectedDept}
              disabled={isDeptRestricted}
              onChange={(e) => setSelectedDept(e.target.value)}
              className={`form-select w-full ${
                isDeptRestricted ? 'bg-slate-100 text-slate-500 cursor-not-allowed font-semibold' : ''
              }`}
            >
              {!isDeptRestricted && <option value="">-- Tất cả phòng ban --</option>}
              {departmentList.map(dept => (
                <option key={dept} value={dept}>{dept}</option>
              ))}
            </select>
          </div>

          {/* From Date Filter */}
          <div>
            <label className="block text-[11px] font-bold text-slate-600 mb-1">Từ ngày (Ngày tạo)</label>
            <input
              type="date"
              value={fromDate}
              onChange={(e) => setFromDate(e.target.value)}
              className="w-full text-xs font-medium border border-slate-200 rounded-xl px-3 py-2 bg-white focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 transition-colors"
            />
          </div>

          {/* To Date Filter */}
          <div>
            <label className="block text-[11px] font-bold text-slate-600 mb-1">Đến ngày (Ngày tạo)</label>
            <input
              type="date"
              value={toDate}
              onChange={(e) => setToDate(e.target.value)}
              className="w-full text-xs font-medium border border-slate-200 rounded-xl px-3 py-2 bg-white focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 transition-colors"
            />
          </div>

          {/* Month Filter */}
          <div>
            <label className="block text-[11px] font-bold text-slate-600 mb-1">Tháng định kỳ</label>
            <select
              value={selectedMonth}
              onChange={(e) => setSelectedMonth(e.target.value)}
              className="form-select w-full"
            >
              <option value="">-- Tất cả tháng --</option>
              {Array.from({ length: 12 }, (_, i) => i + 1).map(m => (
                <option key={m} value={m}>Tháng {m}</option>
              ))}
            </select>
          </div>

          {/* Year Filter */}
          <div>
            <label className="block text-[11px] font-bold text-slate-600 mb-1">Năm định kỳ</label>
            <select
              value={selectedYear}
              onChange={(e) => setSelectedYear(e.target.value)}
              className="form-select w-full"
            >
              <option value="">-- Tất cả năm --</option>
              {yearOptions.map(y => (
                <option key={y} value={y}>Năm {y}</option>
              ))}
            </select>
          </div>
        </div>
      </div>

      {/* 6 Core Overview Statistics Cards */}
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <h3 className="font-bold text-slate-800 text-sm">Thống kê Tổng quan Công việc</h3>
          <span className="text-xs text-slate-500 font-medium">Bấm vào từng thẻ để xem danh sách chi tiết và xuất Excel</span>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6 gap-4">
          {/* Card 1: Tổng công việc */}
          <div
            onClick={() => setModalConfig({ title: 'Tổng công việc', tasks: metrics.total, theme: 'blue' })}
            className="p-4 bg-blue-50/70 hover:bg-blue-100/70 border border-blue-200/80 rounded-2xl transition-all duration-200 shadow-2xs hover:shadow-md hover:-translate-y-0.5 cursor-pointer group"
          >
            <div className="flex items-center justify-between mb-2">
              <span className="text-[11px] font-bold uppercase tracking-wider text-blue-700">TỔNG CÔNG VIỆC</span>
              <div className="w-8 h-8 rounded-xl bg-blue-600/10 text-blue-600 flex items-center justify-center group-hover:scale-110 transition-transform">
                <Icon name="file-text" className="w-4 h-4" />
              </div>
            </div>
            <div className="text-3xl font-extrabold text-blue-700 mb-1">{metrics.total.length}</div>
            <div className="text-[11px] text-blue-600 font-semibold flex items-center justify-between">
              <span>Công việc khả dụng</span>
              <span className="group-hover:translate-x-0.5 transition-transform">Xem chi tiết →</span>
            </div>
          </div>

          {/* Card 2: Đang thực hiện (Đúng hạn) */}
          <div
            onClick={() => setModalConfig({ title: 'Đang thực hiện (Trong hạn)', tasks: metrics.inProgressOnTime, theme: 'sky' })}
            className="p-4 bg-sky-50/70 hover:bg-sky-100/70 border border-sky-200/80 rounded-2xl transition-all duration-200 shadow-2xs hover:shadow-md hover:-translate-y-0.5 cursor-pointer group"
          >
            <div className="flex items-center justify-between mb-2">
              <span className="text-[11px] font-bold uppercase tracking-wider text-sky-700">ĐANG THỰC HIỆN</span>
              <div className="w-8 h-8 rounded-xl bg-sky-600/10 text-sky-600 flex items-center justify-center group-hover:scale-110 transition-transform">
                <Icon name="clock" className="w-4 h-4" />
              </div>
            </div>
            <div className="text-3xl font-extrabold text-sky-700 mb-1">{metrics.inProgressOnTime.length}</div>
            <div className="text-[11px] text-sky-600 font-semibold flex items-center justify-between">
              <span>Đang đúng tiến độ</span>
              <span className="group-hover:translate-x-0.5 transition-transform">Xem chi tiết →</span>
            </div>
          </div>

          {/* Card 3: Đã hoàn thành */}
          <div
            onClick={() => setModalConfig({ title: 'Đã hoàn thành', tasks: metrics.completed, theme: 'emerald' })}
            className="p-4 bg-emerald-50/70 hover:bg-emerald-100/70 border border-emerald-200/80 rounded-2xl transition-all duration-200 shadow-2xs hover:shadow-md hover:-translate-y-0.5 cursor-pointer group"
          >
            <div className="flex items-center justify-between mb-2">
              <span className="text-[11px] font-bold uppercase tracking-wider text-emerald-700">HOÀN THÀNH</span>
              <div className="w-8 h-8 rounded-xl bg-emerald-600/10 text-emerald-600 flex items-center justify-center group-hover:scale-110 transition-transform">
                <Icon name="check-circle-2" className="w-4 h-4" />
              </div>
            </div>
            <div className="text-3xl font-extrabold text-emerald-700 mb-1">{metrics.completed.length}</div>
            <div className="text-[11px] text-emerald-600 font-semibold flex items-center justify-between">
              <span>Đạt {metrics.completionRate}% tổng số</span>
              <span className="group-hover:translate-x-0.5 transition-transform">Xem chi tiết →</span>
            </div>
          </div>

          {/* Card 4: Đang thực hiện trễ hạn */}
          <div
            onClick={() => setModalConfig({ title: 'Đang thực hiện trễ hạn', tasks: metrics.inProgressOverdue, theme: 'rose' })}
            className="p-4 bg-rose-50/70 hover:bg-rose-100/70 border border-rose-200/80 rounded-2xl transition-all duration-200 shadow-2xs hover:shadow-md hover:-translate-y-0.5 cursor-pointer group"
          >
            <div className="flex items-center justify-between mb-2">
              <span className="text-[11px] font-bold uppercase tracking-wider text-rose-700">ĐANG TRỄ HẠN</span>
              <div className="w-8 h-8 rounded-xl bg-rose-600/10 text-rose-600 flex items-center justify-center group-hover:scale-110 transition-transform">
                <Icon name="alert-triangle" className="w-4 h-4" />
              </div>
            </div>
            <div className="text-3xl font-extrabold text-rose-700 mb-1">{metrics.inProgressOverdue.length}</div>
            <div className="text-[11px] text-rose-600 font-semibold flex items-center justify-between">
              <span>Quá deadline</span>
              <span className="group-hover:translate-x-0.5 transition-transform">Xem chi tiết →</span>
            </div>
          </div>

          {/* Card 5: Tạm dừng + Hủy */}
          <div
            onClick={() => setModalConfig({ title: 'Tạm dừng / Hủy bỏ', tasks: metrics.pausedOrCancelled, theme: 'amber' })}
            className="p-4 bg-amber-50/70 hover:bg-amber-100/70 border border-amber-200/80 rounded-2xl transition-all duration-200 shadow-2xs hover:shadow-md hover:-translate-y-0.5 cursor-pointer group"
          >
            <div className="flex items-center justify-between mb-2">
              <span className="text-[11px] font-bold uppercase tracking-wider text-amber-700">TẠM DỪNG / HỦY</span>
              <div className="w-8 h-8 rounded-xl bg-amber-600/10 text-amber-600 flex items-center justify-center group-hover:scale-110 transition-transform">
                <Icon name="pause-circle" className="w-4 h-4" />
              </div>
            </div>
            <div className="text-3xl font-extrabold text-amber-700 mb-1">{metrics.pausedOrCancelled.length}</div>
            <div className="text-[11px] text-amber-600 font-semibold flex items-center justify-between">
              <span>Đang ngưng/đã hủy</span>
              <span className="group-hover:translate-x-0.5 transition-transform">Xem chi tiết →</span>
            </div>
          </div>

          {/* Card 6: Không có hạn */}
          <div
            onClick={() => setModalConfig({ title: 'Không có hạn deadline', tasks: metrics.noDeadline, theme: 'purple' })}
            className="p-4 bg-purple-50/70 hover:bg-purple-100/70 border border-purple-200/80 rounded-2xl transition-all duration-200 shadow-2xs hover:shadow-md hover:-translate-y-0.5 cursor-pointer group"
          >
            <div className="flex items-center justify-between mb-2">
              <span className="text-[11px] font-bold uppercase tracking-wider text-purple-700">KHÔNG CÓ HẠN</span>
              <div className="w-8 h-8 rounded-xl bg-purple-600/10 text-purple-600 flex items-center justify-center group-hover:scale-110 transition-transform">
                <Icon name="calendar-off" className="w-4 h-4" />
              </div>
            </div>
            <div className="text-3xl font-extrabold text-purple-700 mb-1">{metrics.noDeadline.length}</div>
            <div className="text-[11px] text-purple-600 font-semibold flex items-center justify-between">
              <span>Thường xuyên/thường nhật</span>
              <span className="group-hover:translate-x-0.5 transition-transform">Xem chi tiết →</span>
            </div>
          </div>
        </div>
      </div>

      {/* Detail Modal Component */}
      {modalConfig && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4 z-50 animate-fadeIn">
          <div className="bg-white rounded-2xl border border-slate-200 shadow-2xl w-full max-w-5xl max-h-[90vh] flex flex-col overflow-hidden animate-scaleUp">
            {/* Modal Header */}
            <div className="p-4 sm:p-5 border-b border-slate-200 flex items-center justify-between bg-slate-50/70">
              <div className="flex items-center gap-3">
                <div className="w-9 h-9 rounded-xl bg-blue-600 text-white flex items-center justify-center font-bold text-sm shadow-xs">
                  <Icon name="file-text" className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="font-extrabold text-slate-900 text-sm sm:text-base leading-tight">
                    Danh sách chi tiết: {modalConfig.title}
                  </h3>
                  <p className="text-xs text-slate-500 font-medium">
                    Tìm thấy <span className="font-bold text-blue-600">{modalConfig.tasks.length}</span> công việc thỏa mãn điều kiện
                  </p>
                </div>
              </div>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => handleExportModalExcel(modalConfig.tasks, modalConfig.title)}
                  className="px-3 py-1.5 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white font-semibold text-xs shadow-xs transition-colors flex items-center gap-1.5 active:scale-95"
                >
                  <Icon name="file-spreadsheet" className="w-4 h-4" />
                  <span>Xuất Excel nhóm này</span>
                </button>
                <button
                  type="button"
                  onClick={() => setModalConfig(null)}
                  className="w-8 h-8 rounded-lg text-slate-400 hover:bg-slate-200/80 hover:text-slate-700 flex items-center justify-center transition-colors"
                >
                  <Icon name="x" className="w-5 h-5" />
                </button>
              </div>
            </div>

            {/* Modal Body: Task Table */}
            <div className="p-4 sm:p-5 overflow-y-auto flex-1 space-y-3">
              {modalConfig.tasks.length === 0 ? (
                <div className="text-center py-12 bg-slate-50 rounded-xl border border-dashed border-slate-200">
                  <Icon name="inbox" className="w-10 h-10 text-slate-300 mx-auto mb-2" />
                  <p className="text-sm font-semibold text-slate-600">Không tìm thấy công việc nào thỏa mãn</p>
                  <p className="text-xs text-slate-400 mt-1">Vui lòng thay đổi mốc thời gian hoặc bộ lọc phòng ban</p>
                </div>
              ) : (
                <div className="overflow-x-auto border border-slate-200 rounded-xl">
                  <table className="w-full text-left text-xs">
                    <thead className="bg-slate-100/80 text-slate-700 font-bold border-b border-slate-200">
                      <tr>
                        <th className="px-3 py-2.5 w-12 text-center">STT</th>
                        <th className="px-3 py-2.5 w-32">Số CV</th>
                        <th className="px-3 py-2.5">Tên công việc</th>
                        <th className="px-3 py-2.5 w-36">Phòng ban</th>
                        <th className="px-3 py-2.5 w-36">Người phụ trách</th>
                        <th className="px-3 py-2.5 w-28">Ngày tạo</th>
                        <th className="px-3 py-2.5 w-28">Deadline</th>
                        <th className="px-3 py-2.5 w-32 text-center">Trạng thái</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-200/80 bg-white font-medium text-slate-800">
                      {modalConfig.tasks.map((t, idx) => {
                        const st = (t.trang_thai || '').trim();
                        let badgeClass = 'bg-slate-100 text-slate-700 border-slate-200';
                        if (st === 'Hoàn thành') badgeClass = 'bg-emerald-50 text-emerald-700 border-emerald-200';
                        else if (st === 'Đang thực hiện') badgeClass = 'bg-sky-50 text-sky-700 border-sky-200';
                        else if (st === 'Tạm dừng' || st === 'Hủy' || st === 'Hủy bỏ') badgeClass = 'bg-amber-50 text-amber-700 border-amber-200';

                        return (
                          <tr key={t.id || idx} className="hover:bg-slate-50/80 transition-colors">
                            <td className="px-3 py-2.5 text-center font-bold text-slate-500">{idx + 1}</td>
                            <td className="px-3 py-2.5">
                              <button
                                type="button"
                                onClick={() => setSelectedTaskForDetail(t)}
                                className="font-bold text-blue-600 hover:text-blue-800 hover:underline text-left transition-colors inline-flex items-center gap-1 group/btn"
                                title="Bấm để xem chi tiết toàn bộ thông tin công việc"
                              >
                                <span>{t.so_cong_van || '--'}</span>
                                <Icon name="external-link" className="w-3 h-3 text-blue-500 opacity-60 group-hover/btn:opacity-100 transition-opacity" />
                              </button>
                            </td>
                            <td className="px-3 py-2.5">
                              <button
                                type="button"
                                onClick={() => setSelectedTaskForDetail(t)}
                                className="font-bold text-slate-900 hover:text-blue-600 hover:underline text-left transition-colors leading-normal"
                                title="Bấm để xem chi tiết toàn bộ thông tin công việc"
                              >
                                {t.ten_cong_viec || '--'}
                              </button>
                            </td>
                            <td className="px-3 py-2.5 text-slate-600">{t.phong_ban || '--'}</td>
                            <td className="px-3 py-2.5 text-slate-700 font-semibold">{t.nguoi_phu_trach || '--'}</td>
                            <td className="px-3 py-2.5 text-slate-500">{t.ngay_tao || '--'}</td>
                            <td className="px-3 py-2.5 text-slate-500">{t.deadline || '--'}</td>
                            <td className="px-3 py-2.5 text-center">
                              <span className={`inline-block px-2.5 py-1 rounded-full text-[11px] font-bold border ${badgeClass}`}>
                                {st || 'Mới tạo'}
                              </span>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              )}
            </div>

            {/* Modal Footer */}
            <div className="p-4 border-t border-slate-200 bg-slate-50/70 flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setModalConfig(null)}
                className="px-4 py-2 rounded-xl bg-white border border-slate-200 text-slate-700 hover:bg-slate-100 font-bold text-xs shadow-2xs transition-colors"
              >
                Đóng
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Task Detail Modal Overlay */}
      {selectedTaskForDetail && (
        <TaskDetailModal
          task={selectedTaskForDetail}
          isViewOnly={true}
          onClose={() => setSelectedTaskForDetail(null)}
        />
      )}
    </div>
  );
}

// ----------------------------------------------------------------------
// 13. CATEGORIES & SETTINGS VIEWS
// ----------------------------------------------------------------------
function CategoriesView({ subTab, categories, setCategories, employees, setEmployees, accounts, setAccounts, user, setUser, onRefresh, addToast }) {
  const activeCategory = useMemo(() => {
    switch (subTab) {
      case 'category-agencies': return 'agencies';
      case 'category-statuses': return 'statuses';
      case 'category-employees': return 'employees';
      case 'category-accounts': return 'accounts';
      default: return 'agencies';
    }
  }, [subTab]);

  const agenciesList = categories?.agencies || [];
  const [showAddAgencyModal, setShowAddAgencyModal] = useState(false);
  const [editingAgency, setEditingAgency] = useState(null);
  const [deletingAgency, setDeletingAgency] = useState(null);
  const [agencyInput, setAgencyInput] = useState('');
  const [agencyEditInput, setAgencyEditInput] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Agency Filter & Pagination States
  const [agencySearchQuery, setAgencySearchQuery] = useState('');
  const [agencyCurrentPage, setAgencyCurrentPage] = useState(1);
  const [agencyPageSize, setAgencyPageSize] = useState(10);

  useEffect(() => {
    if (window.lucide) {
      window.lucide.createIcons();
    }
  });

  const filteredAgenciesList = useMemo(() => {
    if (!agencySearchQuery.trim()) return agenciesList;
    const query = agencySearchQuery.trim().toLowerCase();
    return agenciesList.filter(item => (item || '').toLowerCase().includes(query));
  }, [agenciesList, agencySearchQuery]);

  useEffect(() => {
    setAgencyCurrentPage(1);
  }, [subTab, agencySearchQuery, agenciesList.length]);

  const agencyTotalPages = Math.max(1, Math.ceil(filteredAgenciesList.length / agencyPageSize));
  const paginatedAgencies = useMemo(() => {
    const start = (agencyCurrentPage - 1) * agencyPageSize;
    return filteredAgenciesList.slice(start, start + agencyPageSize);
  }, [filteredAgenciesList, agencyCurrentPage, agencyPageSize]);

  useEffect(() => {
    if (editingAgency) {
      setAgencyEditInput(editingAgency);
    }
  }, [editingAgency]);

  const handleAddAgency = async (e) => {
    e.preventDefault();
    if (!agencyInput.trim()) return;
    const name = agencyInput.trim();
    if (agenciesList.includes(name)) {
      alert('Nơi ban hành này đã tồn tại!');
      return;
    }
    setIsSubmitting(true);
    setCategories(prev => ({ ...prev, agencies: [...(prev.agencies || []), name] }));
    setShowAddAgencyModal(false);
    setAgencyInput('');
    addToast('success', 'Thành công', `Đã thêm nơi ban hành "${name}"`);

    try {
      const res = await fetch('/api/add', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json; charset=utf-8' },
        body: JSON.stringify({ type: 'agencies', data: { name } })
      });
      if (onRefresh) {
        await onRefresh(true);
      }
    } catch (err) {
      console.error('Error adding agency:', err);
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleEditAgency = async (e) => {
    e.preventDefault();
    if (!agencyEditInput.trim()) return;
    const newName = agencyEditInput.trim();
    const oldName = editingAgency;
    if (newName !== oldName && agenciesList.includes(newName)) {
      alert('Tên nơi ban hành này đã tồn tại!');
      return;
    }
    setIsSubmitting(true);
    setCategories(prev => ({
      ...prev,
      agencies: (prev.agencies || []).map(a => a === oldName ? newName : a)
    }));
    setEditingAgency(null);
    addToast('success', 'Thành công', `Đã cập nhật nơi ban hành "${newName}"`);

    try {
      const res = await fetch('/api/update', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json; charset=utf-8' },
        body: JSON.stringify({ type: 'agencies', data: { oldName, newName } })
      });
      if (onRefresh) {
        await onRefresh(true);
      }
    } catch (err) {
      console.error('Error updating agency:', err);
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleDeleteAgency = async (agencyToDelete) => {
    setIsSubmitting(true);
    setCategories(prev => ({
      ...prev,
      agencies: (prev.agencies || []).filter(a => a !== agencyToDelete)
    }));
    setDeletingAgency(null);
    addToast('success', 'Đã xóa', `Đã xóa nơi ban hành "${agencyToDelete}"`);

    try {
      const res = await fetch('/api/delete', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json; charset=utf-8' },
        body: JSON.stringify({ type: 'agencies', id: agencyToDelete, data: { name: agencyToDelete } })
      });
      if (onRefresh) {
        await onRefresh(true);
      }
    } catch (err) {
      console.error('Error deleting agency:', err);
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="space-y-4">
      {/* Sub-menu Content Views */}
      {activeCategory === 'agencies' && (
        <div className="space-y-4">
          {/* Header Toolbar & Action Button */}
          <div className="bg-white rounded-xl border border-slate-200 p-4 shadow-xs flex items-center justify-between">
            <div>
              <h3 className="font-bold text-slate-900 text-sm">Danh mục Nơi ban hành</h3>
              <p className="text-xs text-slate-500">Danh sách các cơ quan, đơn vị ban hành văn bản</p>
            </div>
            <div className="flex items-center gap-3">
              <span className="text-xs font-semibold text-blue-600 bg-blue-50 px-2.5 py-1 rounded-lg border border-blue-200/60">
                {agencySearchQuery.trim() ? `${filteredAgenciesList.length} / ${agenciesList.length} đơn vị` : `${agenciesList.length} đơn vị`}
              </span>
              <button
                onClick={() => setShowAddAgencyModal(true)}
                className="btn-primary text-xs h-[38px] px-3.5 font-semibold shadow-xs inline-flex items-center gap-1.5"
              >
                <i data-lucide="plus" className="w-3.5 h-3.5"></i>
                <span>Thêm mới nơi ban hành</span>
              </button>
            </div>
          </div>

          {/* Search Filter Bar */}
          <div className="bg-white rounded-xl border border-slate-200 p-4 shadow-xs">
            <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3 text-xs">
              <div className="relative flex-1">
                <input
                  type="text"
                  placeholder="Nhập tên nơi ban hành..."
                  value={agencySearchQuery}
                  onChange={e => setAgencySearchQuery(e.target.value)}
                  className="form-input pl-9 pr-8 text-xs py-2 w-full"
                />
                <i data-lucide="search" className="w-4 h-4 text-slate-400 absolute left-3 top-2.5"></i>
                {agencySearchQuery && (
                  <button
                    type="button"
                    onClick={() => setAgencySearchQuery('')}
                    className="absolute right-2.5 top-2.5 text-slate-400 hover:text-slate-600"
                    title="Xóa tìm kiếm"
                  >
                    <i data-lucide="x" className="w-3.5 h-3.5"></i>
                  </button>
                )}
              </div>
              {agencySearchQuery && (
                <button
                  type="button"
                  onClick={() => setAgencySearchQuery('')}
                  className="btn-secondary text-xs h-[36px] px-3 font-semibold inline-flex items-center justify-center gap-1.5 shrink-0"
                >
                  <i data-lucide="rotate-ccw" className="w-3.5 h-3.5"></i>
                  <span>Đặt lại</span>
                </button>
              )}
            </div>
          </div>

          {/* GridView Data Table */}
          <div className="bg-white rounded-xl border border-slate-200 shadow-xs overflow-hidden">
            <table className="custom-table">
              <thead>
                <tr>
                  <th className="w-16 text-center">STT</th>
                  <th>Tên Nơi ban hành / Cơ quan đơn vị</th>
                  <th className="w-36 text-center">Trạng thái</th>
                  <th className="w-32 text-center">Thao tác</th>
                </tr>
              </thead>
              <tbody>
                {paginatedAgencies.map((item, idx) => (
                  <tr key={item + idx} className="hover:bg-slate-50/80 transition-colors">
                    <td className="text-center font-mono font-semibold text-slate-500">{(agencyCurrentPage - 1) * agencyPageSize + idx + 1}</td>
                    <td className="font-bold text-slate-900">{item}</td>
                    <td className="text-center">
                      <span className="inline-flex items-center gap-1 text-[11px] font-bold text-emerald-700 bg-emerald-50 px-2.5 py-0.5 rounded-full border border-emerald-200">
                        <span className="w-1.5 h-1.5 rounded-full bg-emerald-500"></span>
                        Kích hoạt
                      </span>
                    </td>
                    <td className="text-center">
                      <div className="flex items-center justify-center gap-1.5">
                        <button
                          type="button"
                          onClick={() => setEditingAgency(item)}
                          className="p-1.5 rounded-lg text-blue-600 hover:text-blue-700 hover:bg-blue-50 bg-blue-50/60 border border-blue-200/60 transition-colors inline-flex items-center justify-center opacity-100 cursor-pointer shadow-2xs"
                          title="Chỉnh sửa nơi ban hành"
                        >
                          <svg className="w-4 h-4 text-blue-600" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                            <path d="M12 20h9"></path>
                            <path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4L16.5 3.5z"></path>
                          </svg>
                        </button>
                        <button
                          type="button"
                          onClick={() => setDeletingAgency(item)}
                          className="p-1.5 rounded-lg text-rose-600 hover:text-rose-700 hover:bg-rose-50 bg-rose-50/60 border border-rose-200/60 transition-colors inline-flex items-center justify-center opacity-100 cursor-pointer shadow-2xs"
                          title="Xóa nơi ban hành"
                        >
                          <svg className="w-4 h-4 text-rose-600" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                            <polyline points="3 6 5 6 21 6"></polyline>
                            <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2 2v2"></path>
                            <line x1="10" y1="11" x2="10" y2="17"></line>
                            <line x1="14" y1="11" x2="14" y2="17"></line>
                          </svg>
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
                {filteredAgenciesList.length === 0 && (
                  <tr>
                    <td colSpan={4} className="text-center py-8 text-slate-400 text-xs">
                      {agencySearchQuery.trim() ? 'Chưa tìm thấy nơi ban hành nào phù hợp.' : 'Chưa có nơi ban hành nào trong danh mục.'}
                    </td>
                  </tr>
                )}
              </tbody>
            </table>

            {/* Pagination Footer */}
            <div className="p-4 border-t border-slate-100 flex items-center justify-between text-xs text-slate-500">
              <div className="flex items-center gap-2">
                <span>Hiển thị</span>
                <select value={agencyPageSize} onChange={e => { setAgencyPageSize(Number(e.target.value)); setAgencyCurrentPage(1); }} className="form-select h-8 text-xs py-0">
                  <option value={10}>10 dòng</option>
                  <option value={25}>25 dòng</option>
                  <option value={50}>50 dòng</option>
                </select>
                <span>/ Tổng {filteredAgenciesList.length} dòng</span>
              </div>

              <div className="flex items-center gap-1">
                <button disabled={agencyCurrentPage === 1} onClick={() => setAgencyCurrentPage(p => p - 1)} className="p-1.5 rounded-lg border border-slate-200 hover:bg-slate-50 disabled:opacity-40">
                  <i data-lucide="chevron-left" className="w-4 h-4"></i>
                </button>
                <span className="px-3 py-1 font-semibold text-slate-700">Trang {agencyCurrentPage} / {agencyTotalPages}</span>
                <button disabled={agencyCurrentPage >= agencyTotalPages} onClick={() => setAgencyCurrentPage(p => p + 1)} className="p-1.5 rounded-lg border border-slate-200 hover:bg-slate-50 disabled:opacity-40">
                  <i data-lucide="chevron-right" className="w-4 h-4"></i>
                </button>
              </div>
            </div>
          </div>

          {/* Add Agency Modal */}
          {showAddAgencyModal && (
            <div className="modal-backdrop">
              <div className="modal-content max-w-md">
                <div className="modal-header">
                  <h3 className="font-bold text-slate-900 text-sm">Thêm mới Nơi ban hành</h3>
                  <button onClick={() => setShowAddAgencyModal(false)} disabled={isSubmitting} className="p-1 rounded text-slate-400 hover:bg-slate-100">
                    <i data-lucide="x" className="w-4 h-4"></i>
                  </button>
                </div>
                <form onSubmit={handleAddAgency}>
                  <div className="modal-body space-y-4 text-xs">
                    <div>
                      <label className="block font-semibold text-slate-700 mb-1">Tên Nơi ban hành / Đơn vị *</label>
                      <input
                        type="text"
                        placeholder="Ví dụ: Chi cục Chăn nuôi Thú y"
                        value={agencyInput}
                        onChange={e => setAgencyInput(e.target.value)}
                        className="form-input"
                        required
                      />
                    </div>
                  </div>
                  <div className="modal-footer">
                    <button type="button" onClick={() => setShowAddAgencyModal(false)} disabled={isSubmitting} className="btn-secondary text-xs">Hủy</button>
                    <button type="submit" disabled={isSubmitting} className="btn-primary text-xs inline-flex items-center gap-1.5 min-w-[100px] justify-center">
                      {isSubmitting ? (
                        <>
                          <Spinner className="w-3.5 h-3.5 text-white" />
                          <span>Đang lưu...</span>
                        </>
                      ) : (
                        <span>Lưu đơn vị</span>
                      )}
                    </button>
                  </div>
                </form>
              </div>
            </div>
          )}

          {/* Edit Agency Modal */}
          {editingAgency && (
            <div className="modal-backdrop">
              <div className="modal-content max-w-md">
                <div className="modal-header">
                  <h3 className="font-bold text-slate-900 text-sm">Chỉnh sửa Nơi ban hành</h3>
                  <button onClick={() => setEditingAgency(null)} disabled={isSubmitting} className="p-1 rounded text-slate-400 hover:bg-slate-100">
                    <i data-lucide="x" className="w-4 h-4"></i>
                  </button>
                </div>
                <form onSubmit={handleEditAgency}>
                  <div className="modal-body space-y-4 text-xs">
                    <div>
                      <label className="block font-semibold text-slate-700 mb-1">Tên Nơi ban hành / Đơn vị *</label>
                      <input
                        type="text"
                        value={agencyEditInput}
                        onChange={e => setAgencyEditInput(e.target.value)}
                        className="form-input"
                        required
                      />
                    </div>
                  </div>
                  <div className="modal-footer">
                    <button type="button" onClick={() => setEditingAgency(null)} disabled={isSubmitting} className="btn-secondary text-xs">Hủy</button>
                    <button type="submit" disabled={isSubmitting} className="btn-primary text-xs inline-flex items-center gap-1.5 min-w-[120px] justify-center">
                      {isSubmitting ? (
                        <>
                          <Spinner className="w-3.5 h-3.5 text-white" />
                          <span>Đang lưu...</span>
                        </>
                      ) : (
                        <span>Lưu thay đổi</span>
                      )}
                    </button>
                  </div>
                </form>
              </div>
            </div>
          )}

          {/* Confirm Delete Agency Modal */}
          {deletingAgency && (
            <ConfirmModal
              title="Xác nhận xóa Nơi ban hành"
              message={`Bạn có chắc chắn muốn xóa nơi ban hành "${deletingAgency}"? Thao tác này sẽ gỡ khỏi danh mục.`}
              onClose={() => setDeletingAgency(null)}
              onConfirm={() => handleDeleteAgency(deletingAgency)}
            />
          )}
        </div>
      )}

      {activeCategory === 'statuses' && (
        <div className="bg-white rounded-xl border border-slate-200 p-5 shadow-xs space-y-4">
          <div className="flex items-center justify-between border-b border-slate-100 pb-3">
            <div>
              <h3 className="font-bold text-slate-900 text-sm">Danh mục Trạng thái công việc</h3>
              <p className="text-xs text-slate-500">Quy trình và trạng thái xử lý nhiệm vụ hệ thống</p>
            </div>
            <span className="text-xs font-semibold text-purple-600 bg-purple-50 px-2.5 py-1 rounded-lg border border-purple-200/60">
              4 trạng thái chuẩn
            </span>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="p-4 bg-emerald-50/60 border border-emerald-200/80 rounded-xl flex items-center justify-between">
              <div className="flex items-center gap-3">
                <span className="w-3 h-3 rounded-full bg-emerald-500"></span>
                <div>
                  <div className="font-bold text-emerald-900 text-xs">Hoàn thành</div>
                  <div className="text-[11px] text-emerald-700">Công việc đã hoàn thành đúng hạn hoặc trễ hạn</div>
                </div>
              </div>
              <span className="text-[10px] font-bold text-emerald-700 bg-white px-2 py-1 rounded shadow-2xs">Mặc định</span>
            </div>

            <div className="p-4 bg-blue-50/60 border border-blue-200/80 rounded-xl flex items-center justify-between">
              <div className="flex items-center gap-3">
                <span className="w-3 h-3 rounded-full bg-blue-500"></span>
                <div>
                  <div className="font-bold text-blue-900 text-xs">Đang thực hiện</div>
                  <div className="text-[11px] text-blue-700">Nhiệm vụ đang trong quá trình tiến hành xử lý</div>
                </div>
              </div>
              <span className="text-[10px] font-bold text-blue-700 bg-white px-2 py-1 rounded shadow-2xs">Mặc định</span>
            </div>

            <div className="p-4 bg-amber-50/60 border border-amber-200/80 rounded-xl flex items-center justify-between">
              <div className="flex items-center gap-3">
                <span className="w-3 h-3 rounded-full bg-amber-500"></span>
                <div>
                  <div className="font-bold text-amber-900 text-xs">Tạm dừng</div>
                  <div className="text-[11px] text-amber-700">Tạm hoãn tiến độ xử lý chờ chỉ đạo thêm</div>
                </div>
              </div>
              <span className="text-[10px] font-bold text-amber-700 bg-white px-2 py-1 rounded shadow-2xs">Mặc định</span>
            </div>

            <div className="p-4 bg-rose-50/60 border border-rose-200/80 rounded-xl flex items-center justify-between">
              <div className="flex items-center gap-3">
                <span className="w-3 h-3 rounded-full bg-rose-500"></span>
                <div>
                  <div className="font-bold text-rose-900 text-xs">Đã hủy</div>
                  <div className="text-[11px] text-rose-700">Công việc bị hủy bỏ hoặc chuyển cơ quan khác</div>
                </div>
              </div>
              <span className="text-[10px] font-bold text-rose-700 bg-white px-2 py-1 rounded shadow-2xs">Mặc định</span>
            </div>
          </div>
        </div>
      )}

      {activeCategory === 'employees' && (
        <EmployeesView
          employees={employees || []}
          setEmployees={setEmployees}
          categories={categories}
          onRefresh={onRefresh}
          addToast={addToast}
        />
      )}

      {activeCategory === 'accounts' && (
        <SettingsView user={user} setUser={setUser} accounts={accounts} setAccounts={setAccounts} addToast={addToast} />
      )}
    </div>
  );
}

function SettingsView({ user, setUser, accounts, setAccounts, addToast }) {
  const [showAddAccountModal, setShowAddAccountModal] = useState(false);
  const [editingAccount, setEditingAccount] = useState(null);

  const [formData, setFormData] = useState({
    username: '',
    password: '',
    department: 'Kinh tế',
    role: 'EDIT',
    name: ''
  });

  const departmentOptions = [
    'ALL',
    'Kinh tế',
    'VH - XH',
    'Văn phòng UBND',
    'Nội vụ',
    'Tài chính',
    'Tư pháp',
    'Quản lý đô thị',
    'Tài nguyên & Môi trường'
  ];

  const handleCreateAccount = async (e) => {
    e.preventDefault();
    if (!formData.username || !formData.password) {
      alert('Vui lòng điền đầy đủ Tài khoản và Mật khẩu!');
      return;
    }
    const cleanUser = formData.username.trim().toLowerCase();
    if (accounts.some(a => (a.username || '').toLowerCase() === cleanUser)) {
      alert('Tên tài khoản này đã tồn tại trong hệ thống!');
      return;
    }

    const newAcc = {
      username: cleanUser,
      password: formData.password.trim(),
      department: formData.department,
      role: formData.role,
      name: formData.name.trim() || `Cán bộ ${formData.department}`
    };

    setAccounts([...accounts, newAcc]);
    setShowAddAccountModal(false);
    setFormData({ username: '', password: '', department: 'Kinh tế', role: 'EDIT', name: '' });

    try {
      const res = await fetch('/api/add', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ type: 'users', data: newAcc })
      });
      if (res.ok) {
        addToast('success', 'Thêm tài khoản thành công', `Tài khoản ${newAcc.username} đã được đồng bộ trực tiếp vào Google Sheets!`);
      } else {
        addToast('success', 'Thêm tài khoản thành công', `Tài khoản ${newAcc.username} đã tạo trên giao diện!`);
      }
      if (onRefresh) await onRefresh(true);
    } catch (err) {
      addToast('success', 'Thêm tài khoản thành công', `Tài khoản ${newAcc.username} đã tạo trên giao diện!`);
      if (onRefresh) await onRefresh(true);
    }
  };

  const handleUpdateAccount = async (e) => {
    e.preventDefault();
    setAccounts(prev => prev.map(acc => acc.username === editingAccount.username ? { ...editingAccount } : acc));

    if (user.username === editingAccount.username) {
      setUser(prev => ({
        ...prev,
        department: editingAccount.department,
        role: editingAccount.role,
        name: editingAccount.name || prev.name
      }));
    }

    setEditingAccount(null);

    try {
      const res = await fetch('/api/update', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ type: 'users', data: editingAccount })
      });
      if (res.ok) {
        addToast('success', 'Lưu thay đổi', `Đã cập nhật thông tin tài khoản ${editingAccount.username} vào Google Sheets!`);
      } else {
        addToast('success', 'Lưu thay đổi', `Đã cập nhật thông tin tài khoản ${editingAccount.username}!`);
      }
      if (onRefresh) await onRefresh(true);
    } catch (err) {
      addToast('success', 'Lưu thay đổi', `Đã cập nhật thông tin tài khoản ${editingAccount.username}!`);
      if (onRefresh) await onRefresh(true);
    }
  };

  const handleDeleteAccount = async (accUsername) => {
    if (accUsername === 'admin') {
      alert('Không thể xóa tài khoản admin hệ thống!');
      return;
    }
    if (confirm(`Bạn có chắc chắn muốn xóa tài khoản "${accUsername}" khỏi Google Sheets?`)) {
      setAccounts(prev => prev.filter(acc => acc.username !== accUsername));
      try {
        const res = await fetch('/api/delete', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ type: 'users', id: accUsername, data: { username: accUsername } })
        });
        if (res.ok) {
          addToast('success', 'Đã xóa tài khoản', `Đã xóa tài khoản ${accUsername} khỏi Google Sheets!`);
        } else {
          addToast('success', 'Đã xóa tài khoản', `Đã xóa tài khoản ${accUsername} khỏi hệ thống!`);
        }
        if (onRefresh) await onRefresh(true);
      } catch (err) {
        addToast('success', 'Đã xóa tài khoản', `Đã xóa tài khoản ${accUsername} khỏi hệ thống!`);
        if (onRefresh) await onRefresh(true);
      }
    }
  };

  return (
    <div className="space-y-6">
      {/* User Profile Card */}
      <div className="bg-white rounded-xl border border-slate-200 p-6 shadow-xs space-y-4">
        <h2 className="text-base font-bold text-slate-900 flex items-center gap-2">
          <i data-lucide="user-check" className="w-5 h-5 text-blue-600"></i>
          <span>Thông tin Phiên đăng nhập Hiện tại</span>
        </h2>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 text-xs">
          <div>
            <label className="block text-slate-500 font-semibold mb-1">Tài khoản</label>
            <div className="font-bold text-slate-800">{user.username}</div>
          </div>
          <div>
            <label className="block text-slate-500 font-semibold mb-1">Phòng ban</label>
            <div className="font-bold text-blue-600">{user.department}</div>
          </div>
          <div>
            <label className="block text-slate-500 font-semibold mb-1">Quyền truy cập</label>
            <div className="font-bold text-purple-600">{user.role}</div>
          </div>
        </div>
      </div>

      {/* Sheet Settings K-N Accounts Management Table */}
      <div className="bg-white rounded-xl border border-slate-200 shadow-xs overflow-hidden">
        <div className="p-4 border-b border-slate-100 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
          <div>
            <h3 className="font-bold text-slate-900 text-sm flex items-center gap-2">
              <i data-lucide="users" className="w-4 h-4 text-blue-600"></i>
              <span>Cấu hình Danh sách Tài khoản (Sheet Settings - Cột K đến N)</span>
            </h3>
            <p className="text-xs text-slate-500 mt-0.5">Nguồn dữ liệu tài khoản động. Mọi thao tác thêm, sửa, xóa sẽ tự động cập nhật ngay lập tức vào bộ nhớ xác thực mà không cần khởi động lại ứng dụng.</p>
          </div>
          <button
            onClick={() => setShowAddAccountModal(true)}
            className="btn-primary text-xs h-8 whitespace-nowrap shrink-0"
          >
            <i data-lucide="user-plus" className="w-3.5 h-3.5"></i> Thêm tài khoản
          </button>
        </div>

        <div className="overflow-x-auto">
          <table className="custom-table">
            <thead>
              <tr>
                <th className="w-12 text-center">STT</th>
                <th>Tài khoản (K)</th>
                <th>Mật khẩu (L)</th>
                <th>Phòng ban (M)</th>
                <th>Quyền (N)</th>
                <th>Họ & Tên cán bộ</th>
                <th className="text-center">Thao tác</th>
              </tr>
            </thead>
            <tbody>
              {accounts.map((acc, idx) => (
                <tr key={acc.username}>
                  <td className="text-center text-slate-400 font-mono text-xs">{idx + 1}</td>
                  <td className="font-bold text-blue-600">{acc.username}</td>
                  <td className="font-mono text-slate-600">{acc.password}</td>
                  <td>
                    <span className="font-semibold text-slate-800">{acc.department}</span>
                  </td>
                  <td>
                    <span className={`text-[10px] font-bold px-2 py-0.5 rounded border ${acc.role === 'ADMIN' ? 'bg-purple-100 text-purple-700 border-purple-200' :
                        acc.role === 'EDIT' ? 'bg-emerald-100 text-emerald-700 border-emerald-200' :
                          'bg-amber-100 text-amber-700 border-amber-200'
                      }`}>
                      {acc.role}
                    </span>
                  </td>
                  <td className="text-xs text-slate-700">{acc.name || '--'}</td>
                  <td className="text-center">
                    <div className="flex items-center justify-center gap-1.5 opacity-100 visible">
                      <button
                        type="button"
                        onClick={() => setEditingAccount({ ...acc })}
                        className="p-1.5 rounded-lg text-blue-600 hover:text-blue-700 hover:bg-blue-100/80 bg-blue-50 border border-blue-200/70 transition-colors inline-flex items-center justify-center cursor-pointer shadow-2xs"
                        title="Chỉnh sửa tài khoản"
                      >
                        <svg className="w-4 h-4 text-blue-600" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                          <path d="M12 20h9"></path>
                          <path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4L16.5 3.5z"></path>
                        </svg>
                      </button>
                      {acc.username !== 'admin' && (
                        <button
                          type="button"
                          onClick={() => handleDeleteAccount(acc.username)}
                          className="p-1.5 rounded-lg text-rose-600 hover:text-rose-700 hover:bg-rose-100/80 bg-rose-50 border border-rose-200/70 transition-colors inline-flex items-center justify-center cursor-pointer shadow-2xs"
                          title="Xóa tài khoản"
                        >
                          <svg className="w-4 h-4 text-rose-600" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                            <polyline points="3 6 5 6 21 6"></polyline>
                            <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path>
                          </svg>
                        </button>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Modal Add Account */}
      {showAddAccountModal && (
        <div className="modal-backdrop">
          <div className="modal-content max-w-md">
            <div className="modal-header">
              <h3 className="font-bold text-slate-900 text-sm">Thêm Tài khoản Mới (Sheet Settings K-N)</h3>
              <button onClick={() => setShowAddAccountModal(false)} className="p-1 text-slate-400 hover:bg-slate-100 rounded-lg">
                <i data-lucide="x" className="w-5 h-5"></i>
              </button>
            </div>
            <form onSubmit={handleCreateAccount} className="space-y-4 p-4">
              <div>
                <label className="block text-xs font-bold uppercase text-slate-700 mb-1">Tài khoản (Cột K) *</label>
                <input
                  type="text"
                  placeholder="Ví dụ: ubnd.pkt2"
                  value={formData.username}
                  onChange={e => setFormData({ ...formData, username: e.target.value })}
                  className="form-input text-xs"
                  required
                />
              </div>
              <div>
                <label className="block text-xs font-bold uppercase text-slate-700 mb-1">Mật khẩu (Cột L) *</label>
                <input
                  type="text"
                  placeholder="Nhập mật khẩu..."
                  value={formData.password}
                  onChange={e => setFormData({ ...formData, password: e.target.value })}
                  className="form-input text-xs"
                  required
                />
              </div>
              <div>
                <label className="block text-xs font-bold uppercase text-slate-700 mb-1">Họ và Tên cán bộ</label>
                <input
                  type="text"
                  placeholder="Ví dụ: Nguyễn Văn A"
                  value={formData.name}
                  onChange={e => setFormData({ ...formData, name: e.target.value })}
                  className="form-input text-xs"
                />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-bold uppercase text-slate-700 mb-1">Phòng ban (Cột M) *</label>
                  <select
                    value={formData.department}
                    onChange={e => setFormData({ ...formData, department: e.target.value })}
                    className="form-select text-xs"
                  >
                    {departmentOptions.map(d => <option key={d} value={d}>{d}</option>)}
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-bold uppercase text-slate-700 mb-1">Quyền (Cột N) *</label>
                  <select
                    value={formData.role}
                    onChange={e => setFormData({ ...formData, role: e.target.value })}
                    className="form-select text-xs"
                  >
                    <option value="ADMIN">ADMIN (Toàn quyền)</option>
                    <option value="EDIT">EDIT (Thêm/Sửa/Xóa)</option>
                    <option value="VIEW">VIEW (Chỉ xem)</option>
                  </select>
                </div>
              </div>
              <div className="modal-footer pt-3 border-t">
                <button type="button" onClick={() => setShowAddAccountModal(false)} className="btn-secondary text-xs">Hủy</button>
                <button type="submit" className="btn-primary text-xs">Tạo tài khoản</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Modal Edit Account */}
      {editingAccount && (
        <div className="modal-backdrop">
          <div className="modal-content max-w-md">
            <div className="modal-header">
              <h3 className="font-bold text-slate-900 text-sm">Chỉnh sửa Tài khoản #{editingAccount.username}</h3>
              <button onClick={() => setEditingAccount(null)} className="p-1 text-slate-400 hover:bg-slate-100 rounded-lg">
                <i data-lucide="x" className="w-5 h-5"></i>
              </button>
            </div>
            <form onSubmit={handleUpdateAccount} className="space-y-4 p-4">
              <div>
                <label className="block text-xs font-bold uppercase text-slate-700 mb-1">Tài khoản (Cột K)</label>
                <input
                  type="text"
                  value={editingAccount.username}
                  className="form-input text-xs bg-slate-100"
                  disabled
                />
              </div>
              <div>
                <label className="block text-xs font-bold uppercase text-slate-700 mb-1">Mật khẩu (Cột L) *</label>
                <input
                  type="text"
                  value={editingAccount.password}
                  onChange={e => setEditingAccount({ ...editingAccount, password: e.target.value })}
                  className="form-input text-xs"
                  required
                />
              </div>
              <div>
                <label className="block text-xs font-bold uppercase text-slate-700 mb-1">Họ và Tên cán bộ</label>
                <input
                  type="text"
                  value={editingAccount.name || ''}
                  onChange={e => setEditingAccount({ ...editingAccount, name: e.target.value })}
                  className="form-input text-xs"
                />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-bold uppercase text-slate-700 mb-1">Phòng ban (Cột M) *</label>
                  <select
                    value={editingAccount.department}
                    onChange={e => setEditingAccount({ ...editingAccount, department: e.target.value })}
                    className="form-select text-xs"
                  >
                    {departmentOptions.map(d => <option key={d} value={d}>{d}</option>)}
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-bold uppercase text-slate-700 mb-1">Quyền (Cột N) *</label>
                  <select
                    value={editingAccount.role}
                    onChange={e => setEditingAccount({ ...editingAccount, role: e.target.value })}
                    className="form-select text-xs"
                  >
                    <option value="ADMIN">ADMIN (Toàn quyền)</option>
                    <option value="EDIT">EDIT (Thêm/Sửa/Xóa)</option>
                    <option value="VIEW">VIEW (Chỉ xem)</option>
                  </select>
                </div>
              </div>
              <div className="modal-footer pt-3 border-t">
                <button type="button" onClick={() => setEditingAccount(null)} className="btn-secondary text-xs">Hủy</button>
                <button type="submit" className="btn-primary text-xs">Lưu cập nhật</button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}

// ----------------------------------------------------------------------
// 14. TOAST CONTAINER & CONFIRMATION MODAL
// ----------------------------------------------------------------------
function ToastContainer({ toasts, setToasts }) {
  return (
    <div className="toast-container">
      {toasts.map(t => (
        <div key={t.id} className={`toast-item ${t.type}`}>
          <div>
            <div className="text-xs font-bold text-slate-900">{t.title}</div>
            <div className="text-xs text-slate-600">{t.message}</div>
          </div>
          <button onClick={() => setToasts(prev => prev.filter(item => item.id !== t.id))} className="text-slate-400 hover:text-slate-600">
            <i data-lucide="x" className="w-4 h-4"></i>
          </button>
        </div>
      ))}
    </div>
  );
}

function ConfirmModal({ title, message, onClose, onConfirm }) {
  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleConfirmClick = async () => {
    setIsSubmitting(true);
    try {
      await onConfirm();
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="modal-backdrop">
      <div className="modal-content max-w-sm">
        <div className="modal-header">
          <h3 className="font-bold text-slate-900 text-sm">{title}</h3>
          <button onClick={onClose} disabled={isSubmitting} className="p-1 rounded text-slate-400 hover:bg-slate-100">
            <i data-lucide="x" className="w-4 h-4"></i>
          </button>
        </div>
        <div className="modal-body text-xs text-slate-600">
          {message}
        </div>
        <div className="modal-footer">
          <button onClick={onClose} disabled={isSubmitting} className="btn-secondary text-xs">Hủy</button>
          <button onClick={handleConfirmClick} disabled={isSubmitting} className="btn-primary text-xs bg-rose-600 hover:bg-rose-700 border-rose-600 inline-flex items-center gap-1.5 min-w-[110px] justify-center">
            {isSubmitting ? (
              <>
                <Spinner className="w-3.5 h-3.5 text-white" />
                <span>Đang xóa...</span>
              </>
            ) : (
              <span>Xác nhận xóa</span>
            )}
          </button>
        </div>
      </div>
    </div>
  );
}

// Render React App & Lucide Icons initialization
const rootElement = document.getElementById('root');
const root = ReactDOM.createRoot(rootElement);
root.render(<App />);

// Initialize Lucide Icons after render
setTimeout(() => {
  if (window.lucide && typeof window.lucide.createIcons === 'function') {
    window.lucide.createIcons();
  }
}, 200);

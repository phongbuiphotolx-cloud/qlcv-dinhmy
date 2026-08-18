$OutputEncoding = [System.Text.Encoding]::UTF8
[Console]::OutputEncoding = [System.Text.Encoding]::UTF8

$port = 8080
$excelPath = Join-Path $PSScriptRoot "QLCV_UBND.xlsx"

$listener = New-Object System.Net.HttpListener
$listener.Prefixes.Add("http://localhost:${port}/")
$listener.Start()

Write-Host "=========================================================="
Write-Host " QLCV UBND Backend & Web Server running on port ${port}"
Write-Host " Frontend: http://localhost:${port}/"
Write-Host " API Endpoints: http://localhost:${port}/api/data"
Write-Host " File Watcher API: http://localhost:${port}/api/status"
Write-Host " Excel Database: $excelPath"
Write-Host "=========================================================="

$mimeTypes = @{
    ".html" = "text/html; charset=utf-8"
    ".css"  = "text/css; charset=utf-8"
    ".js"   = "text/javascript; charset=utf-8"
    ".jsx"  = "text/javascript; charset=utf-8"
    ".json" = "application/json; charset=utf-8"
    ".png"  = "image/png"
    ".jpg"  = "image/jpeg"
    ".svg"  = "image/svg+xml"
    ".xlsx" = "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
}

$script:strDangLamViec = [System.Text.Encoding]::UTF8.GetString([byte[]](196, 144, 97, 110, 103, 32, 108, 195, 160, 109, 32, 118, 105, 225, 187, 135, 99))
$script:strTamNghi     = [System.Text.Encoding]::UTF8.GetString([byte[]](84, 225, 186, 161, 109, 32, 110, 103, 104, 225, 187, 137))
$script:strNghiViec    = [System.Text.Encoding]::UTF8.GetString([byte[]](78, 103, 104, 225, 187, 137, 32, 118, 105, 225, 187, 135, 99))

function Normalize-EmpStatus {
    param([string]$rawStatus)
    if (-not $rawStatus) { return $script:strDangLamViec }
    $clean = $rawStatus.Trim()
    if ($clean -eq "Kích hoạt" -or $clean -eq "kich hoat") { return $script:strDangLamViec }
    
    $lower = $clean.ToLower()
    if ($clean.StartsWith("T") -or $clean.StartsWith("t") -or $lower.Contains("tạm") -or $lower.Contains("tam")) {
        return $script:strTamNghi
    }
    if ($clean.StartsWith("N") -or $clean.StartsWith("n") -or $lower.Contains("nghỉ") -or $lower.Contains("nghi") -or $lower.Contains("chuyển")) {
        return $script:strNghiViec
    }
    return $script:strDangLamViec
}

# ----------------------------------------------------------------------
# CONFLICT RESOLUTION & LOCK CONTROL
# ----------------------------------------------------------------------
$script:isLocking = $false

function Acquire-FileLock {
    $timeout = 50
    while ($script:isLocking -and $timeout -gt 0) {
        Start-Sleep -Milliseconds 100
        $timeout--
    }
    $script:isLocking = $true
}

function Release-FileLock {
    $script:isLocking = $false
}

function Get-ExcelFileStatus {
    param([string]$FilePath)
    if (Test-Path $FilePath) {
        $item = Get-Item $FilePath
        return @{
            lastModified = $item.LastWriteTimeUtc.ToString("yyyy-MM-ddTHH:mm:ss.fffZ")
            ticks = $item.LastWriteTimeUtc.Ticks
            size = $item.Length
        }
    }
    return @{ lastModified = ""; ticks = 0; size = 0 }
}

# ----------------------------------------------------------------------
# EXCEL READ & WRITE HELPER FUNCTIONS
# ----------------------------------------------------------------------
function Format-ExcelDate {
    param($val)
    if (-not $val) { return "" }
    $strVal = [string]$val
    $num = 0.0
    if ([double]::TryParse($strVal, [ref]$num)) {
        if ($num -gt 1000 -and $num -lt 100000) {
            try {
                $baseDate = Get-Date "1899-12-30"
                $convertedDate = $baseDate.AddDays([math]::Floor($num))
                return $convertedDate.ToString("yyyy-MM-dd")
            } catch {
                return $strVal
            }
        }
    }
    return $strVal
}

function Get-ExcelData {
    param([string]$FilePath)
    Acquire-FileLock
    $excel = New-Object -ComObject Excel.Application
    $excel.Visible = $false
    $excel.DisplayAlerts = $false
    try {
        $workbook = $excel.Workbooks.Open($FilePath, $false, $true)
        
        # 1. Read Tasks
        $tasksSheet = $workbook.Sheets.Item("Tasks")
        $usedTasks = $tasksSheet.UsedRange
        $taskData = $usedTasks.Value2
        $taskRows = $taskData.GetLength(0)
        
        $tasks = @()
        $id = 1
        for ($r = 4; $r -le $taskRows; $r++) {
            $so_cong_van = [string]$taskData[$r, 2]
            $ten_cong_viec = [string]$taskData[$r, 3]
            if (-not $so_cong_van -and -not $ten_cong_viec) { continue }
            
            $tasks += @{
                id = $id
                excel_row = $r
                noi_ban_hanh = [string]$taskData[$r, 1]
                so_cong_van = $so_cong_van
                ten_cong_viec = $ten_cong_viec
                mo_ta = [string]$taskData[$r, 4]
                phong_ban = [string]$taskData[$r, 5]
                nguoi_phu_trach = [string]$taskData[$r, 6]
                ngay_tao = Format-ExcelDate $taskData[$r, 7]
                deadline = Format-ExcelDate $taskData[$r, 8]
                ngay_hoan_thanh = Format-ExcelDate $taskData[$r, 9]
                trang_thai = [string]$taskData[$r, 10]
                ket_qua = [string]$taskData[$r, 11]
                ghi_chu = [string]$taskData[$r, 12]
                so_ngay_con_lai = [string]$taskData[$r, 13]
                so_ngay_tre = [string]$taskData[$r, 14]
                danh_gia = [string]$taskData[$r, 15]
            }
            $id++
        }
        
        # 2. Read Employees (A=Mã NV, B=Họ tên, C=Phòng ban, D=Chức vụ, E=Trạng thái)
        $empSheet = $workbook.Sheets.Item("Employees")
        $usedEmp = $empSheet.UsedRange
        $empData = $usedEmp.Value2
        $empRows = if ($empData -is [System.Array]) { $empData.GetLength(0) } else { 0 }
        
        $employees = @()
        for ($r = 4; $r -le $empRows; $r++) {
            $ma_nv = [string]$empData[$r, 1]
            $ho_ten = [string]$empData[$r, 2]
            if (-not $ma_nv -and -not $ho_ten) { continue }
            
            # Read Column 5 (E) as status (trang_thai / ghi_chu)
            $statusVal = [string]$empData[$r, 5]
            if (-not $statusVal -or $statusVal.Trim() -eq "") {
                # Fallback check Column 7 if old data exists
                $statusVal = [string]$empData[$r, 7]
            }
            $cleanStatus = Normalize-EmpStatus $statusVal

            $employees += @{
                ma_nv = $ma_nv
                ho_ten = $ho_ten
                phong_ban = [string]$empData[$r, 3]
                chuc_vu = [string]$empData[$r, 4]
                trang_thai = $cleanStatus
                ghi_chu = $cleanStatus
            }
        }
        
        # 3. Read Settings (Categories & Users - Departments explicitly from A4:A6)
        $setSheet = $workbook.Sheets.Item("Settings")
        $usedSet = $setSheet.UsedRange
        $setData = $usedSet.Value2
        $setRows = $setData.GetLength(0)
        
        $departments = @()
        for ($r = 4; $r -le [Math]::Min(6, $setRows); $r++) {
            $deptVal = [string]$setData[$r, 1]
            if ($deptVal -and $deptVal.Trim() -ne "") {
                $departments += $deptVal.Trim()
            }
        }

        $agencies = @()
        for ($r = 4; $r -le $setRows; $r++) {
            $agVal = [string]$setData[$r, 7]
            if ($agVal -and $agVal.Trim() -ne "") {
                $agencies += $agVal.Trim()
            }
        }

        # Read Employee Statuses from Settings Column E (Column 5)
        $empStatuses = @()
        for ($r = 4; $r -le $setRows; $r++) {
            $stVal = [string]$setData[$r, 5]
            if ($stVal -and $stVal.Trim() -ne "") {
                $empStatuses += $stVal.Trim()
            }
        }
        if ($empStatuses.Count -eq 0) {
            $empStatuses = @('Đang làm việc', 'Tạm nghỉ', 'Nghỉ việc')
        }

        $users = @()
        for ($r = 4; $r -le $setRows; $r++) {
            $u_name = [string]$setData[$r, 11]
            if ($u_name) {
                $users += @{
                    username = $u_name
                    password = [string]$setData[$r, 12]
                    department = [string]$setData[$r, 13]
                    role = [string]$setData[$r, 14]
                    name = [string]$setData[$r, 15]
                }
            }
        }
        
        $status = Get-ExcelFileStatus -FilePath $FilePath
        return @{
            tasks = $tasks
            employees = $employees
            categories = @{ departments = $departments; agencies = $agencies; empStatuses = $empStatuses }
            users = $users
            fileStatus = $status
        }
    } finally {
        $workbook.Close($false)
        $excel.Quit()
        [System.Runtime.InteropServices.Marshal]::ReleaseComObject($excel) | Out-Null
        Release-FileLock
    }
}

function Add-ExcelItem {
    param([string]$FilePath, [string]$Type, $Data)
    Acquire-FileLock
    $excel = New-Object -ComObject Excel.Application
    $excel.Visible = $false
    $excel.DisplayAlerts = $false
    try {
        $workbook = $excel.Workbooks.Open($FilePath, $false, $false)
        if ($workbook.ReadOnly) {
            $workbook.Close($false)
            $excel.Quit()
            [System.Runtime.InteropServices.Marshal]::ReleaseComObject($excel) | Out-Null
            Get-Process EXCEL -ErrorAction SilentlyContinue | Where-Object { $_.MainWindowTitle -eq "" } | Stop-Process -Force -ErrorAction SilentlyContinue
            Start-Sleep -Milliseconds 200
            $excel = New-Object -ComObject Excel.Application
            $excel.Visible = $false
            $excel.DisplayAlerts = $false
            $workbook = $excel.Workbooks.Open($FilePath, $false, $false)
        }
        if ($workbook.ReadOnly) {
            throw "File Excel đang bị khóa ở chế độ Read-Only bởi tiến trình khác trên hệ thống."
        }
        if ($Type -eq 'agencies') {
            $sheet = $workbook.Sheets.Item("Settings")
            
            $agencyName = ""
            if ($Data -is [hashtable] -or $Data -is [PSCustomObject]) {
                if ($Data.name) { $agencyName = [string]$Data.name }
                elseif ($Data.noi_ban_hanh) { $agencyName = [string]$Data.noi_ban_hanh }
                elseif ($Data.agency) { $agencyName = [string]$Data.agency }
            } else {
                $agencyName = [string]$Data
            }
            $agencyName = $agencyName.Trim()
            if (-not $agencyName) {
                throw "Tên Nơi ban hành không được để rỗng."
            }

            # Find first empty cell in Column G (Column 7) starting at Row 4
            $targetRow = 4
            while ($targetRow -le 200) {
                $existingVal = [string]($sheet.Cells.Item($targetRow, 7).Value2)
                if (-not $existingVal -or $existingVal.Trim() -eq "") {
                    break
                }
                $targetRow++
            }

            $sheet.Cells.Item($targetRow, 7).Value2 = $agencyName
            
            $workbook.Save()
            $status = Get-ExcelFileStatus -FilePath $FilePath
            return @{ success = $true; name = $agencyName; excel_row = $targetRow; message = "Added agency successfully"; fileStatus = $status }
        }
        elseif ($Type -eq 'employees') {
            $sheet = $workbook.Sheets.Item("Employees")
            
            $targetRow = 4
            $maxMaNum = 0
            while ($targetRow -le 500) {
                $maNVVal = [string]($sheet.Cells.Item($targetRow, 1).Value2)
                $hoTenVal = [string]($sheet.Cells.Item($targetRow, 2).Value2)
                if ($maNVVal -and $maNVVal.Trim() -ne "") {
                    $cleanVal = $maNVVal.Trim()
                    $numMatch = [regex]::Match($cleanVal, '\d+')
                    if ($numMatch.Success) {
                        $parsedNum = [int]$numMatch.Value
                        if ($parsedNum -gt $maxMaNum) { $maxMaNum = $parsedNum }
                    }
                }
                if ((-not $maNVVal -or $maNVVal.Trim() -eq "") -and (-not $hoTenVal -or $hoTenVal.Trim() -eq "")) {
                    break
                }
                $targetRow++
            }

            $nextMaNum = $maxMaNum + 1
            $generatedMaNV = "NV" + ($nextMaNum.ToString("D3"))

            $ma_nv = if ($Data.ma_nv -and ([string]$Data.ma_nv).Trim() -ne "") { [string]$Data.ma_nv } else { $generatedMaNV }
            $ho_ten = if ($Data.ho_ten) { [string]$Data.ho_ten } else { "" }
            $phong_ban = if ($Data.phong_ban) { [string]$Data.phong_ban } else { "" }
            $chuc_vu = if ($Data.chuc_vu) { [string]$Data.chuc_vu } else { "" }
            $sdt = if ($Data.sdt) { [string]$Data.sdt } else { "" }
            $email = if ($Data.email) { [string]$Data.email } else { "" }
            $rawSt = if ($Data.trang_thai) { [string]$Data.trang_thai } elseif ($Data.ghi_chu) { [string]$Data.ghi_chu } else { "" }
            $ghi_chu = Normalize-EmpStatus $rawSt

            $sheet.Cells.Item($targetRow, 1).Value2 = $ma_nv.Trim()
            $sheet.Cells.Item($targetRow, 2).Value2 = $ho_ten.Trim()
            $sheet.Cells.Item($targetRow, 3).Value2 = $phong_ban.Trim()
            $sheet.Cells.Item($targetRow, 4).Value2 = $chuc_vu.Trim()
            $sheet.Cells.Item($targetRow, 5).Value2 = $ghi_chu

            $workbook.Save()
            $status = Get-ExcelFileStatus -FilePath $FilePath
            return @{ success = $true; ma_nv = $ma_nv; excel_row = $targetRow; message = "Added employee successfully"; fileStatus = $status }
        }
        elseif ($Type -eq 'users') {
            $sheet = $workbook.Sheets.Item("Settings")
            $usedSet = $sheet.UsedRange
            $setRows = $usedSet.Rows.Count
            $newRow = $setRows + 1
            if ($newRow -lt 4) { $newRow = 4 }
            
            $sheet.Cells.Item($newRow, 11).Value2 = [string]$Data.username
            $sheet.Cells.Item($newRow, 12).Value2 = [string]$Data.password
            $sheet.Cells.Item($newRow, 13).Value2 = [string]$Data.department
            $sheet.Cells.Item($newRow, 14).Value2 = [string]$Data.role
            $sheet.Cells.Item($newRow, 15).Value2 = [string]$Data.name
            
            $workbook.Save()
            $status = Get-ExcelFileStatus -FilePath $FilePath
            return @{ success = $true; username = $Data.username; message = "Added user successfully"; fileStatus = $status }
        }
        else {
            # Default: Tasks
            $sheet = $workbook.Sheets.Item("Tasks")
            $usedTasks = $sheet.UsedRange
            $taskRows = $usedTasks.Rows.Count
            $newRow = $taskRows + 1
            if ($newRow -lt 4) { $newRow = 4 }
            
            $statusVal = if ($Data.trang_thai) { $Data.trang_thai } else { 'Đang thực hiện' }
            $ratingVal = if ($Data.danh_gia) { $Data.danh_gia } else { '--' }
            
            $sheet.Cells.Item($newRow, 1).Value2 = [string]$Data.noi_ban_hanh
            $sheet.Cells.Item($newRow, 2).Value2 = [string]$Data.so_cong_van
            $sheet.Cells.Item($newRow, 3).Value2 = [string]$Data.ten_cong_viec
            $sheet.Cells.Item($newRow, 4).Value2 = [string]$Data.mo_ta
            $sheet.Cells.Item($newRow, 5).Value2 = [string]$Data.phong_ban
            $sheet.Cells.Item($newRow, 6).Value2 = [string]$Data.nguoi_phu_trach
            $sheet.Cells.Item($newRow, 7).Value2 = [string]$Data.ngay_tao
            $sheet.Cells.Item($newRow, 8).Value2 = [string]$Data.deadline
            $sheet.Cells.Item($newRow, 9).Value2 = [string]$Data.ngay_hoan_thanh
            $sheet.Cells.Item($newRow, 10).Value2 = [string]$statusVal
            $sheet.Cells.Item($newRow, 11).Value2 = [string]$Data.ket_qua
            $sheet.Cells.Item($newRow, 12).Value2 = [string]$Data.ghi_chu
            $sheet.Cells.Item($newRow, 15).Value2 = [string]$ratingVal
            
            $workbook.Save()
            $status = Get-ExcelFileStatus -FilePath $FilePath
            return @{ success = $true; id = ($newRow - 3); excel_row = $newRow; message = "Added task successfully"; fileStatus = $status }
        }
    } finally {
        $workbook.Close($true)
        $excel.Quit()
        [System.Runtime.InteropServices.Marshal]::ReleaseComObject($excel) | Out-Null
        Release-FileLock
    }
}

function Update-ExcelItem {
    param([string]$FilePath, [string]$Type, $Data)
    
    if (-not $Data) {
        throw "Dữ liệu cập nhật (payload) không hợp lệ hoặc bị rỗng."
    }

    Acquire-FileLock
    $excel = New-Object -ComObject Excel.Application
    $excel.Visible = $false
    $excel.DisplayAlerts = $false
    try {
        $workbook = $excel.Workbooks.Open($FilePath, $false, $false)
        if ($workbook.ReadOnly) {
            $workbook.Close($false)
            $excel.Quit()
            [System.Runtime.InteropServices.Marshal]::ReleaseComObject($excel) | Out-Null
            Get-Process EXCEL -ErrorAction SilentlyContinue | Where-Object { $_.MainWindowTitle -eq "" } | Stop-Process -Force -ErrorAction SilentlyContinue
            Start-Sleep -Milliseconds 200
            $excel = New-Object -ComObject Excel.Application
            $excel.Visible = $false
            $excel.DisplayAlerts = $false
            $workbook = $excel.Workbooks.Open($FilePath, $false, $false)
        }
        if ($workbook.ReadOnly) {
            throw "File Excel đang bị khóa ở chế độ Read-Only bởi tiến trình khác trên hệ thống."
        }
        if ($Type -eq 'agencies') {
            $sheet = $workbook.Sheets.Item("Settings")
            
            $oldName = ""
            $newName = ""
            if ($Data -is [hashtable] -or $Data -is [PSCustomObject]) {
                if ($Data.oldName) { $oldName = [string]$Data.oldName }
                if ($Data.newName) { $newName = [string]$Data.newName }
                if (-not $oldName -and $Data.name) { $oldName = [string]$Data.name }
            }
            $oldName = $oldName.Trim()
            $newName = $newName.Trim()

            if ($oldName -and $newName) {
                $r = 4
                while ($r -le 200) {
                    $cellVal = [string]($sheet.Cells.Item($r, 7).Value2)
                    if ($cellVal.Trim() -eq $oldName) {
                        $sheet.Cells.Item($r, 7).Value2 = $newName
                        break
                    }
                    if (-not $cellVal -and $r -gt 50) { break }
                    $r++
                }
            }

            $workbook.Save()
            $status = Get-ExcelFileStatus -FilePath $FilePath
            return @{ success = $true; oldName = $oldName; newName = $newName; message = "Updated agency successfully"; fileStatus = $status }
        }
        elseif ($Type -eq 'employees') {
            $sheet = $workbook.Sheets.Item("Employees")
            
            $targetMaNV = if ($Data.ma_nv) { ([string]$Data.ma_nv).Trim() } elseif ($Data.id) { ([string]$Data.id).Trim() } else { "" }
            $targetRow = 0

            if ($targetMaNV) {
                $targetNum = 0
                $numMatch = [regex]::Match($targetMaNV, '\d+')
                if ($numMatch.Success) { $targetNum = [int]$numMatch.Value }

                $r = 4
                while ($r -le 500) {
                    $cellMaNV = ([string]($sheet.Cells.Item($r, 1).Value2)).Trim()
                    if (-not $cellMaNV) {
                        $cellMaNV = ([string]($sheet.Cells.Item($r, 1).Text)).Trim()
                    }
                    if ($cellMaNV -and $cellMaNV.ToLower() -eq $targetMaNV.ToLower()) {
                        $targetRow = $r
                        break
                    }

                    # Fallback for empty Column A matching row offset (row 4 + index)
                    if (-not $cellMaNV -and $targetNum -gt 0 -and ($r - 4) -eq $targetNum) {
                        $targetRow = $r
                        break
                    }

                    $cellHoTen = ([string]($sheet.Cells.Item($r, 2).Value2)).Trim()
                    if (-not $cellMaNV -and -not $cellHoTen -and $r -gt ($targetNum + 10)) { break }
                    $r++
                }
            }

            if ($targetRow -lt 4) {
                throw "Không tìm thấy công chức có Mã NV '$targetMaNV' trong sheet Employees để cập nhật!"
            }

            # Write Column A (Mã NV) explicitly to ensure no empty ID cells
            $sheet.Cells.Item($targetRow, 1).Value2 = $targetMaNV.Trim()
            if ($Data.ho_ten -ne $null) { $sheet.Cells.Item($targetRow, 2).Value2 = ([string]$Data.ho_ten).Trim() }
            if ($Data.phong_ban -ne $null) { $sheet.Cells.Item($targetRow, 3).Value2 = ([string]$Data.phong_ban).Trim() }
            if ($Data.chuc_vu -ne $null) { $sheet.Cells.Item($targetRow, 4).Value2 = ([string]$Data.chuc_vu).Trim() }
            
            # Write status strictly to Column E (Column 5)
            $statusVal = if ($Data.trang_thai -ne $null) { [string]$Data.trang_thai } elseif ($Data.ghi_chu -ne $null) { [string]$Data.ghi_chu } else { $null }
            if ($statusVal -ne $null) {
                $cleanSt = Normalize-EmpStatus $statusVal
                $sheet.Cells.Item($targetRow, 5).Value2 = $cleanSt
            }

            $workbook.Save()
            $status = Get-ExcelFileStatus -FilePath $FilePath
            return @{ success = $true; ma_nv = $targetMaNV; excel_row = $targetRow; message = "Updated employee successfully"; fileStatus = $status }
        }
        elseif ($Type -eq 'users') {
            $sheet = $workbook.Sheets.Item("Settings")
            $usedSet = $sheet.UsedRange
            $setData = $usedSet.Value2
            $setRows = if ($setData -is [System.Array]) { $setData.GetLength(0) } else { 0 }
            
            $targetUser = ([string]$Data.username).Trim()
            if ($targetUser) {
                for ($r = 4; $r -le $setRows; $r++) {
                    $uName = ([string]$setData[$r, 11]).Trim()
                    if ($uName -eq $targetUser) {
                        if ($Data.password) { $sheet.Cells.Item($r, 12).Value2 = [string]$Data.password }
                        if ($Data.department) { $sheet.Cells.Item($r, 13).Value2 = [string]$Data.department }
                        if ($Data.role) { $sheet.Cells.Item($r, 14).Value2 = [string]$Data.role }
                        if ($Data.name) { $sheet.Cells.Item($r, 15).Value2 = [string]$Data.name }
                        break
                    }
                }
            }
            $workbook.Save()
            $status = Get-ExcelFileStatus -FilePath $FilePath
            return @{ success = $true; username = $Data.username; message = "Updated user successfully"; fileStatus = $status }
        }
        else {
            # Default: Tasks
            $sheet = $workbook.Sheets.Item("Tasks")
            $usedTasks = $sheet.UsedRange
            $taskData = $usedTasks.Value2
            $taskRows = if ($taskData -is [System.Array]) { $taskData.GetLength(0) } else { 0 }
            
            $targetRow = 0
            $cleanSoCV = ([string]$Data.so_cong_van).Trim()
            $reqExcelRow = 0
            if ($Data.excel_row -and [int]::TryParse([string]$Data.excel_row, [ref]$reqExcelRow)) {
                if ($reqExcelRow -ge 4 -and $reqExcelRow -le $taskRows) {
                    $soCVInRow = ([string]$taskData[$reqExcelRow, 2]).Trim()
                    if (-not $cleanSoCV -or $soCVInRow -eq $cleanSoCV) {
                        $targetRow = $reqExcelRow
                    }
                }
            }

            # 2. Match by so_cong_van if targetRow not set
            if ($targetRow -eq 0 -and $cleanSoCV) {
                for ($r = 4; $r -le $taskRows; $r++) {
                    $cellSoCV = ([string]$taskData[$r, 2]).Trim()
                    if ($cellSoCV -and $cellSoCV -eq $cleanSoCV) {
                        $targetRow = $r
                        break
                    }
                }
            }

            # 3. Match by task id index if targetRow not set
            $reqId = 0
            if ($targetRow -eq 0 -and $Data.id -and [int]::TryParse([string]$Data.id, [ref]$reqId)) {
                $currentId = 1
                for ($r = 4; $r -le $taskRows; $r++) {
                    $soCV = ([string]$taskData[$r, 2]).Trim()
                    $tenCV = ([string]$taskData[$r, 3]).Trim()
                    if (-not $soCV -and -not $tenCV) { continue }
                    if ($currentId -eq $reqId) {
                        $targetRow = $r
                        break
                    }
                    $currentId++
                }
            }

            # 4. Fallback: id + 3
            if ($targetRow -eq 0 -and $reqId -gt 0) {
                $targetRow = $reqId + 3
            }

            if ($targetRow -ge 4) {
                if ($Data.noi_ban_hanh -ne $null) { $sheet.Cells.Item($targetRow, 1).Value2 = [string]$Data.noi_ban_hanh }
                if ($Data.so_cong_van -ne $null) { $sheet.Cells.Item($targetRow, 2).Value2 = [string]$Data.so_cong_van }
                if ($Data.ten_cong_viec -ne $null) { $sheet.Cells.Item($targetRow, 3).Value2 = [string]$Data.ten_cong_viec }
                if ($Data.mo_ta -ne $null) { $sheet.Cells.Item($targetRow, 4).Value2 = [string]$Data.mo_ta }
                if ($Data.phong_ban -ne $null) { $sheet.Cells.Item($targetRow, 5).Value2 = [string]$Data.phong_ban }
                if ($Data.nguoi_phu_trach -ne $null) { $sheet.Cells.Item($targetRow, 6).Value2 = [string]$Data.nguoi_phu_trach }
                if ($Data.ngay_tao -ne $null) { $sheet.Cells.Item($targetRow, 7).Value2 = [string]$Data.ngay_tao }
                if ($Data.deadline -ne $null) { $sheet.Cells.Item($targetRow, 8).Value2 = [string]$Data.deadline }
                if ($Data.ngay_hoan_thanh -ne $null) { $sheet.Cells.Item($targetRow, 9).Value2 = [string]$Data.ngay_hoan_thanh }
                if ($Data.trang_thai -ne $null) { $sheet.Cells.Item($targetRow, 10).Value2 = [string]$Data.trang_thai }
                if ($Data.ket_qua -ne $null) { $sheet.Cells.Item($targetRow, 11).Value2 = [string]$Data.ket_qua }
                if ($Data.ghi_chu -ne $null) { $sheet.Cells.Item($targetRow, 12).Value2 = [string]$Data.ghi_chu }

                # Update rating (danh_gia) in column 15 if completed or explicit rating
                if ($Data.danh_gia -ne $null -and [string]$Data.danh_gia -ne '') {
                    $sheet.Cells.Item($targetRow, 15).Value2 = [string]$Data.danh_gia
                } elseif ($Data.trang_thai -and ([string]$Data.trang_thai) -like '*Ho*n th*nh*') {
                    $sheet.Cells.Item($targetRow, 15).Value2 = [string]"T" + [char]0x1ED1 + "t"
                }
            }

            $workbook.Save()
            $status = Get-ExcelFileStatus -FilePath $FilePath
            return @{ success = $true; id = $Data.id; excel_row = $targetRow; message = "Updated task successfully"; fileStatus = $status }
        }
    } finally {
        if ($workbook) { try { $workbook.Close($true) } catch {} }
        if ($excel) { try { $excel.Quit() } catch {} [System.Runtime.InteropServices.Marshal]::ReleaseComObject($excel) | Out-Null }
        [System.GC]::Collect()
        Release-FileLock
    }
}

function Delete-ExcelItem {
    param([string]$FilePath, [string]$Type, $Id, $Data)
    Acquire-FileLock
    $excel = New-Object -ComObject Excel.Application
    $excel.Visible = $false
    $excel.DisplayAlerts = $false
    try {
        $workbook = $excel.Workbooks.Open($FilePath, $false, $false)
        if ($workbook.ReadOnly) {
            $workbook.Close($false)
            $excel.Quit()
            [System.Runtime.InteropServices.Marshal]::ReleaseComObject($excel) | Out-Null
            Get-Process EXCEL -ErrorAction SilentlyContinue | Where-Object { $_.MainWindowTitle -eq "" } | Stop-Process -Force -ErrorAction SilentlyContinue
            Start-Sleep -Milliseconds 200
            $excel = New-Object -ComObject Excel.Application
            $excel.Visible = $false
            $excel.DisplayAlerts = $false
            $workbook = $excel.Workbooks.Open($FilePath, $false, $false)
        }
        if ($workbook.ReadOnly) {
            throw "File Excel đang bị khóa ở chế độ Read-Only bởi tiến trình khác trên hệ thống."
        }
        if ($Type -eq 'agencies') {
            $sheet = $workbook.Sheets.Item("Settings")
            
            $targetName = ""
            if ($Data -and ($Data -is [hashtable] -or $Data -is [PSCustomObject])) {
                if ($Data.name) { $targetName = [string]$Data.name }
                elseif ($Data.oldName) { $targetName = [string]$Data.oldName }
            }
            if (-not $targetName -and $Id) {
                $targetName = [string]$Id
            }
            $targetName = $targetName.Trim()

            if ($targetName) {
                $r = 4
                while ($r -le 200) {
                    $cellVal = [string]($sheet.Cells.Item($r, 7).Value2)
                    if ($cellVal.Trim() -eq $targetName) {
                        $sheet.Cells.Item($r, 7).ClearContents()
                        break
                    }
                    if (-not $cellVal -and $r -gt 50) { break }
                    $r++
                }
            }

            $workbook.Save()
            $status = Get-ExcelFileStatus -FilePath $FilePath
            return @{ success = $true; name = $targetName; message = "Deleted agency successfully"; fileStatus = $status }
        }
        elseif ($Type -eq 'employees') {
            $sheet = $workbook.Sheets.Item("Employees")
            
            $targetMaNV = if ($Data -and $Data.ma_nv) { ([string]$Data.ma_nv).Trim() } else { ([string]$Id).Trim() }
            $targetRow = 0

            if ($targetMaNV) {
                $targetNum = 0
                $numMatch = [regex]::Match($targetMaNV, '\d+')
                if ($numMatch.Success) { $targetNum = [int]$numMatch.Value }

                $r = 4
                while ($r -le 500) {
                    $cellMaNV = ([string]($sheet.Cells.Item($r, 1).Value2)).Trim()
                    if (-not $cellMaNV) {
                        $cellMaNV = ([string]($sheet.Cells.Item($r, 1).Text)).Trim()
                    }
                    if ($cellMaNV -and $cellMaNV.ToLower() -eq $targetMaNV.ToLower()) {
                        $targetRow = $r
                        break
                    }

                    # Fallback for empty Column A matching row offset
                    if (-not $cellMaNV -and $targetNum -gt 0 -and ($r - 4) -eq $targetNum) {
                        $targetRow = $r
                        break
                    }

                    $cellHoTen = ([string]($sheet.Cells.Item($r, 2).Value2)).Trim()
                    if (-not $cellMaNV -and -not $cellHoTen -and $r -gt ($targetNum + 10)) { break }
                    $r++
                }
            }

            if ($targetRow -lt 4) {
                throw "Không tìm thấy công chức có Mã NV '$targetMaNV' trong sheet Employees để xóa!"
            }

            # Delete entire row and shift subsequent rows up
            $sheet.Rows.Item($targetRow).Delete()

            $workbook.Save()
            $status = Get-ExcelFileStatus -FilePath $FilePath
            return @{ success = $true; ma_nv = $targetMaNV; excel_row = $targetRow; message = "Deleted employee successfully"; fileStatus = $status }
        }
        elseif ($Type -eq 'users') {
            $sheet = $workbook.Sheets.Item("Settings")
            $usedSet = $sheet.UsedRange
            $setData = $usedSet.Value2
            $setRows = $setData.GetLength(0)
            for ($r = 4; $r -le $setRows; $r++) {
                if ([string]$setData[$r, 11] -eq [string]$Id -or ($Data -and [string]$setData[$r, 11] -eq [string]$Data.username)) {
                    $sheet.Range("K$r:O$r").ClearContents()
                    break
                }
            }
            $workbook.Save()
            $status = Get-ExcelFileStatus -FilePath $FilePath
            return @{ success = $true; id = $Id; message = "Deleted user successfully"; fileStatus = $status }
        }
        else {
            # Default: Tasks
            $sheet = $workbook.Sheets.Item("Tasks")
            $usedTasks = $sheet.UsedRange
            $taskData = $usedTasks.Value2
            $taskRows = $taskData.GetLength(0)

            $targetRow = 0

            if ($Data -and $Data.excel_row -and [int]$Data.excel_row -ge 4 -and [int]$Data.excel_row -le $taskRows) {
                $targetRow = [int]$Data.excel_row
            }

            if ($targetRow -eq 0 -and $Data -and $Data.so_cong_van) {
                $cleanSoCV = [string]$Data.so_cong_van.Trim()
                for ($r = 4; $r -le $taskRows; $r++) {
                    $cellSoCV = [string]$taskData[$r, 2]
                    if ($cellSoCV -and $cellSoCV.Trim() -eq $cleanSoCV) {
                        $targetRow = $r
                        break
                    }
                }
            }

            if ($targetRow -eq 0 -and $Id) {
                $targetId = [int]$Id
                $currentId = 1
                for ($r = 4; $r -le $taskRows; $r++) {
                    $soCV = [string]$taskData[$r, 2]
                    $tenCV = [string]$taskData[$r, 3]
                    if (-not $soCV -and -not $tenCV) { continue }
                    if ($currentId -eq $targetId) {
                        $targetRow = $r
                        break
                    }
                    $currentId++
                }
            }

            if ($targetRow -eq 0 -and $Id) {
                $targetRow = [int]$Id + 3
            }

            if ($targetRow -ge 4) {
                $sheet.Rows.Item($targetRow).Delete()
            }

            $workbook.Save()
            $status = Get-ExcelFileStatus -FilePath $FilePath
            return @{ success = $true; id = $Id; message = "Deleted task successfully"; fileStatus = $status }
        }
    } finally {
        $workbook.Close($true)
        $excel.Quit()
        [System.Runtime.InteropServices.Marshal]::ReleaseComObject($excel) | Out-Null
        Release-FileLock
    }
}

# ----------------------------------------------------------------------
# MAIN HTTP SERVER LOOP
# ----------------------------------------------------------------------
try {
    while ($listener.IsListening) {
        try {
            $context = $listener.GetContext()
            $request = $context.Request
            $response = $context.Response
            
            # CORS Headers
            $response.AddHeader("Access-Control-Allow-Origin", "*")
            $response.AddHeader("Access-Control-Allow-Methods", "GET, POST, PUT, DELETE, OPTIONS")
            $response.AddHeader("Access-Control-Allow-Headers", "Content-Type, Authorization")
            
            if ($request.HttpMethod -eq "OPTIONS") {
                $response.StatusCode = 200
                $response.Close()
                continue
            }
            
            $localPath = $request.Url.LocalPath
            
            # ------------------------------------------------------------------
            # API ENDPOINTS
            # ------------------------------------------------------------------
            if ($localPath.StartsWith("/api/")) {
                $response.ContentType = "application/json; charset=utf-8"
                
                # Parse Body if present
                $bodyObj = $null
                if ($request.HasEntityBody) {
                    $reader = New-Object System.IO.StreamReader($request.InputStream, [System.Text.Encoding]::UTF8)
                    $bodyText = $reader.ReadToEnd()
                    $reader.Close()
                    if ($bodyText) {
                        $bodyObj = ConvertFrom-Json $bodyText
                    }
                }
                
                $resultObj = $null
                try {
                    switch ($localPath) {
                        "/api/status" {
                            $resultObj = Get-ExcelFileStatus -FilePath $excelPath
                        }
                        "/api/data" {
                            $resultObj = Get-ExcelData -FilePath $excelPath
                        }
                        "/api/add" {
                            $type = if ($bodyObj.type) { $bodyObj.type } else { 'tasks' }
                            $resultObj = Add-ExcelItem -FilePath $excelPath -Type $type -Data $bodyObj.data
                        }
                        "/api/update" {
                            $type = if ($bodyObj.type) { $bodyObj.type } else { 'tasks' }
                            $resultObj = Update-ExcelItem -FilePath $excelPath -Type $type -Data $bodyObj.data
                        }
                        "/api/delete" {
                            $type = if ($bodyObj.type) { $bodyObj.type } else { 'tasks' }
                            $id = if ($bodyObj.id) { $bodyObj.id } else { $bodyObj.data.id }
                            $resultObj = Delete-ExcelItem -FilePath $excelPath -Type $type -Id $id -Data $bodyObj.data
                        }
                        default {
                            $response.StatusCode = 404
                            $resultObj = @{ error = "Endpoint not found" }
                        }
                    }
                } catch {
                    $errMsg = $_.Exception.Message
                    $errStackTrace = $_.ScriptStackTrace
                    Write-Host "==========================================================" -ForegroundColor Red
                    Write-Host "[SERVER ERROR 500] Endpoint: $localPath" -ForegroundColor Red
                    Write-Host " Error Message : $errMsg" -ForegroundColor Red
                    Write-Host " ScriptTrace   : $errStackTrace" -ForegroundColor Yellow
                    Write-Host "==========================================================" -ForegroundColor Red
                    
                    $response.StatusCode = 500
                    $resultObj = @{
                        success = $false
                        error = $errMsg
                        stackTrace = $errStackTrace
                    }
                }
                
                $jsonString = ConvertTo-Json $resultObj -Depth 10 -Compress
                $buffer = [System.Text.Encoding]::UTF8.GetBytes($jsonString)
                $response.OutputStream.Write($buffer, 0, $buffer.Length)
                $response.Close()
                continue
            }
            
            # ------------------------------------------------------------------
            # STATIC FILE & SPA ROUTE SERVING
            # ------------------------------------------------------------------
            if ($localPath -eq "/") { $localPath = "/index.html" }
            $relativeFilePath = $localPath.TrimStart('/').Replace('/', '\')
            $filePath = Join-Path $PSScriptRoot $relativeFilePath
            
            # SPA Fallback for non-file sub-paths (e.g. /quan-ly-cong-viec, /danh-muc/cong-chuc)
            if (-not (Test-Path $filePath -PathType Leaf) -and -not [System.IO.Path]::HasExtension($localPath)) {
                $filePath = Join-Path $PSScriptRoot "index.html"
            }

            if (Test-Path $filePath -PathType Leaf) {
                $ext = [System.IO.Path]::GetExtension($filePath).ToLower()
                if ($mimeTypes.ContainsKey($ext)) {
                    $response.ContentType = $mimeTypes[$ext]
                } else {
                    $response.ContentType = "text/html; charset=utf-8"
                }
                
                $buffer = [System.IO.File]::ReadAllBytes($filePath)
                $response.OutputStream.Write($buffer, 0, $buffer.Length)
            } else {
                $response.StatusCode = 404
                $buf = [System.Text.Encoding]::UTF8.GetBytes("404 Not Found")
                $response.OutputStream.Write($buf, 0, $buf.Length)
            }
            $response.Close()
        } catch {
            # Ignore transient connection errors
        }
    }
} finally {
    $listener.Stop()
}

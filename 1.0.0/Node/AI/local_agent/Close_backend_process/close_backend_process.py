# 关闭后端进程：关什么（端口）+ 怎么关（端口→PID→父进程PID→cmd 进程树）
# 职责：
#   1. 声明"要关哪些端口"——集中管理，ai_proxy 不关心
#   2. 杀进程的策略实现：PowerShell 从端口→LISTENING PID→父进程 PID→任务组杀（连 cmd 窗口一起关）
#   3. shutdown_all() —— 一键执行（延迟 0.5s 等响应发出）
# 边界：只杀进程，不碰 HTTP 路由（ai_proxy 管）
# 核心思路：不从窗口标题猜（MainWindowTitle 对 cmd 经常为空/wmic 也被移除），
#          从端口（最稳定事实）反查进程 PID，找到父进程 PID，按 /T 任务组杀→cmd+python 一起死。
# 用法：
#   from Close_backend_process.close_backend_process import shutdown_all
#   threading.Thread(target=shutdown_all, daemon=True).start()

import os
import subprocess
import time

# ========== 关什么：集中声明（改这里即可，ai_proxy 不关心） ==========
PORTS_TO_KILL = [8080, 5000]


# ========== 怎么关 ==========
def _kill_by_port_ps(port):
    """PowerShell：端口 → LISTENING PID → 父进程 PID → taskkill /T 整组杀（cmd 窗口 + python 一起关）
    返回 True 表示实际杀过（至少找到一个 PID），False 表示没找到或失败"""
    ps_cmd = r'''
$port = %d
$pids = @(Get-NetTCPConnection -LocalPort $port -State Listen -ErrorAction SilentlyContinue | ForEach-Object { $_.OwningProcess })
if (-not $pids) { exit 0 }
$seen = @{}
foreach ($pid in $pids) {
    if ($seen.ContainsKey($pid)) { continue }
    $seen[$pid] = $true
    # 找父进程 PID（cmd.exe 通常是 python 的父）
    $ppidCim = Get-CimInstance Win32_Process -Filter "ProcessId=$pid" -ErrorAction SilentlyContinue
    $ppid = if ($ppidCim) { $ppidCim.ParentProcessId } else { $null }
    if ($ppid -and $ppid -gt 0 -and -not $seen.ContainsKey($ppid)) {
        $parentProc = Get-Process -Id $ppid -ErrorAction SilentlyContinue
        if ($parentProc -and $parentProc.ProcessName -eq 'cmd') {
            $seen[$ppid] = $true
            Write-Output $ppid
            continue
        }
    }
    Write-Output $pid
}
''' % port
    try:
        out = subprocess.check_output(
            ['powershell', '-NoProfile', '-Command', ps_cmd],
            text=True, timeout=15
        )
        pids = [x.strip() for x in out.splitlines() if x.strip().isdigit()]
    except Exception:
        pids = []
    if not pids:
        return False
    ok = False
    for pid in pids:
        try:
            subprocess.run(['taskkill', '/F', '/T', '/PID', str(pid)],
                           capture_output=True, timeout=10)
            ok = True
        except Exception:
            pass
    return ok


def _kill_by_port_netstat(port):
    """降级：netstat -ano 找 LISTENING PID + Win32_Process 找父进程（PowerShell 失败时用）"""
    try:
        out = subprocess.check_output('netstat -ano', shell=True, text=True, timeout=10)
    except Exception:
        return False
    pids = []
    for line in out.splitlines():
        if f':{port}' in line and 'LISTENING' in line:
            parts = line.split()
            if len(parts) >= 5:
                pid = parts[-1]
                if pid.isdigit():
                    pids.append(int(pid))
    if not pids:
        return False
    # 每个 PID → 尝试找 cmd 父进程
    targets = set()
    for pid in pids:
        try:
            pp_out = subprocess.check_output(
                ['powershell', '-NoProfile', '-Command',
                 f'(Get-CimInstance Win32_Process -Filter "ProcessId={pid}").ParentProcessId'],
                text=True, timeout=5
            )
            pp = pp_out.strip().splitlines()
            if pp and pp[0].isdigit():
                targets.add(int(pp[0]))
        except Exception:
            pass
        targets.add(pid)
    # 先杀父（cmd），再兜底杀本身
    any_ok = False
    for pid in sorted(targets, reverse=True):
        try:
            subprocess.run(['taskkill', '/F', '/T', '/PID', str(pid)],
                           capture_output=True, timeout=10)
            any_ok = True
        except Exception:
            pass
    return any_ok


def shutdown_all():
    """关闭所有后端进程：端口→PID→父进程→进程组杀。延迟 0.5s 等响应先发出。"""
    time.sleep(0.5)
    for port in PORTS_TO_KILL:
        try:
            ok = _kill_by_port_ps(port)
            if not ok:
                _kill_by_port_netstat(port)
        except Exception:
            pass
    # 兜底自杀
    try:
        os._exit(0)
    except Exception:
        pass

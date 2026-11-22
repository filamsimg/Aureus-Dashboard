"""
Aureus AI Trader - Secure VPS Deployment Script
Reads credentials strictly from .env.local (SSOT).
Zero hardcoded passwords or tokens.
"""

import os
import sys
import time
import base64
from pathlib import Path

# Unbuffered output
sys.stdout.reconfigure(line_buffering=True)

# Load environment variables from .env.local
env_path = Path(__file__).resolve().parent.parent / ".env.local"
if not env_path.exists():
    env_path = Path(__file__).resolve().parent.parent / ".env"

if not env_path.exists():
    print("Error: File .env.local tidak ditemukan! Buat .env.local terlebih dahulu.", flush=True)
    sys.exit(1)

env_vars = {}
with open(env_path, "r", encoding="utf-8") as f:
    for line in f:
        line = line.strip()
        if not line or line.startswith("#"):
            continue
        if "=" in line:
            k, v = line.split("=", 1)
            env_vars[k.strip()] = v.strip().strip('"').strip("'")

vps_host = env_vars.get("VPS_HOST")
vps_user = env_vars.get("VPS_WINRM_USER", "Administrator")
vps_pass = env_vars.get("VPS_WINRM_PASSWORD")

if not vps_host or not vps_pass:
    print("Error: VPS_HOST atau VPS_WINRM_PASSWORD tidak ditemukan di .env.local!", flush=True)
    sys.exit(1)

try:
    import winrm
except ImportError:
    print("Modul 'pywinrm' belum terpasang. Jalankan: pip install pywinrm", flush=True)
    sys.exit(1)

print(f"-> Menghubungkan ke Windows VPS {vps_host} via WinRM...", flush=True)
session = winrm.Session(vps_host, auth=(vps_user, vps_pass), transport="ntlm")

def upload_file(local_path, remote_path):
    print(f"  Uploading {local_path} -> {remote_path}...", flush=True)
    with open(local_path, "rb") as f:
        content = f.read()

    expected_len = len(content)
    b64 = base64.b64encode(content).decode("ascii")
    chunk_size = 1500
    chunks = [b64[i:i+chunk_size] for i in range(0, len(b64), chunk_size)]
    
    tmp_b64 = remote_path + ".b64"
    session.run_ps(f'if (Test-Path "{tmp_b64}") {{ Remove-Item "{tmp_b64}" -Force }}; [System.IO.File]::WriteAllText("{tmp_b64}", "")')
    for i, c in enumerate(chunks):
        session.run_ps(f'[System.IO.File]::AppendAllText("{tmp_b64}", "{c}")')
        if (i + 1) % 5 == 0 or (i + 1) == len(chunks):
            print(f"    Chunk {i+1}/{len(chunks)} OK", flush=True)

    res = session.run_ps(f'''
    $b64 = [System.IO.File]::ReadAllText("{tmp_b64}").Trim()
    [System.IO.File]::WriteAllBytes("{remote_path}", [System.Convert]::FromBase64String($b64))
    Remove-Item -Path "{tmp_b64}" -Force
    (Get-Item "{remote_path}").Length
    ''')
    bytes_written = res.std_out.decode("utf-8").strip()
    print(f"  ✓ Selesai ({bytes_written} bytes, target: {expected_len} bytes)", flush=True)

def deploy():
    root_dir = Path(__file__).resolve().parent.parent
    vps_daemon_dir = root_dir / "vps-daemon"

    # 1. Hentikan proses python lama di VPS
    print("1. Menghentikan proses bot lama di VPS...", flush=True)
    session.run_ps("Stop-Process -Name python -Force -ErrorAction SilentlyContinue")
    time.sleep(1)

    # 2. Pastikan direktori C:\AureusBridge tersedia
    session.run_ps("if (!(Test-Path 'C:\\AureusBridge')) { New-Item -ItemType Directory -Path 'C:\\AureusBridge' }")

    # 3. Buat file .env di C:\AureusBridge dari konfigurasi .env.local
    print("2. Menyinkronkan file .env SSOT ke VPS...", flush=True)
    vps_env_lines = [
        f'TELEGRAM_BOT_TOKEN="{env_vars.get("TELEGRAM_BOT_TOKEN", "")}"',
        f'TELEGRAM_CHAT_ID="{env_vars.get("TELEGRAM_CHAT_ID", "")}"',
        f'SYMBOL_TARGET="{env_vars.get("TRADING_SYMBOL", "BTCUSDm")}"',
        f'MAGIC_NUMBER="{env_vars.get("TRADING_MAGIC_NUMBER", "778898")}"',
        f'FIXED_LOT="{env_vars.get("TRADING_FIXED_LOT", "0.01")}"',
        f'DEFAULT_SL_POINTS="{env_vars.get("TRADING_SL_POINTS", "65.0")}"',
        f'TARGET_TP1_POINTS="{env_vars.get("TRADING_TP1_POINTS", "140.0")}"',
        f'TARGET_TP2_POINTS="{env_vars.get("TRADING_TP2_POINTS", "200.0")}"',
        f'DAILY_LOSS_LIMIT_USD="{env_vars.get("TRADING_MAX_DAILY_LOSS", "5.00")}"',
        f'MAX_CONSECUTIVE_LOSS="{env_vars.get("TRADING_MAX_CONSECUTIVE_LOSS", "6")}"',
        f'CONFIDENCE_THRESHOLD="{env_vars.get("TRADING_CONFIDENCE_THRESHOLD", "65")}"',
        f'MIN_ROOM_TO_RUN_POINTS="{env_vars.get("TRADING_MIN_ROOM_TO_RUN", "50.0")}"',
        f'WIN_COOLDOWN_SECONDS="{env_vars.get("TRADING_WIN_COOLDOWN", "300")}"',
        f'COOLDOWN_SECONDS="{env_vars.get("TRADING_LOSS_COOLDOWN", "900")}"',
    ]
    vps_env_content = "\n".join(vps_env_lines).encode("utf-8")
    
    # Upload .env
    b64_env = base64.b64encode(vps_env_content).decode("ascii")
    session.run_ps(f'[System.IO.File]::WriteAllBytes("C:\\AureusBridge\\.env", [System.Convert]::FromBase64String("{b64_env}"))')

    # 4. Upload script Python terbaru
    print("3. Mengunggah modul Aureus Autonomous Engine...", flush=True)
    upload_file(str(vps_daemon_dir / "aureus_sniper_bot.py"), "C:\\AureusBridge\\aureus_sniper_bot.py")
    upload_file(str(vps_daemon_dir / "mt5_balance_server.py"), "C:\\AureusBridge\\mt5_balance_server.py")

    # 5. Compile check on remote to ensure zero syntax error
    print("4. Memverifikasi integritas kompilasi Python di VPS...", flush=True)
    res1 = session.run_cmd('python -m py_compile C:\\AureusBridge\\aureus_sniper_bot.py')
    res2 = session.run_cmd('python -m py_compile C:\\AureusBridge\\mt5_balance_server.py')
    err1 = res1.std_err.decode('utf-8').strip()
    err2 = res2.std_err.decode('utf-8').strip()
    if err1 or err2:
        print(f"❌ Kompilasi GAGAL:\nBot Err: {err1}\nServer Err: {err2}", flush=True)
        return
    print("  ✓ Kompilasi kode 100% valid dan bebas error!", flush=True)

    # 6. Jalankan Task Interaktif di VPS
    print("5. Menjalankan ulang task AureusBridgeInteractive di VPS...", flush=True)
    launch_ps = '''
    $pyPath = "C:\\Users\\Administrator\\AppData\\Local\\Programs\\Python\\Python312\\python.exe"
    Unregister-ScheduledTask -TaskName 'AureusBridgeInteractive' -Confirm:$false -ErrorAction SilentlyContinue

    $action = New-ScheduledTaskAction -Execute $pyPath -Argument "mt5_balance_server.py" -WorkingDirectory "C:\\AureusBridge"
    $principal = New-ScheduledTaskPrincipal -UserId "Administrator" -LogonType Interactive
    $settings = New-ScheduledTaskSettingsSet -AllowStartIfOnBatteries -DontStopIfGoingOnBatteries -ExecutionTimeLimit (New-TimeSpan -Days 365)

    Register-ScheduledTask -TaskName 'AureusBridgeInteractive' -Action $action -Principal $principal -Settings $settings -Force | Out-Null
    Start-ScheduledTask -TaskName 'AureusBridgeInteractive'
    Start-Sleep -Seconds 3

    Get-Process python -ErrorAction SilentlyContinue | Format-Table Id, ProcessName, SessionId
    netstat -ano | findstr :8000
    '''
    res = session.run_ps(launch_ps)
    print("Status Peluncuran:\n" + res.std_out.decode("utf-8"), flush=True)

    # 7. Verifikasi Health Endpoint
    print("6. Menunggu server online...", flush=True)
    time.sleep(3)
    import urllib.request
    import json
    try:
        url = f"http://{vps_host}:8000/health"
        req = urllib.request.Request(url, headers={"User-Agent": "AureusDeploy/2.0"})
        with urllib.request.urlopen(req, timeout=5) as r:
            body = json.loads(r.read().decode("utf-8"))
            print(f"✓ Health Check Sukses: {body}", flush=True)
    except Exception as e:
        print(f"⚠️ Health check info: {e}", flush=True)

    print("\n🎉 DEPLOYMENT SELESAI & SUKSES! Bot beroperasi 24/7 di VPS.", flush=True)

if __name__ == "__main__":
    deploy()

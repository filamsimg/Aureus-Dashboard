@echo off
TITLE Aureus VPS MT5 Balance Bridge (USD Standard)
color 0a

echo ===================================================================
echo       AUREUS AI TRADER - SETUP & START BRIDGE VPS MT5 (USD)
echo ===================================================================
echo.
echo [1/4] Menghentikan bot trading lama di VPS...
taskkill /F /IM python.exe /T 2>nul
timeout /t 1 /nobreak >nul
echo       Bot lama berhasil dihentikan.
echo.

echo [2/4] Membuka Port 8000 di Windows Firewall VPS...
netsh advfirewall firewall add rule name="AureusBridge" dir=in action=allow protocol=TCP localport=8000 profile=any >nul 2>&1
echo       Port 8000 telah diizinkan untuk diakses web dashboard.
echo.

echo [3/4] Memastikan library MetaTrader5 terpasang...
python -m pip install MetaTrader5 >nul 2>&1
echo       Library MetaTrader5 siap.
echo.

echo [4/4] Menjalankan Aureus MT5 Balance Bridge...
echo.
echo ===================================================================
echo  PENTING:
echo  1. Pastikan aplikasi MetaTrader 5 di VPS SUDAH DIBUKA.
echo  2. Pastikan sudah LOGIN ke Akun Real Exness USD Anda yang baru.
echo  3. Bridge ini HANYA membaca saldo & modal (TIDAK pasang order).
echo  4. Web dashboard Anda akan otomatis membaca saldo USD secara live!
echo ===================================================================
echo.

python mt5_balance_server.py

pause

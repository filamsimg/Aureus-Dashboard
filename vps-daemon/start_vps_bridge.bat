@echo off
TITLE Aureus VPS MT5 Balance Bridge
color 0a

echo ===================================================
echo     AUREUS VPS MT5 BALANCE SERVER (PORT 8000)
echo ===================================================
echo.
echo Pastikan MetaTrader 5 sudah login ke akun Exness Real USD Anda.
echo Menjalankan server bridge...
echo.

python mt5_balance_server.py

pause

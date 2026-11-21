"""
Aureus VPS Micro-Bridge (Python) - Ultra Fast Resilient Version with Auto-Login
Runs on Windows VPS (109.111.52.163) alongside MetaTrader 5.
Automatically connects to Exness Real USD Account 268119731.
"""

import sys
import os
import json
import logging
import time
import threading
from http.server import ThreadingHTTPServer, BaseHTTPRequestHandler

# Set unbuffered output so print statements appear immediately
sys.stdout.reconfigure(line_buffering=True)

try:
    import MetaTrader5 as mt5
    MT5_AVAILABLE = True
except ImportError:
    MT5_AVAILABLE = False
    mt5 = None

logging.basicConfig(
    level=logging.INFO,
    format="[%(asctime)s] %(message)s",
    datefmt="%H:%M:%S",
    handlers=[logging.StreamHandler(sys.stdout)]
)
logger = logging.getLogger("VPSBridge")

PORT = 8000

# Target Exness Account Credentials
MT5_LOGIN = 268119731
MT5_PASSWORD = "Filamss"
MT5_SERVERS = ["Exness-MT5Real39", "Exness_MT5Real39", "Exness-Real39", "Exness-Real"]

# Global cached state to guarantee 0ms response time
LATEST_STATE = {
    "account": {
        "connected": False,
        "balance": 20.0,
        "equity": 20.0,
        "currency": "USD",
        "login": "268119731",
        "server": "Exness-MT5Real39",
        "error": "Menghubungkan ke MetaTrader 5..."
    },
    "tick": {
        "connected": False,
        "symbol": "BTCUSDm",
        "bid": 0.0,
        "ask": 0.0,
        "last": 0.0,
        "spread": 0.0,
        "error": "Menghubungkan ke MetaTrader 5..."
    },
    "candles": []
}

def mt5_worker_loop():
    """Background thread that continuously polls MT5 so HTTP requests never block."""
    global LATEST_STATE
    logger.info("Worker thread MT5 dimulai. Menghubungkan ke terminal...")
    
    mt5_initialized = False
    last_print_time = 0
    
    while True:
        try:
            if not MT5_AVAILABLE:
                logger.error("Modul MetaTrader5 tidak ditemukan! Pastikan 'pip install MetaTrader5' sudah terpasang.")
                time.sleep(5)
                continue

            if not mt5_initialized:
                path = r"C:\Program Files\MetaTrader 5\terminal64.exe"
                if os.path.exists(path):
                    mt5_initialized = mt5.initialize(path=path)
                else:
                    mt5_initialized = mt5.initialize()
                
                if mt5_initialized:
                    logger.info(">>> MetaTrader 5 IPC Terkoneksi!")
                else:
                    err = mt5.last_error()
                    LATEST_STATE["account"]["error"] = f"Menunggu MT5 GUI: {err}"
                    time.sleep(2)
                    continue

            # 1. Pastikan terhubung ke akun 268119731
            acc = mt5.account_info()
            if not acc or acc.login != MT5_LOGIN:
                for srv in MT5_SERVERS:
                    logger.info(f"Mencoba login ke {MT5_LOGIN} di server {srv}...")
                    auth = mt5.login(login=MT5_LOGIN, password=MT5_PASSWORD, server=srv)
                    if auth:
                        logger.info(f">>> BERHASIL LOGIN MT5: Akun {MT5_LOGIN} di server {srv}!")
                        break
                acc = mt5.account_info()

            if acc:
                d = acc._asdict()
                bal = round(float(d.get("balance", 20.0)), 2)
                eq = round(float(d.get("equity", 20.0)), 2)
                cur = d.get("currency", "USD")
                srv = d.get("server", "Exness-MT5Real39")

                LATEST_STATE["account"] = {
                    "connected": True,
                    "login": d.get("login"),
                    "server": srv,
                    "balance": bal,
                    "equity": eq,
                    "currency": cur,
                    "leverage": d.get("leverage", 2000),
                    "free_margin": round(float(d.get("margin_free", 20.0)), 2),
                    "company": d.get("company", "Exness")
                }
            else:
                LATEST_STATE["account"]["error"] = "Silakan login akun di jendela MT5!"

            # 2. Ambil data Tick real-time untuk BTCUSDm
            for sym in ["BTCUSDm", "BTCUSD", "BTCUSDc", "BTCUSDT"]:
                if mt5.symbol_select(sym, True):
                    tick = mt5.symbol_info_tick(sym)
                    if tick:
                        spread = round(tick.ask - tick.bid, 2)
                        LATEST_STATE["tick"] = {
                            "connected": True,
                            "symbol": sym,
                            "bid": round(tick.bid, 2),
                            "ask": round(tick.ask, 2),
                            "last": round(tick.last or tick.bid, 2),
                            "spread": spread,
                            "time": int(tick.time)
                        }
                        break

            # 3. Update Candles M5
            sym = LATEST_STATE["tick"].get("symbol", "BTCUSDm")
            rates = mt5.copy_rates_from_pos(sym, mt5.TIMEFRAME_M5, 0, 70)
            if rates is not None and len(rates) > 0:
                c_list = []
                for r in rates:
                    c_list.append({
                        "time": int(r['time']),
                        "open": round(float(r['open']), 2),
                        "high": round(float(r['high']), 2),
                        "low": round(float(r['low']), 2),
                        "close": round(float(r['close']), 2),
                        "volume": int(r['tick_volume'])
                    })
                LATEST_STATE["candles"] = c_list

            # Cetak status live di layar setiap 5 detik
            now = time.time()
            if now - last_print_time >= 5:
                last_print_time = now
                if LATEST_STATE["account"].get("connected"):
                    acc_info = LATEST_STATE["account"]
                    tick_info = LATEST_STATE["tick"]
                    logger.info(
                        f"[LIVE MT5] Saldo: {acc_info['currency']} {acc_info['balance']} | "
                        f"Equity: {acc_info['equity']} | "
                        f"{tick_info.get('symbol')}: {tick_info.get('bid')} / {tick_info.get('ask')}"
                    )
                else:
                    logger.info(f"[MENUNGGU MT5] {LATEST_STATE['account'].get('error')}")

        except Exception as e:
            logger.error(f"Error pada loop MT5: {e}")
            mt5_initialized = False

        time.sleep(1)

class BalanceHandler(BaseHTTPRequestHandler):
    def address_string(self):
        # Hindari DNS reverse lookup lambat
        return str(self.client_address[0])

    def log_message(self, format, *args):
        pass

    def do_OPTIONS(self):
        self.send_response(200)
        self.send_header("Access-Control-Allow-Origin", "*")
        self.send_header("Access-Control-Allow-Methods", "GET, OPTIONS")
        self.send_header("Access-Control-Allow-Headers", "Content-Type")
        self.send_header("Connection", "close")
        self.end_headers()

    def do_GET(self):
        if self.path == "/health" or self.path == "/":
            self.send_json({"status": "online", "service": "Aureus MT5 VPS Bridge"})
            return

        if self.path.startswith("/api/account") or self.path.startswith("/balance"):
            self.send_json(LATEST_STATE["account"])
            return

        if self.path.startswith("/api/price") or self.path.startswith("/api/tick"):
            self.send_json(LATEST_STATE["tick"])
            return

        if self.path.startswith("/api/exness/candles") or self.path.startswith("/api/candles"):
            self.send_json({
                "connected": LATEST_STATE["tick"].get("connected", False),
                "symbol": LATEST_STATE["tick"].get("symbol", "BTCUSDm"),
                "candles": LATEST_STATE["candles"]
            })
            return

        self.send_response(404)
        self.send_header("Connection", "close")
        self.end_headers()

    def send_json(self, data: dict, status: int = 200):
        body = json.dumps(data).encode("utf-8")
        self.send_response(status)
        self.send_header("Content-Type", "application/json")
        self.send_header("Access-Control-Allow-Origin", "*")
        self.send_header("Content-Length", str(len(body)))
        self.send_header("Connection", "close")
        self.end_headers()
        self.wfile.write(body)

class ResilientServer(ThreadingHTTPServer):
    allow_reuse_address = True

def run():
    print("=" * 60)
    print("      AUREUS AI TRADER - MT5 LIVE EXNESS BRIDGE")
    print("=" * 60)
    print(f"-> Port HTTP: {PORT}")
    print(f"-> Akun Target: {MT5_LOGIN} (Exness Real)")
    print("=" * 60)

    server_address = ("0.0.0.0", PORT)
    httpd = ResilientServer(server_address, BalanceHandler)
    logger.info(f"🚀 Bridge Server aktif di port {PORT} (Siap menerima request dari Dashboard)")

    t = threading.Thread(target=mt5_worker_loop, daemon=True)
    t.start()

    try:
        httpd.serve_forever()
    except KeyboardInterrupt:
        logger.info("Server dihentikan.")
    finally:
        if MT5_AVAILABLE:
            try:
                mt5.shutdown()
            except:
                pass
        httpd.server_close()

if __name__ == "__main__":
    run()

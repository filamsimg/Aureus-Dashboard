"""
Aureus VPS Micro-Bridge & Autonomous Sniper Bot (Python)
Runs on Windows VPS (109.111.52.163) alongside MetaTrader 5.
Directly reads live balance and ticks from the active MT5 window.
Integrated with:
1. HTTP Micro-Bridge for Aureus Next.js Web Dashboard (Port 8000)
2. Aureus AI Sniper Bot (Step-Ladder Ratchet 50% & 75%, Telegram Notifier, Circuit Breaker)
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

# Import Sniper Bot Module
try:
    from aureus_sniper_bot import AureusSniperBot
    SNIPER_MODULE_AVAILABLE = True
except ImportError:
    try:
        from vps_daemon.aureus_sniper_bot import AureusSniperBot
        SNIPER_MODULE_AVAILABLE = True
    except ImportError:
        AureusSniperBot = None
        SNIPER_MODULE_AVAILABLE = False

# Global cached state to guarantee 0ms response time
LATEST_STATE = {
    "account": {
        "connected": False,
        "balance": 24.26,
        "equity": 24.26,
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

def mt5_worker_loop(sniper_bot=None):
    """Background thread that reads active MT5 data and drives the sniper bot."""
    global LATEST_STATE
    logger.info("Worker MT5 dimulai. Membaca terminal MT5 yang sedang aktif...")
    
    mt5_initialized = False
    last_print_time = 0
    
    while True:
        try:
            if not MT5_AVAILABLE:
                logger.error("Modul MetaTrader5 tidak ditemukan! Pasang dengan 'pip install MetaTrader5'.")
                time.sleep(5)
                continue

            if not mt5_initialized:
                path = r"C:\Program Files\MetaTrader 5\terminal64.exe"
                if os.path.exists(path):
                    mt5_initialized = mt5.initialize(path=path)
                else:
                    mt5_initialized = mt5.initialize()
                
                if mt5_initialized:
                    logger.info(">>> Terhubung ke MetaTrader 5 GUI!")
                else:
                    err = mt5.last_error()
                    LATEST_STATE["account"]["error"] = f"Menunggu MT5 GUI: {err}"
                    time.sleep(2)
                    continue

            # 1. Baca langsung akun yang sedang login di jendela MT5 (Read-Only)
            acc = mt5.account_info()
            if acc:
                d = acc._asdict()
                bal = round(float(d.get("balance", 24.26)), 2)
                eq = round(float(d.get("equity", 24.26)), 2)
                cur = d.get("currency", "USD")
                srv = d.get("server", "Exness-MT5Real39")
                login_id = d.get("login")

                LATEST_STATE["account"] = {
                    "connected": True,
                    "login": login_id,
                    "server": srv,
                    "balance": bal,
                    "equity": eq,
                    "currency": cur,
                    "leverage": d.get("leverage", 2000),
                    "free_margin": round(float(d.get("margin_free", 24.26)), 2),
                    "company": d.get("company", "Exness Technologies Ltd")
                }
            else:
                LATEST_STATE["account"]["connected"] = False
                LATEST_STATE["account"]["error"] = "Pastikan MT5 sudah terbuka dan login ke akun Exness."

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

            # 4. Jalankan Siklus Sniper Bot Otomatis (Anti-MC & Tangga Profit 50%-75%)
            if sniper_bot and LATEST_STATE["account"].get("connected"):
                try:
                    sniper_bot.run_cycle(
                        acc_info=LATEST_STATE["account"],
                        current_tick=LATEST_STATE["tick"],
                        candles_m5=LATEST_STATE["candles"]
                    )
                except Exception as bot_err:
                    logger.error(f"Error pada siklus Sniper Bot: {bot_err}")

            # Cetak status live di layar setiap 5 detik
            now = time.time()
            if now - last_print_time >= 5:
                last_print_time = now
                if LATEST_STATE["account"].get("connected"):
                    acc_info = LATEST_STATE["account"]
                    tick_info = LATEST_STATE["tick"]
                    logger.info(
                        f"[LIVE MT5] Login: #{acc_info['login']} | "
                        f"Saldo: {acc_info['currency']} {acc_info['balance']} | "
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
    print(f"-> Port HTTP Bridge : {PORT}")
    print(f"-> Mode Operasi     : Pure Read-Only + Autonomous Sniper Bot")
    print(f"-> Proteksi Risiko  : Tangga Profit 50% & 75% + Rem Anti-MC")
    print(f"-> Notifikasi       : Telegram @AureusAITraderBot")
    print("=" * 60)

    # Inisialisasi Sniper Bot
    sniper_bot = None
    if SNIPER_MODULE_AVAILABLE and AureusSniperBot:
        try:
            sniper_bot = AureusSniperBot()
            logger.info("🤖 Aureus Sniper Bot aktif (Tangga Profit 50% & 75% + Notifikasi Telegram)")
        except Exception as e:
            logger.warning(f"Gagal inisialisasi Sniper Bot: {e}")

    server_address = ("0.0.0.0", PORT)
    httpd = ResilientServer(server_address, BalanceHandler)
    logger.info(f"🚀 Bridge Server aktif di port {PORT} (Siap melayani Web Dashboard)")

    t = threading.Thread(target=mt5_worker_loop, args=(sniper_bot,), daemon=True)
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

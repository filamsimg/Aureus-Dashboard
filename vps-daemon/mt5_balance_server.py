"""
Aureus VPS Micro-Bridge & Autonomous Sniper Bot (Python)
Runs on Windows VPS alongside MetaTrader 5 (Exness Real).
Features:
1. HTTP Micro-Bridge (Port 8000) for Web Dashboard:
   - /health
   - /api/account
   - /api/price
   - /api/candles
   - /api/analysis (SSOT Multi-Timeframe Signal & Confidence)
   - /api/history  (Real MT5 Execution History & Deals)
2. 24/7 Autonomous Multi-Timeframe Sniper Bot Engine
"""

import sys
import os
import json
import logging
import time
import threading
from datetime import datetime, timedelta
from http.server import ThreadingHTTPServer, BaseHTTPRequestHandler
from pathlib import Path

# Unbuffered stdout
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

PORT = int(os.getenv("VPS_PORT", "8000"))

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

# Global cached state
LATEST_STATE = {
    "account": {
        "connected": False,
        "balance": 0.0,
        "equity": 0.0,
        "currency": "USD",
        "login": "",
        "server": "",
        "error": "Menghubungkan ke MetaTrader 5..."
    },
    "tick": {
        "connected": False,
        "symbol": "BTCUSDm",
        "bid": 0.0,
        "ask": 0.0,
        "last": 0.0,
        "spread": 0.0,
        "time": 0
    },
    "candles": [],
    "candles_mtf": {},
    "analysis": {
        "status": "standby",
        "direction": "WAIT",
        "score": 0,
        "confidencePercent": 0,
        "signal": "TUNGGU (WAIT)",
        "atr_m5": 90.0,
        "reasons": ["Menunggu terminal MT5 siap..."],
        "updated_at": int(time.time()),
        "is_paused": False,
    },
    "history": []
}

def rates_to_list(rates):
    if rates is None or len(rates) == 0:
        return []
    res = []
    for r in rates:
        res.append({
            "time": int(r['time']),
            "open": round(float(r['open']), 2),
            "high": round(float(r['high']), 2),
            "low": round(float(r['low']), 2),
            "close": round(float(r['close']), 2),
            "volume": int(r['tick_volume'])
        })
    return res

def mt5_worker_loop(sniper_bot=None):
    """Background loop that drives MT5 updates and autonomous bot cycle."""
    global LATEST_STATE
    logger.info("Worker MT5 dimulai. Membaca terminal MT5...")
    
    mt5_initialized = False
    last_print_time = 0
    last_history_fetch = 0
    
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

            # 1. Update info akun
            acc = mt5.account_info()
            if acc:
                d = acc._asdict()
                bal = round(float(d.get("balance", 31.85)), 2)
                eq = round(float(d.get("equity", 31.85)), 2)
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
                    "free_margin": round(float(d.get("margin_free", 31.85)), 2),
                    "company": d.get("company", "Exness Technologies Ltd")
                }
            else:
                LATEST_STATE["account"]["connected"] = False
                LATEST_STATE["account"]["error"] = "Pastikan MT5 sudah terbuka dan login ke akun Exness."

            # 2. Update Tick
            sym_target = os.getenv("SYMBOL_TARGET", "BTCUSDm")
            for sym in [sym_target, "BTCUSD", "BTCUSDc", "BTCUSDT"]:
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

            # 3. Update Multi-Timeframe Candles (M1, M5, M15, H1)
            active_sym = LATEST_STATE["tick"].get("symbol", sym_target)
            rates_m1 = mt5.copy_rates_from_pos(active_sym, mt5.TIMEFRAME_M1, 0, 50)
            rates_m5 = mt5.copy_rates_from_pos(active_sym, mt5.TIMEFRAME_M5, 0, 70)
            rates_m15 = mt5.copy_rates_from_pos(active_sym, mt5.TIMEFRAME_M15, 0, 50)
            rates_h1 = mt5.copy_rates_from_pos(active_sym, mt5.TIMEFRAME_H1, 0, 50)

            c_m1 = rates_to_list(rates_m1)
            c_m5 = rates_to_list(rates_m5)
            c_m15 = rates_to_list(rates_m15)
            c_h1 = rates_to_list(rates_h1)
            LATEST_STATE["candles"] = c_m5
            LATEST_STATE["candles_mtf"] = {
                "M1": c_m1,
                "M5": c_m5,
                "M15": c_m15,
                "H1": c_h1,
            }

            # 4. Jalankan Siklus Otonom Sniper Bot (24/7)
            if sniper_bot and LATEST_STATE["account"].get("connected"):
                try:
                    sniper_bot.run_cycle(
                        acc_info=LATEST_STATE["account"],
                        current_tick=LATEST_STATE["tick"],
                        candles_m1=c_m1,
                        candles_m5=c_m5,
                        candles_m15=c_m15
                    )
                    LATEST_STATE["analysis"] = sniper_bot.latest_analysis
                except Exception as bot_err:
                    logger.error(f"Error pada siklus Sniper Bot: {bot_err}")

            # 5. Sinkronisasi Deals History MT5 setiap 5 detik
            now = time.time()
            if now - last_history_fetch >= 5:
                last_history_fetch = now
                try:
                    dt_now = datetime.now()
                    deals = mt5.history_deals_get(dt_now - timedelta(days=7), dt_now + timedelta(days=1))
                    if deals:
                        hist_list = []
                        # Ambil deal keluar (DEAL_ENTRY_OUT) atau deal selesai
                        for d in reversed(deals[-40:]):
                            d_dict = d._asdict()
                            hist_list.append({
                                "ticket": d_dict.get("ticket"),
                                "order": d_dict.get("order"),
                                "time": int(d_dict.get("time")),
                                "symbol": d_dict.get("symbol"),
                                "type": "BUY" if d_dict.get("type") == 0 else "SELL",
                                "entry": "IN" if d_dict.get("entry") == 0 else "OUT",
                                "volume": round(float(d_dict.get("volume", 0.01)), 2),
                                "price": round(float(d_dict.get("price", 0.0)), 2),
                                "profit": round(float(d_dict.get("profit", 0.0)), 2),
                                "comment": d_dict.get("comment", ""),
                                "magic": d_dict.get("magic", 0),
                                "is_bot": (d_dict.get("magic") == int(os.getenv("MAGIC_NUMBER", "778898"))),
                            })
                        LATEST_STATE["history"] = hist_list
                except Exception as hist_err:
                    logger.warning(f"Error fetch history deals: {hist_err}")

            # Cetak log setiap 10 detik
            if now - last_print_time >= 10:
                last_print_time = now
                acc_info = LATEST_STATE["account"]
                tick_info = LATEST_STATE["tick"]
                ana = LATEST_STATE["analysis"]
                status_str = "DIJEDA" if ana.get("is_paused") else "AKTIF"
                logger.info(
                    f"[LIVE MT5] Saldo: ${acc_info.get('balance')} | "
                    f"{tick_info.get('symbol')}: {tick_info.get('bid')} | "
                    f"Bot: {status_str} | "
                    f"Sinyal: {ana.get('signal')} ({ana.get('confidencePercent')}%)"
                )

        except Exception as e:
            logger.error(f"Error loop MT5: {e}")
            mt5_initialized = False

        time.sleep(1)

class BalanceHandler(BaseHTTPRequestHandler):
    def address_string(self):
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
            self.send_json({"status": "online", "service": "Aureus 24/7 Autonomous MT5 Bridge"})
            return

        if self.path.startswith("/api/account") or self.path.startswith("/balance"):
            self.send_json(LATEST_STATE["account"])
            return

        if self.path.startswith("/api/price") or self.path.startswith("/api/tick"):
            self.send_json(LATEST_STATE["tick"])
            return

        if self.path.startswith("/api/candles"):
            tf_query = "M5"
            if "tf=" in self.path:
                try:
                    tf_part = self.path.split("tf=")[1].split("&")[0].upper()
                    if tf_part in ["M1", "M5", "M15", "H1"]:
                        tf_query = tf_part
                except Exception:
                    pass
            candles_to_send = LATEST_STATE.get("candles_mtf", {}).get(tf_query, LATEST_STATE["candles"])
            self.send_json({
                "connected": LATEST_STATE["tick"].get("connected", False),
                "symbol": LATEST_STATE["tick"].get("symbol", "BTCUSDm"),
                "timeframe": tf_query,
                "candles": candles_to_send
            })
            return

        if self.path.startswith("/api/analysis") or self.path.startswith("/api/bot/status"):
            self.send_json({
                "status": "success",
                "analysis": LATEST_STATE["analysis"]
            })
            return

        if self.path.startswith("/api/history") or self.path.startswith("/api/deals"):
            self.send_json({
                "status": "success",
                "deals": LATEST_STATE["history"]
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
    print("      AUREUS AI TRADER - AUTONOMOUS 24/7 MT5 BRIDGE")
    print("=" * 60)
    print(f"-> Port HTTP Bridge : {PORT}")
    print(f"-> Mode Operasi     : Autonomous 24/7 Multi-Timeframe Bot")
    print(f"-> Tangga Profit    : +100pts (50%), +110pts (75%), +120pts (100%)")
    print(f"-> Kendali Master   : Telegram Interactive Bot (/start, /stop)")
    print("=" * 60)

    sniper_bot = None
    if SNIPER_MODULE_AVAILABLE and AureusSniperBot:
        try:
            sniper_bot = AureusSniperBot()
            logger.info("🤖 Aureus Autonomous Sniper Bot aktif.")
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

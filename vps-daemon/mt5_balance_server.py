"""
Aureus VPS Micro-Bridge (Python)
Runs on Windows VPS (109.111.52.163) alongside MetaTrader 5.
Serves:
1. Real-time balance & equity (USD)
2. Live Exness BTCUSDm / BTCUSD tick & spread
3. Exact Exness candlestick history
"""

import sys
import os
import json
import logging
from http.server import HTTPServer, BaseHTTPRequestHandler

try:
    import MetaTrader5 as mt5
    MT5_AVAILABLE = True
except ImportError:
    MT5_AVAILABLE = False
    mt5 = None

logging.basicConfig(level=logging.INFO, format="%(asctime)s - %(message)s")
logger = logging.getLogger("VPSBridge")

PORT = 8000

class BalanceHandler(BaseHTTPRequestHandler):
    def do_OPTIONS(self):
        self.send_response(200)
        self.send_header("Access-Control-Allow-Origin", "*")
        self.send_header("Access-Control-Allow-Methods", "GET, OPTIONS")
        self.send_header("Access-Control-Allow-Headers", "Content-Type")
        self.end_headers()

    def do_GET(self):
        if self.path == "/health" or self.path == "/":
            self.send_json({"status": "online", "service": "Aureus MT5 VPS Bridge"})
            return

        if self.path.startswith("/api/account") or self.path.startswith("/balance"):
            account_data = self.get_mt5_account()
            self.send_json(account_data)
            return

        if self.path.startswith("/api/price") or self.path.startswith("/api/tick"):
            tick_data = self.get_mt5_tick()
            self.send_json(tick_data)
            return

        if self.path.startswith("/api/exness/candles") or self.path.startswith("/api/candles"):
            candles_data = self.get_mt5_candles()
            self.send_json(candles_data)
            return

        self.send_response(404)
        self.end_headers()

    def send_json(self, data: dict, status: int = 200):
        body = json.dumps(data).encode("utf-8")
        self.send_response(status)
        self.send_header("Content-Type", "application/json")
        self.send_header("Access-Control-Allow-Origin", "*")
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def get_mt5_account(self) -> dict:
        if not MT5_AVAILABLE:
            return {
                "connected": False,
                "error": "MetaTrader5 library not installed on VPS",
                "balance": 20.0,
                "equity": 20.0,
                "currency": "USD"
            }

        try:
            if not mt5.initialize():
                return {
                    "connected": False,
                    "error": f"MT5 initialize failed: {mt5.last_error()}",
                    "balance": 20.0,
                    "equity": 20.0,
                    "currency": "USD"
                }

            acc = mt5.account_info()
            if not acc:
                return {
                    "connected": False,
                    "error": "No account logged into MT5 terminal on VPS",
                    "balance": 20.0,
                    "equity": 20.0,
                    "currency": "USD"
                }

            d = acc._asdict()
            return {
                "connected": True,
                "login": d.get("login"),
                "server": d.get("server"),
                "balance": round(float(d.get("balance", 20.0)), 2),
                "equity": round(float(d.get("equity", 20.0)), 2),
                "currency": d.get("currency", "USD"),
                "leverage": d.get("leverage", 2000),
                "free_margin": round(float(d.get("margin_free", 20.0)), 2),
                "company": d.get("company", "Exness")
            }
        except Exception as e:
            logger.error(f"Error reading MT5: {e}")
            return {
                "connected": False,
                "error": str(e),
                "balance": 20.0,
                "equity": 20.0,
                "currency": "USD"
            }

    def get_mt5_tick(self) -> dict:
        if not MT5_AVAILABLE or not mt5.initialize():
            return {"connected": False, "error": "MT5 not available"}

        for sym in ["BTCUSDm", "BTCUSDc", "BTCUSD", "BTCUSDT"]:
            if mt5.symbol_select(sym, True):
                tick = mt5.symbol_info_tick(sym)
                if tick:
                    spread = round(tick.ask - tick.bid, 2)
                    return {
                        "connected": True,
                        "symbol": sym,
                        "bid": round(tick.bid, 2),
                        "ask": round(tick.ask, 2),
                        "last": round(tick.last or tick.bid, 2),
                        "spread": spread,
                        "time": int(tick.time)
                    }
        return {"connected": False, "error": "BTC symbol not found in MarketWatch"}

    def get_mt5_candles(self) -> dict:
        if not MT5_AVAILABLE or not mt5.initialize():
            return {"connected": False, "candles": []}

        # Parse timeframe from query if present
        tf_code = mt5.TIMEFRAME_M5
        if "tf=M1" in self.path or "tf=1" in self.path:
            tf_code = mt5.TIMEFRAME_M1
        elif "tf=M15" in self.path or "tf=15" in self.path:
            tf_code = mt5.TIMEFRAME_M15
        elif "tf=H1" in self.path or "tf=60" in self.path:
            tf_code = mt5.TIMEFRAME_H1

        for sym in ["BTCUSDm", "BTCUSDc", "BTCUSD", "BTCUSDT"]:
            if mt5.symbol_select(sym, True):
                rates = mt5.copy_rates_from_pos(sym, tf_code, 0, 70)
                if rates is not None and len(rates) > 0:
                    candles = []
                    for r in rates:
                        candles.append({
                            "time": int(r['time']),
                            "open": round(float(r['open']), 2),
                            "high": round(float(r['high']), 2),
                            "low": round(float(r['low']), 2),
                            "close": round(float(r['close']), 2),
                            "volume": int(r['tick_volume'])
                        })
                    return {"connected": True, "symbol": sym, "candles": candles}
        return {"connected": False, "candles": []}

def run():
    server_address = ("0.0.0.0", PORT)
    httpd = HTTPServer(server_address, BalanceHandler)
    logger.info(f"=======================================================")
    logger.info(f"🚀 Aureus VPS MT5 Bridge running on port {PORT}")
    logger.info(f"Endpoints:")
    logger.info(f"  - Account: http://109.111.52.163:{PORT}/api/account")
    logger.info(f"  - Price:   http://109.111.52.163:{PORT}/api/price")
    logger.info(f"  - Candles: http://109.111.52.163:{PORT}/api/candles")
    logger.info(f"=======================================================")
    try:
        httpd.serve_forever()
    except KeyboardInterrupt:
        pass
    finally:
        if MT5_AVAILABLE:
            mt5.shutdown()
        httpd.server_close()

if __name__ == "__main__":
    run()

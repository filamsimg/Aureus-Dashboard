"""
Aureus VPS Micro-Bridge (Python)
Runs on Windows VPS (109.111.52.163) alongside MetaTrader 5.
Reads real-time account balance, equity, and currency (USD) dynamically
from whatever account is currently logged into the MT5 terminal.
No hardcoded account credentials!
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

def run():
    server_address = ("0.0.0.0", PORT)
    httpd = HTTPServer(server_address, BalanceHandler)
    logger.info(f"=======================================================")
    logger.info(f"🚀 Aureus VPS MT5 Bridge running on port {PORT}")
    logger.info(f"Endpoint: http://109.111.52.163:{PORT}/api/account")
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

"""
Aureus AI Sniper Bot - Autonomous Multi-Timeframe Scalper for MT5 (Exness Real)
Features:
- SSOT Architecture: Reads all configuration from .env
- Multi-Timeframe Scoring Matrix (M1, M5, M15) - Shared Ground Truth
- Fixed 0.01 lot, Strict Single Bullet (Anti-Averaging, Anti-Martingale)
- Step-Ladder Ratchet Trailing:
  * Stage 1 (+100 pts): Move SL to +50% target (+60 pts / +$0.60)
  * Stage 2 (+110 pts): Move SL to +75% target (+90 pts / +$0.90)
  * Stage 3 (+120 pts): Move SL to +100% TP1 (+120 pts / +$1.20), trail to TP2
- Hard Daily Circuit Breaker: Max 6 consecutive losses / -$5.00 daily stop
- Clean Telegram Bot Integration: Reset shortcuts via setMyCommands, interactive commands:
  /status, /saldo, /start, /stop, /reset_limit, /help
"""

import os
import sys
import time
import json
import ssl
import logging
import threading
import urllib.request
import urllib.parse
from datetime import datetime, date, timedelta
from pathlib import Path

try:
    import MetaTrader5 as mt5
    MT5_AVAILABLE = True
except ImportError:
    MT5_AVAILABLE = False
    mt5 = None

logger = logging.getLogger("AureusSniper")

# ==========================================
# 1. LOAD CONFIGURATION (SSOT)
# ==========================================
def load_env_file():
    """Load .env file if available in working dir or parent."""
    candidates = [
        Path.cwd() / ".env",
        Path.cwd() / ".env.local",
        Path(__file__).resolve().parent / ".env",
        Path("C:/AureusBridge/.env"),
    ]
    for p in candidates:
        if p.exists():
            try:
                with open(p, "r", encoding="utf-8") as f:
                    for line in f:
                        line = line.strip()
                        if not line or line.startswith("#"):
                            continue
                        if "=" in line:
                            k, v = line.split("=", 1)
                            k = k.strip()
                            v = v.strip().strip('"').strip("'")
                            if k not in os.environ:
                                os.environ[k] = v
                break
            except Exception as e:
                logger.warning(f"Error loading {p}: {e}")

load_env_file()

TELEGRAM_BOT_TOKEN = os.getenv("TELEGRAM_BOT_TOKEN", "")
TELEGRAM_CHAT_ID = os.getenv("TELEGRAM_CHAT_ID", "")

SYMBOL_TARGET = os.getenv("SYMBOL_TARGET", "BTCUSDm")
MAGIC_NUMBER = int(os.getenv("MAGIC_NUMBER", "778898"))
FIXED_LOT = float(os.getenv("FIXED_LOT", "0.01"))

DEFAULT_SL_POINTS = float(os.getenv("DEFAULT_SL_POINTS", "85.0"))     # 85 poin = -$0.85 USD (+ buffer slippage -> max -$1.10)
TARGET_TP1_POINTS = float(os.getenv("TARGET_TP1_POINTS", "140.0"))   # 140 poin = +$1.40 USD (Kunci Tangga 3)
TARGET_TP2_POINTS = float(os.getenv("TARGET_TP2_POINTS", "200.0"))   # 200 poin = +$2.00 USD (Runner)

DAILY_LOSS_LIMIT_USD = float(os.getenv("DAILY_LOSS_LIMIT_USD", "5.00"))
MAX_CONSECUTIVE_LOSS = int(os.getenv("MAX_CONSECUTIVE_LOSS", "6"))
CONFIDENCE_THRESHOLD = float(os.getenv("CONFIDENCE_THRESHOLD", "65.0"))
COOLDOWN_SECONDS = int(os.getenv("COOLDOWN_SECONDS", "900"))           # 15 menit post-loss
WIN_COOLDOWN_SECONDS = int(os.getenv("WIN_COOLDOWN_SECONDS", "300"))   # 5 menit post-win (anti-pucuk)
MIN_ROOM_TO_RUN_POINTS = float(os.getenv("MIN_ROOM_TO_RUN_POINTS", "50.0")) # 50 pts cukup untuk scalping pullback
ADX_CHOP_THRESHOLD = float(os.getenv("ADX_CHOP_THRESHOLD", "15.0"))    # Hanya blokir pasar mati sejati
MAX_ATR_M5_THRESHOLD = 220.0                                          # Toleransi volatilitas BTC realistis
WATCHDOG_MAX_LOSS_USD = 1.10                                          # Cut loss darurat mutlak Soft Watchdog (buffer slippage)

# ==========================================
# 2. TELEGRAM CLIENT (CLEAN COMMANDS)
# ==========================================
class TelegramClient:
    def __init__(self, token: str, chat_id: str):
        self.token = token
        self.chat_id = str(chat_id)
        self.base_url = f"https://api.telegram.org/bot{self.token}"
        self.last_update_id = 0
        self.listener_running = False
        try:
            self.ssl_context = ssl._create_unverified_context()
        except Exception:
            self.ssl_context = None

    def reset_telegram_shortcuts(self):
        """Hapus seluruh shortcut lama (seperti /history) dan daftarkan perintah resmi."""
        if not self.token:
            return
        url = f"{self.base_url}/setMyCommands"
        commands = [
            {"command": "status", "description": "Cek posisi aktif, level profit & harga live"},
            {"command": "saldo", "description": "Cek saldo riil, equity & margin Exness"},
            {"command": "start", "description": "Nyalakan pemindaian pasar & auto-trade"},
            {"command": "stop", "description": "Jeda bot sementara (tahan saldo)"},
            {"command": "reset_limit", "description": "Reset rem darurat / batas kerugian harian"},
            {"command": "help", "description": "Panduan singkat perintah bot"}
        ]
        try:
            data = json.dumps({"commands": commands}).encode("utf-8")
            req = urllib.request.Request(url, data=data, headers={"Content-Type": "application/json"})
            kwargs = {"timeout": 10}
            if self.ssl_context:
                kwargs["context"] = self.ssl_context
            with urllib.request.urlopen(req, **kwargs) as resp:
                if resp.status == 200:
                    logger.info("✓ Shortcut Telegram berhasil di-reset & didaftarkan.")
        except Exception as e:
            logger.warning(f"Gagal reset Telegram commands: {e}")

    def send(self, text: str, keyboard: bool = True) -> bool:
        if not self.token or not self.chat_id:
            return False
        url = f"{self.base_url}/sendMessage"
        payload = {
            "chat_id": self.chat_id,
            "text": text,
            "parse_mode": "HTML",
            "disable_web_page_preview": True,
        }
        if keyboard:
            payload["reply_markup"] = {
                "keyboard": [
                    [{"text": "/status"}, {"text": "/saldo"}],
                    [{"text": "/start"}, {"text": "/stop"}],
                    [{"text": "/reset_limit"}]
                ],
                "resize_keyboard": True
            }

        try:
            data = json.dumps(payload).encode("utf-8")
            req = urllib.request.Request(url, data=data, headers={"Content-Type": "application/json"})
            kwargs = {"timeout": 10}
            if self.ssl_context:
                kwargs["context"] = self.ssl_context
            with urllib.request.urlopen(req, **kwargs) as resp:
                return resp.status == 200
        except Exception as e:
            logger.warning(f"Telegram send error: {e}")
            return False

    def start_polling(self, bot_instance):
        self.listener_running = True
        self.reset_telegram_shortcuts()
        t = threading.Thread(target=self._poll_loop, args=(bot_instance,), daemon=True)
        t.start()

    def _poll_loop(self, bot):
        while self.listener_running:
            try:
                url = f"{self.base_url}/getUpdates?offset={self.last_update_id + 1}&timeout=10"
                req = urllib.request.Request(url, headers={"User-Agent": "Mozilla/5.0"})
                kwargs = {"timeout": 15}
                if self.ssl_context:
                    kwargs["context"] = self.ssl_context
                with urllib.request.urlopen(req, **kwargs) as resp:
                    data = json.loads(resp.read().decode("utf-8"))
                    if data.get("ok") and "result" in data:
                        for u in data["result"]:
                            self.last_update_id = u["update_id"]
                            msg = u.get("message", {})
                            text = (msg.get("text") or "").strip().lower()
                            from_id = str(msg.get("chat", {}).get("id", ""))
                            if from_id == self.chat_id:
                                logger.info(f"Telegram command diterima: {text}")
                                self._handle_command(text, bot)
            except Exception:
                time.sleep(3)
            time.sleep(1)

    def _handle_command(self, cmd: str, bot):
        # Clean clean command parsing
        clean_cmd = cmd.split("@")[0].strip()
        if clean_cmd in ["/status", "status"]:
            self.send(bot.get_status_text())
        elif clean_cmd in ["/saldo", "saldo", "balance"]:
            self.send(bot.get_balance_text())
        elif clean_cmd in ["/stop", "stop", "jeda"]:
            bot.is_paused = True
            pending = bot._get_pending_order()
            if pending:
                bot._cancel_pending_order(pending, "Bot dijeda via Telegram (/stop)")
            self.send("⏸️ <b>BOT DIJEDA OLEH PENGGUNA</b>\n\nEksekusi order MT5 dikunci & jaring limit order dibersihkan. Radar analisa tetap aktif di web. Ketik /start untuk mengaktifkan kembali.")
        elif clean_cmd in ["/start", "start", "nyalakan"]:
            bot.is_paused = False
            self.send(
                f"▶️ <b>BOT DIAKTIFKAN KEMBALI (SIAGA 24/7)</b>\n\n"
                f"• Target Pair  : <b>{SYMBOL_TARGET}</b> ({FIXED_LOT} lot)\n"
                f"• Syarat Entry : Konfluensi >= <b>{int(CONFIDENCE_THRESHOLD)}%</b> & Ruang Gerak >= {int(MIN_ROOM_TO_RUN_POINTS)} pts\n"
                f"• Proteksi     : Anti-Pucuk, Anti-Lembah, & Jeda {WIN_COOLDOWN_SECONDS//60}m Pasca-Profit\n"
                f"• Pengawalan   : Tangga Profit bertingkat (+60, +100, +140 pts)"
            )
        elif clean_cmd in ["/reset_limit", "reset_limit"]:
            bot.circuit_breaker_active = False
            bot.daily_consecutive_losses = 0
            sign_td = "+" if bot.daily_pnl_usd >= 0 else "-"
            self.send(
                f"🔓 <b>REM DARURAT BERHASIL DI-RESET</b>\n"
                f"────────────────────────\n"
                f"• PnL Hari Ini : <b>{sign_td}${abs(bot.daily_pnl_usd):.2f} USD</b>\n"
                f"• Batas Harian : <b>-${DAILY_LOSS_LIMIT_USD:.2f} USD</b>\n"
                f"• Loss Seq     : <b>0/{MAX_CONSECUTIVE_LOSS}</b>\n"
                f"• Status       : <b>Bot kembali aktif siaga memindai peluang!</b>\n"
                f"────────────────────────\n"
                f"<i>Ketik /status untuk mengecek kesiapan entry.</i>"
            )
        elif clean_cmd in ["/help", "help"]:
            self.send(
                f"🤖 <b>PERINTAH & STATUS SISTEM AUREUS</b>\n\n"
                f"/status - Cek posisi berjalan, level profit & status filter\n"
                f"/saldo  - Cek saldo, equity & margin riil Exness\n"
                f"/stop   - Jeda eksekusi order MT5 sementara\n"
                f"/start  - Aktifkan kesiagaan order (>= {int(CONFIDENCE_THRESHOLD)}%)\n"
                f"/reset_limit - Buka kunci rem darurat harian\n\n"
                f"<i>Sistem berjalan otonom di VPS dengan proteksi Anti-Pucuk & Tangga Profit.</i>"
            )

# ==========================================
# 3. AUREUS SNIPER BOT CLASS
# ==========================================
class AureusSniperBot:
    def __init__(self):
        self.telegram = TelegramClient(TELEGRAM_BOT_TOKEN, TELEGRAM_CHAT_ID)
        self.is_paused = True  # Safe Default: Terkunci rapat saat start, wajib /start manual via Telegram
        
        # State harian
        self.current_date = date.today()
        self.daily_pnl_usd = 0.0
        self.daily_consecutive_losses = 0
        self.circuit_breaker_active = False
        self.last_loss_time = 0.0
        self.last_win_time = 0.0

        # Posisi aktif tracking
        self.tracked_ticket = None
        self.ladder_stage = 0  # 0: None, 1: 50%, 2: 75%, 3: 100%
        self.entry_price = 0.0
        self.pos_type = None   # "BUY" or "SELL"

        # State analisa terakhir untuk disinkronkan ke Web Dashboard (SSOT)
        self.latest_analysis = {
            "status": "initializing",
            "direction": "WAIT",
            "score": 0,
            "confidencePercent": 0,
            "signal": "TUNGGU (WAIT)",
            "atr_m5": 90.0,
            "reasons": ["Menginisialisasi pemindaian multi-timeframe..."],
            "updated_at": int(time.time()),
            "is_paused": False,
        }

        # Start Telegram listener
        self.telegram.start_polling(self)

    def reset_daily_stats_if_new_day(self):
        today = date.today()
        if today != self.current_date:
            self.current_date = today
            self.daily_pnl_usd = 0.0
            self.daily_consecutive_losses = 0
            self.circuit_breaker_active = False
            logger.info("Hari baru! Statistik harian di-reset.")
            self.telegram.send(f"🌅 <b>SESI HARI BARU ({today.strftime('%d %b %Y')})</b>\nSistem siap memindai peluang BTCUSDm.")

    def _sync_daily_pnl_from_mt5(self):
        """Baca Ground Truth PnL riil hari ini langsung dari broker MT5 (Anti-Amnesia)."""
        if not MT5_AVAILABLE:
            return
        now = datetime.now()
        start_of_day = datetime(now.year, now.month, now.day, 0, 0, 0)
        deals = mt5.history_deals_get(start_of_day, now + timedelta(days=1))
        if deals:
            total_pnl = 0.0
            consecutive_losses = 0
            closed_deals = [d for d in deals if d.entry == mt5.DEAL_ENTRY_OUT and d.magic == MAGIC_NUMBER]
            for d in closed_deals:
                pnl = float(d.profit)
                total_pnl += pnl
                if pnl < 0:
                    consecutive_losses += 1
                elif pnl > 0:
                    consecutive_losses = 0

            self.daily_pnl_usd = round(total_pnl, 2)
            self.daily_consecutive_losses = consecutive_losses

            # Trigger Circuit Breaker jika kerugian hari ini melampaui batas harian
            if (self.daily_consecutive_losses >= MAX_CONSECUTIVE_LOSS) or (self.daily_pnl_usd <= -DAILY_LOSS_LIMIT_USD):
                if not self.circuit_breaker_active:
                    self.circuit_breaker_active = True
                    logger.warning(f"Rem Darurat (Circuit Breaker) aktif! Akumulasi PnL hari ini: -${abs(self.daily_pnl_usd):.2f} USD")
                    cb_msg = (
                        f"🛑 <b>REM DARURAT AKTIF (CIRCUIT BREAKER)</b>\n"
                        f"────────────────────────\n"
                        f"Akumulasi Rugi Hari Ini: -${abs(self.daily_pnl_usd):.2f} USD\n"
                        f"Batas Maksimal Harian  : -${DAILY_LOSS_LIMIT_USD:.2f} USD\n"
                        f"<b>Aksi: Bot ISTIRAHAT TOTAL sampai jam 00:00 besok!</b>\n"
                        f"Eksekusi order otomatis dikunci rapat untuk melindungi modal Anda."
                    )
                    self.telegram.send(cb_msg)
            else:
                self.circuit_breaker_active = False

    def run_cycle(self, acc_info: dict, current_tick: dict, candles_m1: list, candles_m5: list, candles_m15: list):
        """Dipanggil setiap detik oleh worker thread."""
        if not MT5_AVAILABLE:
            return

        self.reset_daily_stats_if_new_day()
        self._sync_daily_pnl_from_mt5()

        # 1. Pantau posisi terbuka saat ini (Tangga Profit 50%, 75%, 100%)
        pos = self._get_open_position()
        if pos:
            if self.tracked_ticket != pos.ticket:
                self.tracked_ticket = pos.ticket
                self.ladder_stage = 0
                self.entry_price = float(pos.price_open)
                self.pos_type = "BUY" if pos.type == mt5.ORDER_TYPE_BUY else "SELL"
                pending = self._get_pending_order()
                if pending:
                    self._cancel_pending_order(pending, "Posisi sudah terisi broker")
                
                msg = (
                    f"🚀 <b>[LIMIT ORDER TERJEMPUT DI EMA 21 — AKTIF!]</b>\n"
                    f"────────────────────────\n"
                    f"Posisi   : <b>#{pos.ticket} ({self.pos_type} {SYMBOL_TARGET})</b>\n"
                    f"Volume   : <b>{pos.volume} lot</b>\n"
                    f"Harga    : <b>${pos.price_open:,.2f}</b> (Lantai EMA 21)\n"
                    f"Batas SL : ${pos.sl:,.2f} (-${DEFAULT_SL_POINTS*0.01:.2f} USD)\n"
                    f"Target TP: ${pos.tp:,.2f} (+${TARGET_TP1_POINTS*0.01:.2f} USD)\n"
                    f"Saldo    : ${acc_info.get('balance', 0.0):.2f} USD\n"
                    f"────────────────────────\n"
                    f"<i>Posisi dikawal 24/7 dengan Tangga Profit Bertingkat (+60, +100, +140 pts).</i>"
                )
                self.telegram.send(msg)

            self._manage_open_position(pos, current_tick)
            return

        # Jika posisi tertutup
        if self.tracked_ticket is not None:
            self._handle_position_closed(self.tracked_ticket, acc_info)
            self.tracked_ticket = None
            self.ladder_stage = 0
            self.pos_type = None

        # Jika bot dijeda atau rem darurat aktif, bersihkan pending limit order
        if self.is_paused or self.circuit_breaker_active:
            pending = self._get_pending_order()
            if pending:
                self._cancel_pending_order(pending, "Bot dijeda atau circuit breaker aktif")

        # 2. Update status flag analisa untuk Web Radar (SSOT)
        self.latest_analysis["is_paused"] = self.is_paused
        self.latest_analysis["circuit_breaker"] = self.circuit_breaker_active

        # 3. Analisa Multi-Timeframe Scoring (SSOT) - Tetap memindai pasar untuk display Web Radar
        self._evaluate_and_enter(current_tick, candles_m1, candles_m5, candles_m15, acc_info)

    def _get_open_position(self):
        positions = mt5.positions_get(symbol=SYMBOL_TARGET)
        if not positions:
            positions = mt5.positions_get()
        if positions:
            for p in positions:
                if p.magic == MAGIC_NUMBER:
                    return p
        return None

    def _get_pending_order(self):
        """Ambil pending limit order aktif milik bot jika ada."""
        if not MT5_AVAILABLE:
            return None
        orders = mt5.orders_get(symbol=SYMBOL_TARGET)
        if not orders:
            orders = mt5.orders_get()
        if orders:
            for o in orders:
                if o.magic == MAGIC_NUMBER:
                    return o
        return None

    def _cancel_pending_order(self, order, reason: str = "") -> bool:
        """Batalkan pending order yang sudah tidak relevan."""
        if not MT5_AVAILABLE or not order:
            return False
        req = {
            "action": mt5.TRADE_ACTION_REMOVE,
            "order": order.ticket,
        }
        res = mt5.order_send(req)
        if res and res.retcode == mt5.TRADE_RETCODE_DONE:
            logger.info(f"Pending order #{order.ticket} dibatalkan. Alasan: {reason}")
            return True
        return False

    def _manage_open_position(self, pos, current_tick):
        """Kawal posisi aktif dengan Tangga Pengunci Profit Bertingkat."""
        ticket = pos.ticket
        self.tracked_ticket = ticket
        entry = float(pos.price_open)
        cur_sl = float(pos.sl)
        cur_tp = float(pos.tp)
        is_buy = (pos.type == mt5.ORDER_TYPE_BUY)
        self.pos_type = "BUY" if is_buy else "SELL"
        self.entry_price = entry

        bid = current_tick.get("bid", 0.0)
        ask = current_tick.get("ask", 0.0)
        cur_price = bid if is_buy else ask

        if cur_price <= 0:
            return

        pnl_pts = (cur_price - entry) if is_buy else (entry - cur_price)
        pnl_usd = round(pnl_pts * 0.01, 2)
        stages = ["Memantau Tangga 1 (+60)", "Tangga 1 (+30 pts Lock)", "Tangga 2 (+60 pts Lock)", "Tangga 3 (+100 pts Lock)"]
        stage_desc = stages[min(self.ladder_stage, 3)]

        # Update latest_analysis saat ada posisi aktif agar Web Dashboard sinkron sempurna
        self.latest_analysis = {
            "status": "active",
            "direction": self.pos_type,
            "score": 100 if self.pos_type == "BUY" else -100,
            "confidencePercent": 100,
            "signal": f"POSISI AKTIF: {self.pos_type}",
            "atr_m5": 90.0,
            "reasons": [
                f"Order #{ticket} {self.pos_type} 0.01 lot di ${entry:,.2f}",
                f"Floating PnL: {'+' if pnl_usd >= 0 else ''}${pnl_usd:.2f} USD",
                f"Status Tangga: {stage_desc}"
            ],
            "updated_at": int(time.time()),
            "is_paused": self.is_paused,
            "daily_pnl": round(self.daily_pnl_usd, 2),
            "circuit_breaker": self.circuit_breaker_active,
        }

        # Soft Watchdog: Cut loss darurat mutlak jika floating loss mencapai batas toleransi
        if pnl_usd <= -WATCHDOG_MAX_LOSS_USD:
            logger.warning(f"Watchdog trigger: Loss -${abs(pnl_usd):.2f} melampaui batas toleransi -${WATCHDOG_MAX_LOSS_USD:.2f} USD. Market close darurat!")
            self._close_position_market(pos)
            return

        # Tangga 3: +140 poin -> Kunci +100 poin (+1.00 USD), lepas ke TP2 (+200 pts)
        if pnl_pts >= 140.0 and self.ladder_stage < 3:
            target_sl = round(entry + 100.0 if is_buy else entry - 100.0, 2)
            target_tp2 = round(entry + TARGET_TP2_POINTS if is_buy else entry - TARGET_TP2_POINTS, 2)
            if (is_buy and target_sl > cur_sl + 5.0) or (not is_buy and (cur_sl == 0 or target_sl < cur_sl - 5.0)):
                if self._modify_sl(pos, target_sl, target_tp2):
                    self.ladder_stage = 3
                    msg = (
                        f"🎯 <b>[TANGGA 3] TP1 TEMBUS — KUNCI +$1.00 USD!</b>\n"
                        f"────────────────────────\n"
                        f"Pair     : {SYMBOL_TARGET} ({self.pos_type})\n"
                        f"Aksi     : SL di-lock di level +100 pts (${target_sl:,.2f})\n"
                        f"Status   : <b>+$1.00 USD Milik Anda!</b>\n"
                        f"Next     : Posisi bebas berlari mengejar TP2 (+$2.00)"
                    )
                    self.telegram.send(msg)

        # Tangga 2: +100 poin -> Kunci +60 poin (+0.60 USD Untung Bersih)
        elif pnl_pts >= 100.0 and self.ladder_stage < 2:
            target_sl = round(entry + 60.0 if is_buy else entry - 60.0, 2)
            if (is_buy and target_sl > cur_sl + 5.0) or (not is_buy and (cur_sl == 0 or target_sl < cur_sl - 5.0)):
                if self._modify_sl(pos, target_sl, cur_tp):
                    self.ladder_stage = 2
                    msg = (
                        f"🚀 <b>[TANGGA 2] PROFIT 60% TERKUNCI (+100 PTS)!</b>\n"
                        f"────────────────────────\n"
                        f"Pair     : {SYMBOL_TARGET} ({self.pos_type})\n"
                        f"Floating : +${pnl_pts * 0.01:.2f} USD\n"
                        f"Aksi     : SL dinaikkan ke <b>${target_sl:,.2f}</b> (+60 pts)\n"
                        f"Status   : <b>+$0.60 USD Sukses Diamankan!</b>\n"
                        f"Target   : Menuju Tangga 3 (+140 pts)"
                    )
                    self.telegram.send(msg)

        # Tangga 1: +60 poin -> Kunci +30 poin (+0.30 USD Untung Bersih - Anti Reversal)
        elif pnl_pts >= 60.0 and self.ladder_stage < 1:
            target_sl = round(entry + 30.0 if is_buy else entry - 30.0, 2)
            if (is_buy and target_sl > cur_sl + 5.0) or (not is_buy and (cur_sl == 0 or target_sl < cur_sl - 5.0)):
                if self._modify_sl(pos, target_sl, cur_tp):
                    self.ladder_stage = 1
                    msg = (
                        f"🛡️ <b>[TANGGA 1] PROFIT TERKUNCI (+60 PTS)!</b>\n"
                        f"────────────────────────\n"
                        f"Pair     : {SYMBOL_TARGET} ({self.pos_type})\n"
                        f"Floating : +${pnl_pts * 0.01:.2f} USD\n"
                        f"Aksi     : SL digeser ke <b>${target_sl:,.2f}</b> (+30 pts)\n"
                        f"Status   : <b>+$0.30 USD Terjamin Masuk Saldo!</b>\n"
                        f"Target   : Menuju Tangga 2 (+100 pts)"
                    )
                    self.telegram.send(msg)

    def _close_position_market(self, pos) -> bool:
        """Emergency watchdog close order to cap losses."""
        order_type = mt5.ORDER_TYPE_SELL if pos.type == mt5.ORDER_TYPE_BUY else mt5.ORDER_TYPE_BUY
        tick = mt5.symbol_info_tick(pos.symbol)
        if not tick:
            return False
        price = tick.bid if pos.type == mt5.ORDER_TYPE_BUY else tick.ask

        sym_info = mt5.symbol_info(pos.symbol)
        filling = mt5.ORDER_FILLING_IOC
        if sym_info:
            if sym_info.filling_mode & 2:
                filling = mt5.ORDER_FILLING_IOC
            elif sym_info.filling_mode & 1:
                filling = mt5.ORDER_FILLING_FOK
            else:
                filling = mt5.ORDER_FILLING_RETURN

        req = {
            "action": mt5.TRADE_ACTION_DEAL,
            "position": pos.ticket,
            "symbol": pos.symbol,
            "volume": float(pos.volume),
            "type": order_type,
            "price": float(price),
            "deviation": 50,
            "magic": MAGIC_NUMBER,
            "comment": "Watchdog Emergency Cut",
            "type_time": mt5.ORDER_TIME_GTC,
            "type_filling": filling,
        }
        res = mt5.order_send(req)
        success = (res is not None and res.retcode == mt5.TRADE_RETCODE_DONE)
        if success:
            msg = (
                f"🚨 <b>[SOFT WATCHDOG CUT LOSS DARURAT]</b>\n"
                f"────────────────────────\n"
                f"Posisi   : #{pos.ticket} ({'BUY' if pos.type == mt5.ORDER_TYPE_BUY else 'SELL'})\n"
                f"Status   : Floating loss melampaui toleransi -${WATCHDOG_MAX_LOSS_USD:.2f} USD!\n"
                f"Aksi     : Market Close darurat sukses dieksekusi broker.\n"
                f"Modal aman dan terlindungi dari lonjakan slippage."
            )
            self.telegram.send(msg)
        return success

    def _modify_sl(self, pos, new_sl: float, new_tp: float) -> bool:
        req = {
            "action": mt5.TRADE_ACTION_SLTP,
            "position": pos.ticket,
            "symbol": pos.symbol,
            "sl": float(new_sl),
            "tp": float(new_tp),
        }
        res = mt5.order_send(req)
        return res is not None and res.retcode == mt5.TRADE_RETCODE_DONE

    def _handle_position_closed(self, ticket: int, acc_info: dict):
        time.sleep(1)
        now = datetime.now()
        from_time = now - timedelta(days=2)
        deals = mt5.history_deals_get(from_time, now + timedelta(days=1), position=ticket)
        pnl = 0.0
        if deals:
            for d in deals:
                if d.entry == mt5.DEAL_ENTRY_OUT:
                    pnl = float(d.profit)

        self.daily_pnl_usd += pnl
        current_bal = acc_info.get("balance", 0.0)
        pnl_sign = "+" if self.daily_pnl_usd >= 0 else "-"

        if pnl > 0:
            self.daily_consecutive_losses = 0
            self.last_win_time = time.time()
            msg = (
                f"✅ <b>TRANSAKSI SELESAI — PROFIT!</b>\n"
                f"────────────────────────\n"
                f"Hasil    : <b>+${pnl:.2f} USD</b>\n"
                f"Saldo    : <b>${current_bal:.2f} USD</b>\n"
                f"PnL Hari : {pnl_sign}${abs(self.daily_pnl_usd):.2f} USD\n"
                f"Cooldown : {WIN_COOLDOWN_SECONDS//60} menit jeda pasca-profit (anti-pucuk)."
            )
            self.telegram.send(msg)
        else:
            self.daily_consecutive_losses += 1
            self.last_loss_time = time.time()
            msg = (
                f"⚠️ <b>TRANSAKSI SELESAI — CUT LOSS</b>\n"
                f"────────────────────────\n"
                f"Hasil    : <b>-${abs(pnl):.2f} USD</b> (Terukur)\n"
                f"Saldo    : <b>${current_bal:.2f} USD</b>\n"
                f"Loss Seq : {self.daily_consecutive_losses}/{MAX_CONSECUTIVE_LOSS}\n"
                f"Cooldown : {COOLDOWN_SECONDS//60} menit jeda analisa."
            )
            self.telegram.send(msg)

            if (self.daily_consecutive_losses >= MAX_CONSECUTIVE_LOSS) or (self.daily_pnl_usd <= -DAILY_LOSS_LIMIT_USD):
                self.circuit_breaker_active = True
                cb_msg = (
                    f"🛑 <b>REM DARURAT AKTIF (CIRCUIT BREAKER)</b>\n"
                    f"────────────────────────\n"
                    f"Akumulasi Rugi: -${abs(self.daily_pnl_usd):.2f} USD\n"
                    f"Aturan: Rugi {MAX_CONSECUTIVE_LOSS}x beruntun atau mencapai batas harian (-${DAILY_LOSS_LIMIT_USD:.2f} USD).\n"
                    f"<b>Aksi: Bot ISTIRAHAT TOTAL sampai jam 00:00 besok!</b>\n"
                    f"Saldo Anda aman dan terlindungi."
                )
                self.telegram.send(cb_msg)

    def _evaluate_and_enter(self, current_tick: dict, candles_m1: list, candles_m5: list, candles_m15: list, acc_info: dict):
        """
        Unified Multi-Timeframe Scoring Matrix (M1, M5, M15) - SSOT Engine
        """
        if len(candles_m5) < 30:
            return

        # 1. Closed Candle Selection (Gunakan Bar M5 yang selesai tertutup)
        c_prev = candles_m5[-2]  # Bar M5 selesai (Closed Candle)
        c_prev2 = candles_m5[-3] if len(candles_m5) >= 3 else c_prev
        
        closes_m5 = [c["close"] for c in candles_m5[:-1]] # Selesai
        highs_m5 = [c["high"] for c in candles_m5[:-1]]
        lows_m5 = [c["low"] for c in candles_m5[:-1]]

        # Proteksi Volatilitas (ATR M5 realistis)
        ranges = [h - l for h, l in zip(highs_m5[-14:], lows_m5[-14:])]
        atr_m5 = sum(ranges) / len(ranges) if ranges else 90.0
        adx_m5 = self._calculate_adx(candles_m5[:-1], 14)

        is_wild = (atr_m5 > MAX_ATR_M5_THRESHOLD)
        is_sideways = (adx_m5 < ADX_CHOP_THRESHOLD)

        # 2. Rezim Tren Makro M15 & M5 (Bobot 35%)
        score = 0
        reasons = []
        st_m15 = self._calc_supertrend(candles_m15)
        st_m5 = self._calc_supertrend(candles_m5[:-1])
        ema21_m5 = self._calc_ema(closes_m5, 21)
        ema50_m5 = self._calc_ema(closes_m5, 50) if len(closes_m5) >= 50 else ema21_m5

        is_bull_regime = (st_m15 == "BULLISH" and (st_m5 == "BULLISH" or ema21_m5 > ema50_m5))
        is_bear_regime = (st_m15 == "BEARISH" and (st_m5 == "BEARISH" or ema21_m5 < ema50_m5))

        if is_bull_regime:
            score += 35
            reasons.append("Rezim Tren Bullish (M15 & M5 Selaras)")
        elif is_bear_regime:
            score -= 35
            reasons.append("Rezim Tren Bearish (M15 & M5 Selaras)")

        # 3. Pullback Zone & Jaring Limit Order di EMA 21 (Bobot 40%)
        # Pendekatan Limit Order: pasang jaring diskon tepat di lantai EMA 21 saat tren makro selaras
        cur_price = current_tick.get("ask" if score >= 0 else "bid", c_prev["close"]) if current_tick else c_prev["close"]
        dist_to_ema_buy = cur_price - ema21_m5
        dist_to_ema_sell = ema21_m5 - cur_price

        if is_bull_regime and (dist_to_ema_buy <= 1.5 * atr_m5):
            score += 40
            reasons.append(f"Jaring Diskon: Target BUY LIMIT di EMA 21 (${ema21_m5:,.2f})")
        elif is_bear_regime and (dist_to_ema_sell <= 1.5 * atr_m5):
            score -= 40
            reasons.append(f"Jaring Diskon: Target SELL LIMIT di EMA 21 (${ema21_m5:,.2f})")

        # 4. Trigger Cepat M1 Momentum (Bobot 25%) - Memperkuat sinyal searah
        if len(candles_m1) >= 15:
            closes_m1 = [c["close"] for c in candles_m1]
            ema9_m1 = self._calc_ema(closes_m1, 9)
            if closes_m1[-1] > ema9_m1 and score >= 0:
                score += 25
                reasons.append("Momentum M1: Konfirmasi Bullish di atas EMA 9")
            elif closes_m1[-1] < ema9_m1 and score <= 0:
                score -= 25
                reasons.append("Momentum M1: Konfirmasi Bearish di bawah EMA 9")

        # 5. Room to Run Filter (50 pts dari Swing M5)
        sub20 = candles_m5[-21:-1]
        recent_high_20 = max(c["high"] for c in sub20) if sub20 else c_prev["close"]
        recent_low_20 = min(c["low"] for c in sub20) if sub20 else c_prev["close"]
        cur_price = current_tick.get("ask" if score >= 0 else "bid", c_prev["close"])
        
        # Jika harga sudah breakout di luar swing 20 bar, ruang gerak terbuka bebas
        room_to_high = max(0.0, recent_high_20 - cur_price) if cur_price < recent_high_20 else 999.0
        room_to_low = max(0.0, cur_price - recent_low_20) if cur_price > recent_low_20 else 999.0

        # Bound score -100 to 100
        score = max(-100, min(100, score))
        confidence = abs(score)

        direction = "WAIT"
        signal_type = "TUNGGU (WAIT)"

        if is_wild:
            signal_type = "PASAR LIAR (TUNGGU)"
            direction = "WAIT"
            reasons.insert(0, f"Volatilitas ATR ({atr_m5:.1f}) melebihi batas {MAX_ATR_M5_THRESHOLD:.0f}! Tahan saldo Anda.")
        elif is_sideways:
            signal_type = "TUNGGU (PASAR SIDEWAYS)"
            direction = "WAIT"
            reasons.insert(0, f"Pasar Sideways / Choppy (ADX M5 {adx_m5:.1f} < {ADX_CHOP_THRESHOLD:.0f}). Menahan peluru.")
        elif score >= CONFIDENCE_THRESHOLD:
            if not is_bull_regime:
                direction = "WAIT"
                signal_type = "TUNGGU (TREN M5 TURUN)"
                reasons.insert(0, "⛔ Beli Ditolak Keras: Tren M5 sedang Turun (Menolak Membeli Pisau Jatuh).")
            elif cur_price < recent_high_20 and room_to_high < MIN_ROOM_TO_RUN_POINTS:
                signal_type = "TUNGGU (DEKAT RESISTENSI)"
                direction = "WAIT"
                reasons.insert(0, f"Beli Ditolak: Plafon Resisten M5 hanya +{room_to_high:.1f} pts (< {MIN_ROOM_TO_RUN_POINTS:.0f} pts).")
            else:
                direction = "BUY"
                signal_type = "JARING BUY LIMIT (EMA 21)"
        elif score <= -CONFIDENCE_THRESHOLD:
            if not is_bear_regime:
                direction = "WAIT"
                signal_type = "TUNGGU (TREN M5 NAIK)"
                reasons.insert(0, "⛔ Jual Ditolak Keras: Tren M5 sedang Naik (Menolak Menjual di Tren Kuat).")
            elif cur_price > recent_low_20 and room_to_low < MIN_ROOM_TO_RUN_POINTS:
                signal_type = "TUNGGU (DEKAT SUPPORT)"
                direction = "WAIT"
                reasons.insert(0, f"Jual Ditolak: Lantai Support M5 hanya -{room_to_low:.1f} pts (< {MIN_ROOM_TO_RUN_POINTS:.0f} pts).")
            else:
                direction = "SELL"
                signal_type = "JARING SELL LIMIT (EMA 21)"

        # Bersihkan pending limit order jika arah sinyal menjadi WAIT
        if direction == "WAIT":
            pending = self._get_pending_order()
            if pending:
                self._cancel_pending_order(pending, "Pasar tidak lagi konfluens")

        # Cek status pending order aktif untuk SSOT
        pending = self._get_pending_order()
        pending_data = None
        if pending:
            pending_data = {
                "ticket": pending.ticket,
                "type": "BUY_LIMIT" if pending.type == mt5.ORDER_TYPE_BUY_LIMIT else "SELL_LIMIT",
                "price": pending.price_open,
                "sl": pending.sl,
                "tp": pending.tp,
            }

        # Update latest analysis for Web Dashboard (SSOT)
        self.latest_analysis = {
            "status": "active",
            "direction": direction,
            "score": score,
            "confidencePercent": confidence,
            "signal": signal_type,
            "atr_m5": round(atr_m5, 2),
            "adx_m5": adx_m5,
            "room_to_high": round(room_to_high, 1),
            "room_to_low": round(room_to_low, 1),
            "reasons": reasons if reasons else ["Menunggu konfluensi setup valid"],
            "updated_at": int(time.time()),
            "is_paused": self.is_paused,
            "daily_pnl": round(self.daily_pnl_usd, 2),
            "circuit_breaker": self.circuit_breaker_active,
            "pending_order": pending_data,
        }

        # Check Active Cooldowns before MT5 Execution
        now = time.time()
        in_win_cooldown = (now - self.last_win_time < WIN_COOLDOWN_SECONDS)
        in_loss_cooldown = (now - self.last_loss_time < COOLDOWN_SECONDS)

        # Eksekusi Order Otomatis jika terkonfirmasi dan bot TIDAK DIJEDA
        if direction in ["BUY", "SELL"]:
            if self.is_paused:
                logger.info(f"Sinyal {direction} terdeteksi ({confidence}%), tetapi BOT DIJEDA via Telegram (/stop). Order tidak dieksekusi.")
                return
            if self.circuit_breaker_active:
                logger.info(f"Sinyal {direction} terdeteksi, tetapi Circuit Breaker aktif. Order ditahan.")
                return
            if in_win_cooldown:
                rem = int(WIN_COOLDOWN_SECONDS - (now - self.last_win_time))
                logger.info(f"Sinyal {direction} terdeteksi, tetapi dalam jeda pasca-profit (sisa {rem}s). Menghindari beli di pucuk.")
                return
            if in_loss_cooldown:
                rem = int(COOLDOWN_SECONDS - (now - self.last_loss_time))
                logger.info(f"Sinyal {direction} terdeteksi, tetapi dalam masa jeda cut loss (sisa {rem}s). Order ditahan.")
                return

            self._execute_order(direction, ema21_m5, cur_price, reasons, acc_info)

    def _execute_order(self, direction: str, ema21_m5: float, current_price: float, reasons: list, acc_info: dict):
        if not MT5_AVAILABLE:
            return

        is_buy = (direction == "BUY")
        target_limit_price = round(ema21_m5, 2)
        sl_dist = DEFAULT_SL_POINTS

        sym_info = mt5.symbol_info(SYMBOL_TARGET)
        filling = mt5.ORDER_FILLING_IOC
        if sym_info:
            if sym_info.filling_mode & 2:
                filling = mt5.ORDER_FILLING_IOC
            elif sym_info.filling_mode & 1:
                filling = mt5.ORDER_FILLING_FOK
            else:
                filling = mt5.ORDER_FILLING_RETURN

        # 1. Periksa apakah sudah ada pending order milik bot
        pending = self._get_pending_order()
        if pending:
            pending_is_buy = (pending.type == mt5.ORDER_TYPE_BUY_LIMIT)
            if (is_buy and not pending_is_buy) or (not is_buy and pending_is_buy):
                self._cancel_pending_order(pending, "Arah tren berbalik")
                pending = None
            else:
                if abs(pending.price_open - target_limit_price) >= 15.0:
                    new_sl = round(target_limit_price - sl_dist if is_buy else target_limit_price + sl_dist, 2)
                    new_tp = round(target_limit_price + TARGET_TP1_POINTS if is_buy else target_limit_price - TARGET_TP1_POINTS, 2)
                    req_mod = {
                        "action": mt5.TRADE_ACTION_MODIFY,
                        "order": pending.ticket,
                        "price": float(target_limit_price),
                        "sl": float(new_sl),
                        "tp": float(new_tp),
                    }
                    res_mod = mt5.order_send(req_mod)
                    if res_mod and res_mod.retcode == mt5.TRADE_RETCODE_DONE:
                        logger.info(f"Pending order #{pending.ticket} di-adjust ke EMA 21 baru: ${target_limit_price:,.2f}")
                return

        # 2. Jika belum ada pending order, tentukan pasang PENDING LIMIT atau MARKET DEAL
        need_market_deal = (is_buy and current_price <= target_limit_price) or (not is_buy and current_price >= target_limit_price)

        if need_market_deal:
            order_type = mt5.ORDER_TYPE_BUY if is_buy else mt5.ORDER_TYPE_SELL
            entry_p = current_price
            sl_price = round(entry_p - sl_dist if is_buy else entry_p + sl_dist, 2)
            tp1_price = round(entry_p + TARGET_TP1_POINTS if is_buy else entry_p - TARGET_TP1_POINTS, 2)

            req = {
                "action": mt5.TRADE_ACTION_DEAL,
                "symbol": SYMBOL_TARGET,
                "volume": float(FIXED_LOT),
                "type": order_type,
                "price": float(entry_p),
                "sl": float(sl_price),
                "tp": float(tp1_price),
                "deviation": 25,
                "magic": MAGIC_NUMBER,
                "comment": "Aureus Disc M5",
                "type_time": mt5.ORDER_TIME_GTC,
                "type_filling": filling,
            }
            res = mt5.order_send(req)
            if res and res.retcode == mt5.TRADE_RETCODE_DONE:
                self.tracked_ticket = res.order
                self.ladder_stage = 0
                self.entry_price = float(getattr(res, "price", entry_p))
                self.pos_type = direction

                msg = (
                    f"🔔 <b>[ORDER INSTAN — HARGA DISKON DI LANTAI EMA 21]</b>\n"
                    f"────────────────────────\n"
                    f"Aksi     : <b>{direction} {SYMBOL_TARGET}</b>\n"
                    f"Volume   : <b>{FIXED_LOT} lot</b> (Fixed)\n"
                    f"Harga    : ${self.entry_price:,.2f}\n"
                    f"Batas SL : ${sl_price:,.2f} (-${sl_dist*0.01:.2f} USD)\n"
                    f"Target TP: ${tp1_price:,.2f} (+${TARGET_TP1_POINTS*0.01:.2f} USD)\n"
                    f"Alasan   : {' • '.join(reasons)}\n"
                    f"Saldo    : ${acc_info.get('balance', 0.0):.2f} USD\n"
                    f"────────────────────────\n"
                    f"<i>Posisi dikawal 24/7 dengan Tangga Profit (+60, +100, +140 pts).</i>"
                )
                self.telegram.send(msg)
                logger.info(f"Order instan {direction} sukses: Ticket #{res.order}")
            else:
                logger.warning(f"Order instan gagal: {getattr(res, 'retcode', 'None')} - {getattr(res, 'comment', '')}")
        else:
            order_type = mt5.ORDER_TYPE_BUY_LIMIT if is_buy else mt5.ORDER_TYPE_SELL_LIMIT
            sl_price = round(target_limit_price - sl_dist if is_buy else target_limit_price + sl_dist, 2)
            tp1_price = round(target_limit_price + TARGET_TP1_POINTS if is_buy else target_limit_price - TARGET_TP1_POINTS, 2)

            req = {
                "action": mt5.TRADE_ACTION_PENDING,
                "symbol": SYMBOL_TARGET,
                "volume": float(FIXED_LOT),
                "type": order_type,
                "price": float(target_limit_price),
                "sl": float(sl_price),
                "tp": float(tp1_price),
                "deviation": 25,
                "magic": MAGIC_NUMBER,
                "comment": "Aureus Limit EMA21",
                "type_time": mt5.ORDER_TIME_GTC,
                "type_filling": filling,
            }
            res = mt5.order_send(req)
            if res and res.retcode == mt5.TRADE_RETCODE_DONE:
                msg = (
                    f"🎯 <b>[JARING LIMIT ORDER TERPASANG DI EMA 21]</b>\n"
                    f"────────────────────────\n"
                    f"Tipe     : <b>{direction}_LIMIT {SYMBOL_TARGET}</b>\n"
                    f"Volume   : <b>{FIXED_LOT} lot</b>\n"
                    f"Jaring   : <b>${target_limit_price:,.2f}</b> (Lantai EMA 21 M5)\n"
                    f"Harga Now: ${current_price:,.2f} (Jarak jemput: {abs(current_price - target_limit_price):.1f} pts)\n"
                    f"Batas SL : ${sl_price:,.2f} (-${sl_dist*0.01:.2f} USD)\n"
                    f"Target TP: ${tp1_price:,.2f} (+${TARGET_TP1_POINTS*0.01:.2f} USD)\n"
                    f"Alasan   : {' • '.join(reasons)}\n"
                    f"Saldo    : ${acc_info.get('balance', 0.0):.2f} USD\n"
                    f"────────────────────────\n"
                    f"<i>Order otomatis aktif saat harga retest mengetuk lantai EMA 21.</i>"
                )
                self.telegram.send(msg)
                logger.info(f"Limit order {direction} sukses dipasang: Ticket #{res.order} @ {target_limit_price}")
            else:
                logger.warning(f"Gagal pasang limit order: {getattr(res, 'retcode', 'None')} - {getattr(res, 'comment', '')}")

    def _calc_rsi(self, series: list, period: int = 7) -> float:
        if len(series) < period + 1:
            return 50.0
        gains = []
        losses = []
        for i in range(1, len(series)):
            chg = series[i] - series[i-1]
            if chg >= 0:
                gains.append(chg)
                losses.append(0.0)
            else:
                gains.append(0.0)
                losses.append(abs(chg))
        avg_gain = sum(gains[-period:]) / period
        avg_loss = sum(losses[-period:]) / period
        if avg_loss == 0:
            return 100.0
        rs = avg_gain / avg_loss
        return 100.0 - (100.0 / (1.0 + rs))

    def _calc_ema(self, series: list, period: int) -> float:
        if len(series) < period:
            return series[-1]
        k = 2.0 / (period + 1)
        ema = series[0]
        for val in series[1:]:
            ema = (val * k) + (ema * (1.0 - k))
        return ema

    def _calc_macd_hist(self, closes: list) -> float:
        if len(closes) < 26:
            return 0.0
        ema12 = self._calc_ema(closes, 12)
        ema26 = self._calc_ema(closes, 26)
        macd_line = ema12 - ema26
        # Rough signal approximation
        return macd_line

    def _calc_supertrend(self, candles: list, period: int = 10, multiplier: float = 2.5) -> str:
        """Kalkulasi SuperTrend standar dengan Trailing Upper/Lower Band dinamis."""
        if len(candles) < period + 1:
            return "BULLISH"
        
        trs = []
        for i in range(1, len(candles)):
            h = float(candles[i]["high"])
            l = float(candles[i]["low"])
            c_prev = float(candles[i - 1]["close"])
            trs.append(max(h - l, abs(h - c_prev), abs(l - c_prev)))
            
        if len(trs) < period:
            return "BULLISH"
            
        atr_vals = [sum(trs[:period]) / period]
        for i in range(period, len(trs)):
            atr_vals.append((atr_vals[-1] * (period - 1) + trs[i]) / period)
            
        offset = len(candles) - len(atr_vals)
        final_upper = 0.0
        final_lower = 0.0
        current_dir = "BULLISH"
        
        for i in range(len(atr_vals)):
            c_idx = i + offset
            h = float(candles[c_idx]["high"])
            l = float(candles[c_idx]["low"])
            close = float(candles[c_idx]["close"])
            hl2 = (h + l) / 2.0
            cur_atr = atr_vals[i]
            
            basic_upper = hl2 + (multiplier * cur_atr)
            basic_lower = hl2 - (multiplier * cur_atr)
            
            if i == 0:
                final_upper = basic_upper
                final_lower = basic_lower
                current_dir = "BULLISH" if close >= basic_lower else "BEARISH"
                continue
                
            prev_close = float(candles[c_idx - 1]["close"])
            prev_upper = final_upper
            prev_lower = final_lower
            prev_dir = current_dir
            
            # Trailing Lower Band
            if basic_lower > prev_lower or prev_close < prev_lower:
                final_lower = basic_lower
            else:
                final_lower = prev_lower
                
            # Trailing Upper Band
            if basic_upper < prev_upper or prev_close > prev_upper:
                final_upper = basic_upper
            else:
                final_upper = prev_upper
                
            if prev_dir == "BULLISH" and close < prev_lower:
                current_dir = "BEARISH"
            elif prev_dir == "BEARISH" and close > prev_upper:
                current_dir = "BULLISH"
            else:
                current_dir = prev_dir
                
        return current_dir

    def _calculate_adx(self, candles: list, period: int = 14) -> float:
        """Calculate 14-period Wilder's ADX on candles."""
        if len(candles) < period * 2:
            return 25.0
        highs = [c["high"] for c in candles]
        lows = [c["low"] for c in candles]
        closes = [c["close"] for c in candles]

        tr_list = []
        plus_dm = []
        minus_dm = []

        for i in range(1, len(candles)):
            h, l, prev_c = highs[i], lows[i], closes[i - 1]
            tr = max(h - l, abs(h - prev_c), abs(l - prev_c))
            tr_list.append(tr)

            up_move = h - highs[i - 1]
            down_move = lows[i - 1] - l

            if up_move > down_move and up_move > 0:
                plus_dm.append(up_move)
            else:
                plus_dm.append(0.0)

            if down_move > up_move and down_move > 0:
                minus_dm.append(down_move)
            else:
                minus_dm.append(0.0)

        if len(tr_list) < period:
            return 25.0

        tr_smooth = sum(tr_list[:period])
        plus_smooth = sum(plus_dm[:period])
        minus_smooth = sum(minus_dm[:period])

        dx_list = []
        for i in range(period, len(tr_list)):
            tr_smooth = tr_smooth - (tr_smooth / period) + tr_list[i]
            plus_smooth = plus_smooth - (plus_smooth / period) + plus_dm[i]
            minus_smooth = minus_smooth - (minus_smooth / period) + minus_dm[i]

            plus_di = 100.0 * (plus_smooth / tr_smooth) if tr_smooth > 0 else 0.0
            minus_di = 100.0 * (minus_smooth / tr_smooth) if tr_smooth > 0 else 0.0
            di_sum = plus_di + minus_di
            dx = 100.0 * (abs(plus_di - minus_di) / di_sum) if di_sum > 0 else 0.0
            dx_list.append(dx)

        if not dx_list:
            return 25.0

        adx = sum(dx_list[:period]) / min(len(dx_list), period)
        for i in range(period, len(dx_list)):
            adx = (adx * (period - 1) + dx_list[i]) / period

        return round(adx, 1)

    def get_status_text(self) -> str:
        pos = self._get_open_position()
        if pos:
            pnl = float(pos.profit)
            sign = "+" if pnl >= 0 else "-"
            stage_desc = "Belum Terkunci"
            if self.ladder_stage == 1: stage_desc = "Tangga 1 (+$0.30 Terkunci)"
            elif self.ladder_stage == 2: stage_desc = "Tangga 2 (+$0.60 Terkunci)"
            elif self.ladder_stage == 3: stage_desc = "Tangga 3 (+$1.00 Terkunci)"

            return (
                f"📊 <b>STATUS POSISI AKTIF</b>\n"
                f"────────────────────────\n"
                f"Ticket   : #{pos.ticket}\n"
                f"Simbol   : {pos.symbol}\n"
                f"Tipe     : {'BUY' if pos.type == mt5.ORDER_TYPE_BUY else 'SELL'}\n"
                f"Lot      : {pos.volume}\n"
                f"Entry    : ${pos.price_open:,.2f}\n"
                f"SL Saat  : ${pos.sl:,.2f}\n"
                f"TP Saat  : ${pos.tp:,.2f}\n"
                f"Floating : <b>{sign}${abs(pnl):.2f} USD</b>\n"
                f"Tangga   : <b>{stage_desc}</b>\n"
                f"Status   : Dikawal ketat oleh Bot Sniper."
            )
        else:
            now_ts = time.time()
            cd_desc = "Siaga Penuh"
            if self.circuit_breaker_active:
                cd_desc = "🛑 Rem Darurat Aktif (Istirahat s/d 00:00)"
            elif (now_ts - self.last_win_time) < WIN_COOLDOWN_SECONDS:
                rem = int(WIN_COOLDOWN_SECONDS - (now_ts - self.last_win_time))
                cd_desc = f"⏳ Jeda Pasca-Profit ({rem}s tersisa)"
            elif (now_ts - self.last_loss_time) < COOLDOWN_SECONDS:
                rem = int(COOLDOWN_SECONDS - (now_ts - self.last_loss_time))
                cd_desc = f"⏳ Jeda Pasca-CutLoss ({rem}s tersisa)"

            sign_td = "+" if self.daily_pnl_usd >= 0 else "-"
            cur_signal = self.latest_analysis.get("signal", "TUNGGU (WAIT)")
            direction = self.latest_analysis.get("direction", "WAIT")
            score = self.latest_analysis.get("score", 0)
            conf = self.latest_analysis.get("confidencePercent", 0)
            atr_val = self.latest_analysis.get("atr_m5", 90.0)
            reasons = self.latest_analysis.get("reasons", [])
            reasons_fmt = "\n".join([f"• {r}" for r in reasons[:3]]) if reasons else "• Menunggu konfluensi setup valid"

            # Klasifikasi Keputusan Gamblang (Buy / Sell / Tunggu Alasan Apa)
            pending = self._get_pending_order()
            if self.circuit_breaker_active:
                decision_badge = "🛑 KEPUTUSAN: DIKUNCI (REM DARURAT)"
                action_text = f"Rugi hari ini -${abs(self.daily_pnl_usd):.2f} USD melampaui batas (-${DAILY_LOSS_LIMIT_USD:.2f}). Bot istirahat total untuk melindungi modal."
            elif self.is_paused:
                decision_badge = "⏸️ KEPUTUSAN: DIJEDA TELEGRAM"
                action_text = "Analisa pasar tetap berjalan, tetapi eksekusi order MT5 dikunci. Ketik /start untuk mengaktifkan."
            elif pending:
                p_type = "BUY_LIMIT" if pending.type == mt5.ORDER_TYPE_BUY_LIMIT else "SELL_LIMIT"
                tick = mt5.symbol_info_tick(SYMBOL_TARGET)
                cp = tick.ask if pending.type == mt5.ORDER_TYPE_BUY_LIMIT else tick.bid if tick else pending.price_open
                dist = abs(cp - pending.price_open)
                decision_badge = f"🎯 JARING {p_type} AKTIF"
                action_text = f"Pending {p_type} #{pending.ticket} terpasang di ${pending.price_open:,.2f} (Lantai EMA 21 M5). Menunggu lilin retest menjemput diskon (jarak jemput: {dist:.1f} pts)."
            elif direction == "BUY":
                decision_badge = "🟢 KEPUTUSAN: SIAP PASANG BUY LIMIT"
                action_text = f"Setup BUY terkonfirmasi (Keyakinan: {conf}%). Jaring limit order siap dipasang di EMA 21."
            elif direction == "SELL":
                decision_badge = "🔴 KEPUTUSAN: SIAP PASANG SELL LIMIT"
                action_text = f"Setup SELL terkonfirmasi (Keyakinan: {conf}%). Jaring limit order siap dipasang di EMA 21."
            elif score > 0:
                decision_badge = f"🟡 CONDONG BUY ({conf}% / {int(CONFIDENCE_THRESHOLD)}%)"
                action_text = "Tren Makro NAIK, bot memantau jarak harga menuju lantai EMA 21."
            elif score < 0:
                decision_badge = f"🟡 CONDONG SELL ({conf}% / {int(CONFIDENCE_THRESHOLD)}%)"
                action_text = "Tren Makro TURUN, bot memantau jarak harga menuju atap EMA 21."
            else:
                decision_badge = "⚪ KEPUTUSAN: TUNGGU (PASAR NETRAL)"
                action_text = "Pasar tidak memiliki arah tren yang jelas (Sideways/Konsolidasi)."

            acc_info_str = ""
            if MT5_AVAILABLE:
                acc = mt5.account_info()
                if acc:
                    acc_info_str = f"• Saldo Akun  : <b>${acc.balance:.2f} USD</b> (Equity: ${acc.equity:.2f})\n"

            return (
                f"🤖 <b>KEPUTUSAN & STATUS BOT SNIPER</b>\n"
                f"────────────────────────\n"
                f"🎯 <b>Status : {decision_badge}</b>\n"
                f"📌 Sinyal : <b>{cur_signal}</b>\n"
                f"💡 Penjelasan:\n<i>{action_text}</i>\n\n"
                f"🔍 <b>Kondisi Pasar Terkini:</b>\n"
                f"{reasons_fmt}\n"
                f"• Volatilitas : ATR M5 {atr_val} pts (Batas aman: {MAX_ATR_M5_THRESHOLD:.0f})\n\n"
                f"💼 <b>Status Keuangan Broker:</b>\n"
                f"{acc_info_str}"
                f"• PnL Hari Ini : <b>{sign_td}${abs(self.daily_pnl_usd):.2f} USD</b> (Batas: -${DAILY_LOSS_LIMIT_USD:.2f})\n"
                f"• Kesiapan   : {cd_desc}\n"
                f"────────────────────────\n"
                f"<i>Bot mengawal modal secara disiplin tanpa emosi.</i>"
            )

    def get_balance_text(self) -> str:
        if not MT5_AVAILABLE:
            return "Terminal MT5 tidak tersedia."
        acc = mt5.account_info()
        if not acc:
            return "Gagal membaca info akun MT5."
        return (
            f"💼 <b>INFORMASI KEUANGAN EXNESS</b>\n"
            f"────────────────────────\n"
            f"Akun     : #{acc.login} ({acc.server})\n"
            f"Saldo    : <b>${acc.balance:.2f} {acc.currency}</b>\n"
            f"Equity   : <b>${acc.equity:.2f} {acc.currency}</b>\n"
            f"Margin   : ${acc.margin:.2f} USD\n"
            f"Free Mar : ${acc.margin_free:.2f} USD\n"
            f"Leverage : 1:{acc.leverage}\n"
            f"Broker   : {acc.company}"
        )

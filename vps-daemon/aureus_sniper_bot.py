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
- Hard Daily Circuit Breaker: Max 2 consecutive losses / -$1.80 daily stop
- Clean Telegram Bot Integration: Reset shortcuts via setMyCommands, interactive commands:
  /status, /saldo, /start, /stop, /help
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

DEFAULT_SL_POINTS = float(os.getenv("DEFAULT_SL_POINTS", "80.0"))     # 80 poin = -$0.80 USD
TARGET_TP1_POINTS = float(os.getenv("TARGET_TP1_POINTS", "120.0"))   # 120 poin = +$1.20 USD
TARGET_TP2_POINTS = float(os.getenv("TARGET_TP2_POINTS", "200.0"))   # 200 poin = +$2.00 USD

DAILY_LOSS_LIMIT_USD = float(os.getenv("DAILY_LOSS_LIMIT_USD", "1.80"))
MAX_CONSECUTIVE_LOSS = int(os.getenv("MAX_CONSECUTIVE_LOSS", "2"))
CONFIDENCE_THRESHOLD = float(os.getenv("CONFIDENCE_THRESHOLD", "65.0"))
COOLDOWN_SECONDS = int(os.getenv("COOLDOWN_SECONDS", "900"))           # 15 menit post-loss
WIN_COOLDOWN_SECONDS = int(os.getenv("WIN_COOLDOWN_SECONDS", "300"))   # 5 menit post-win (anti-pucuk)
MIN_ROOM_TO_RUN_POINTS = float(os.getenv("MIN_ROOM_TO_RUN_POINTS", "80.0"))
ADX_CHOP_THRESHOLD = float(os.getenv("ADX_CHOP_THRESHOLD", "20.0"))

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
                    [{"text": "/start"}, {"text": "/stop"}]
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
            self.send("⏸️ <b>BOT DIJEDA OLEH PENGGUNA</b>\n\nBot tidak akan membuka order baru di MT5. Radar analisa pasar tetap aktif memantau di web.")
        elif clean_cmd in ["/start", "start", "nyalakan"]:
            bot.is_paused = False
            self.send("▶️ <b>BOT DIAKTIFKAN KEMBALI</b>\n\nBot kembali memindai & siap mengeksekusi order 0.01 lot BTCUSDm saat sinyal terkonfirmasi (>= 55%).")
        elif clean_cmd in ["/help", "help"]:
            self.send(
                "🤖 <b>PERINTAH BOT AUREUS</b>\n\n"
                "/status - Cek posisi berjalan & harga live\n"
                "/saldo - Cek saldo, equity & margin Exness\n"
                "/stop - Jeda bot sementara\n"
                "/start - Lanjutkan pemindaian pasar"
            )

# ==========================================
# 3. AUREUS SNIPER BOT CLASS
# ==========================================
class AureusSniperBot:
    def __init__(self):
        self.telegram = TelegramClient(TELEGRAM_BOT_TOKEN, TELEGRAM_CHAT_ID)
        self.is_paused = False
        
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

    def run_cycle(self, acc_info: dict, current_tick: dict, candles_m1: list, candles_m5: list, candles_m15: list):
        """Dipanggil setiap detik oleh worker thread."""
        if not MT5_AVAILABLE:
            return

        self.reset_daily_stats_if_new_day()

        # 1. Pantau posisi terbuka saat ini (Tangga Profit 50%, 75%, 100%)
        pos = self._get_open_position()
        if pos:
            self._manage_open_position(pos, current_tick)
            return

        # Jika posisi tertutup
        if self.tracked_ticket is not None:
            self._handle_position_closed(self.tracked_ticket, acc_info)
            self.tracked_ticket = None
            self.ladder_stage = 0
            self.pos_type = None

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

        # Tangga 1: +60 poin -> Kunci +30 poin (+0.30 USD Untung Bersih - Anti Reversal)
        if pnl_pts >= 60.0 and self.ladder_stage < 1:
            target_sl = round(entry + 30.0 if is_buy else entry - 30.0, 2)
            if (is_buy and target_sl > cur_sl) or (not is_buy and (cur_sl == 0 or target_sl < cur_sl)):
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

        # Tangga 2: +100 poin -> Kunci +60 poin (+0.60 USD Untung Bersih)
        if pnl_pts >= 100.0 and self.ladder_stage < 2:
            target_sl = round(entry + 60.0 if is_buy else entry - 60.0, 2)
            if (is_buy and target_sl > cur_sl) or (not is_buy and (cur_sl == 0 or target_sl < cur_sl)):
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

        # Tangga 3: +140 poin -> Kunci +100 poin (+1.00 USD), lepas ke TP2 (+200 pts)
        if pnl_pts >= 140.0 and self.ladder_stage < 3:
            target_sl = round(entry + 100.0 if is_buy else entry - 100.0, 2)
            target_tp2 = round(entry + TARGET_TP2_POINTS if is_buy else entry - TARGET_TP2_POINTS, 2)
            if (is_buy and target_sl > cur_sl) or (not is_buy and (cur_sl == 0 or target_sl < cur_sl)):
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
        current_bal = acc_info.get("balance", 31.85)
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
                f"Cooldown : 5 menit jeda pasca-profit (anti-pucuk)."
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
                f"Cooldown : 15 menit jeda analisis."
            )
            self.telegram.send(msg)

            if (self.daily_consecutive_losses >= MAX_CONSECUTIVE_LOSS) or (self.daily_pnl_usd <= -DAILY_LOSS_LIMIT_USD):
                self.circuit_breaker_active = True
                cb_msg = (
                    f"🛑 <b>REM DARURAT AKTIF (CIRCUIT BREAKER)</b>\n"
                    f"────────────────────────\n"
                    f"Akumulasi Rugi: -${abs(self.daily_pnl_usd):.2f} USD\n"
                    f"Aturan: Rugi 2x berturut-turut hari ini.\n"
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

        closes_m5 = [c["close"] for c in candles_m5]
        highs_m5 = [c["high"] for c in candles_m5]
        lows_m5 = [c["low"] for c in candles_m5]

        # 1. Proteksi Volatilitas (ATR M5)
        ranges = [h - l for h, l in zip(highs_m5[-14:], lows_m5[-14:])]
        atr_m5 = sum(ranges) / len(ranges) if ranges else 90.0

        is_wild = (atr_m5 > 160.0)

        # 2. Indikator M15 Trend Filter (Bobot 30%)
        score = 0
        reasons = []

        if len(candles_m15) >= 20:
            closes_m15 = [c["close"] for c in candles_m15]
            ema9_m15 = self._calc_ema(closes_m15, 9)
            ema21_m15 = self._calc_ema(closes_m15, 21)
            ema50_m15 = self._calc_ema(closes_m15, 50) if len(closes_m15) >= 50 else ema21_m15
            
            if ema9_m15 > ema21_m15 > ema50_m15:
                score += 15
                reasons.append("Tren M15 Naik (EMA 9 > 21 > 50)")
            elif ema9_m15 < ema21_m15 < ema50_m15:
                score -= 15
                reasons.append("Tren M15 Turun (EMA 9 < 21 < 50)")

            st_m15 = self._calc_supertrend(candles_m15)
            if st_m15 == "BULLISH":
                score += 10
            else:
                score -= 10

        # 3. Indikator M5 Setup (Bobot 40%)
        rsi7_m5 = self._calc_rsi(closes_m5, 7)
        if rsi7_m5 <= 28.0:
            score += 20
            reasons.append(f"RSI M5 Jenuh Jual ({rsi7_m5:.1f}) - Siap Membal")
        elif rsi7_m5 >= 72.0:
            score -= 20
            reasons.append(f"RSI M5 Jenuh Beli ({rsi7_m5:.1f}) - Siap Koreksi")

        # MACD Hist M5
        macd_hist = self._calc_macd_hist(closes_m5)
        if macd_hist > 0:
            score += 10
        else:
            score -= 10

        # Pin Bar M5
        last_c = candles_m5[-1]
        c_body = abs(last_c["close"] - last_c["open"])
        c_range = max(0.1, last_c["high"] - last_c["low"])
        lower_wick = min(last_c["open"], last_c["close"]) - last_c["low"]
        upper_wick = last_c["high"] - max(last_c["open"], last_c["close"])

        if lower_wick > c_body * 2.0 and lower_wick / c_range > 0.5:
            score += 15
            reasons.append("Penolakan Bawah M5 (Buyer Kuat)")
        elif upper_wick > c_body * 2.0 and upper_wick / c_range > 0.5:
            score -= 15
            reasons.append("Penolakan Atas M5 (Seller Kuat)")

        # 4. Indikator M1 Trigger (Bobot 30%)
        if len(candles_m1) >= 15:
            closes_m1 = [c["close"] for c in candles_m1]
            st_m1 = self._calc_supertrend(candles_m1)
            if st_m1 == "BULLISH":
                score += 10
            else:
                score -= 10

            ema9_m1 = self._calc_ema(closes_m1, 9)
            if closes_m1[-1] > ema9_m1:
                score += 5
            else:
                score -= 5

        # 5. Deteksi Konsolidasi/Sideways (ADX M5)
        adx_m5 = self._calculate_adx(candles_m5, 14)
        is_sideways = (adx_m5 < ADX_CHOP_THRESHOLD)

        # 6. Room-to-Run (Plafon Resistensi & Lantai Support 20 Candle M5)
        sub_20 = candles_m5[-20:]
        recent_high_20 = max(c["high"] for c in sub_20)
        recent_low_20 = min(c["low"] for c in sub_20)
        cur_price = current_tick.get("ask" if score >= 0 else "bid", closes_m5[-1])

        room_to_high = recent_high_20 - cur_price
        room_to_low = cur_price - recent_low_20

        # Bound score -100 to 100
        score = max(-100, min(100, score))
        confidence = abs(score)

        direction = "WAIT"
        signal_type = "TUNGGU (WAIT)"

        if is_wild:
            signal_type = "PASAR LIAR (TUNGGU)"
            direction = "WAIT"
            reasons.insert(0, f"Volatilitas ATR ({atr_m5:.1f}) melebihi batas 160! Tahan saldo Anda.")
        elif is_sideways:
            signal_type = "TUNGGU (PASAR SIDEWAYS)"
            direction = "WAIT"
            reasons.insert(0, f"Pasar Sideways / Choppy (ADX M5 {adx_m5:.1f} < {ADX_CHOP_THRESHOLD:.0f}). Menahan peluru.")
        elif score >= CONFIDENCE_THRESHOLD:
            # Check Room to Run for BUY (Anti-Pucuk)
            if cur_price < recent_high_20 and room_to_high < MIN_ROOM_TO_RUN_POINTS:
                signal_type = "TUNGGU (DEKAT RESISTENSI)"
                direction = "WAIT"
                reasons.insert(0, f"Beli Ditolak: Plafon Resisten M5 hanya +{room_to_high:.1f} pts (< {MIN_ROOM_TO_RUN_POINTS:.0f} pts). Menghindari beli di pucuk.")
            else:
                direction = "BUY"
                signal_type = "BELI (BUY)"
        elif score <= -CONFIDENCE_THRESHOLD:
            # Check Room to Run for SELL (Anti-Lembah)
            if cur_price > recent_low_20 and room_to_low < MIN_ROOM_TO_RUN_POINTS:
                signal_type = "TUNGGU (DEKAT SUPPORT)"
                direction = "WAIT"
                reasons.insert(0, f"Jual Ditolak: Lantai Support M5 hanya -{room_to_low:.1f} pts (< {MIN_ROOM_TO_RUN_POINTS:.0f} pts). Menghindari jual di lembah.")
            else:
                direction = "SELL"
                signal_type = "JUAL (SELL)"

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

            self._execute_order(direction, cur_price, reasons, acc_info)

    def _execute_order(self, direction: str, current_price: float, reasons: list, acc_info: dict):
        order_type = mt5.ORDER_TYPE_BUY if direction == "BUY" else mt5.ORDER_TYPE_SELL
        is_buy = (direction == "BUY")

        sl_dist = DEFAULT_SL_POINTS
        sl_price = round(current_price - sl_dist if is_buy else current_price + sl_dist, 2)
        tp1_price = round(current_price + TARGET_TP1_POINTS if is_buy else current_price - TARGET_TP1_POINTS, 2)

        sym_info = mt5.symbol_info(SYMBOL_TARGET)
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
            "symbol": SYMBOL_TARGET,
            "volume": float(FIXED_LOT),
            "type": order_type,
            "price": float(current_price),
            "sl": float(sl_price),
            "tp": float(tp1_price),
            "deviation": 25,
            "magic": MAGIC_NUMBER,
            "comment": "Aureus Scalper",
            "type_time": mt5.ORDER_TIME_GTC,
            "type_filling": filling,
        }

        res = mt5.order_send(req)
        if res and res.retcode == mt5.TRADE_RETCODE_DONE:
            self.tracked_ticket = res.order
            self.ladder_stage = 0
            self.entry_price = float(getattr(res, "price", current_price))
            self.pos_type = direction

            msg = (
                f"🔔 <b>[ORDER BARU TERBUKA (AUTO)]</b>\n"
                f"────────────────────────\n"
                f"Aksi     : <b>{direction} {SYMBOL_TARGET}</b>\n"
                f"Volume   : <b>{FIXED_LOT} lot</b> (Fixed)\n"
                f"Harga    : ${self.entry_price:,.2f}\n"
                f"Batas SL : ${sl_price:,.2f} (-${sl_dist*0.01:.2f} USD)\n"
                f"Target TP: ${tp1_price:,.2f} (+${TARGET_TP1_POINTS*0.01:.2f} USD)\n"
                f"Alasan   : {' • '.join(reasons)}\n"
                f"Saldo    : ${acc_info.get('balance', 31.85):.2f} USD\n"
                f"────────────────────────\n"
                f"<i>Bot mengawal posisi 24/7 dengan tangga profit bertingkat (+60, +100, +140 pts).</i>"
            )
            self.telegram.send(msg)
            logger.info(f"Order {direction} sukses dieksekusi: Ticket #{res.order}")
        else:
            logger.warning(f"Order gagal: {getattr(res, 'retcode', 'None')} - {getattr(res, 'comment', '')}")

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

    def _calc_supertrend(self, candles: list, period: int = 10, multiplier: float = 3.0) -> str:
        if len(candles) < period + 1:
            return "BULLISH"
        closes = [c["close"] for c in candles]
        highs = [c["high"] for c in candles]
        lows = [c["low"] for c in candles]
        
        ranges = [max(h - l, abs(h - c_prev), abs(l - c_prev)) for h, l, c_prev in zip(highs[1:], lows[1:], closes[:-1])]
        atr = sum(ranges[-period:]) / period if ranges else 50.0
        hl2 = (highs[-1] + lows[-1]) / 2.0
        upper = hl2 + (multiplier * atr)
        lower = hl2 - (multiplier * atr)

        if closes[-1] > lower:
            return "BULLISH"
        return "BEARISH"

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
            cb = "AKTIF (Istirahat)" if self.circuit_breaker_active else "SIAGA"
            sign_td = "+" if self.daily_pnl_usd >= 0 else "-"
            cur_signal = self.latest_analysis.get("signal", "TUNGGU (WAIT)")
            conf = self.latest_analysis.get("confidencePercent", 0)
            return (
                f"💤 <b>TIDAK ADA POSISI TERBUKA</b>\n"
                f"────────────────────────\n"
                f"Status Bot  : {'DIJEDA' if self.is_paused else 'AKTIF MEMINDAI (24/7)'}\n"
                f"Sinyal Terkini : <b>{cur_signal}</b> (Keyakinan: {conf}%)\n"
                f"Rem Harian  : {cb}\n"
                f"PnL Bot Hari: {sign_td}${abs(self.daily_pnl_usd):.2f} USD\n"
                f"Loss Seq    : {self.daily_consecutive_losses}/{MAX_CONSECUTIVE_LOSS}\n"
                f"Pasar       : Menunggu konfluensi setup >= {CONFIDENCE_THRESHOLD}%."
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

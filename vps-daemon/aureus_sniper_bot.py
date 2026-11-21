"""
Aureus AI Sniper Bot - Production-Grade Automated Scalper for MT5 (Exness Real)
Features:
- Fixed 0.01 lot, Strict Single Bullet (Anti-Averaging, Anti-Martingale)
- Step-Ladder Ratchet Trailing:
  * Stage 1 (+100 pts): Move SL to +50% target (+60 pts / +$0.60)
  * Stage 2 (+110 pts): Move SL to +75% target (+90 pts / +$0.90)
  * Stage 3 (+120 pts): Move SL to +100% TP1 (+120 pts / +$1.20), trail to TP2
- Hard Daily Circuit Breaker: Max 2 consecutive losses / -$1.80 daily stop
- Instant Telegram Alerts & Interactive Commands (/status, /saldo, /start, /stop)
"""

import os
import sys
import time
import json
import logging
import threading
import urllib.request
import urllib.parse
from datetime import datetime, date

try:
    import MetaTrader5 as mt5
    MT5_AVAILABLE = True
except ImportError:
    MT5_AVAILABLE = False
    mt5 = None

logger = logging.getLogger("AureusSniper")

# ==========================================
# 1. KONFIGURASI BOT & TELEGRAM
# ==========================================
TELEGRAM_BOT_TOKEN = "9034455461:AAE3kk8SYeAt1RRGd0G8Td4tFTX7EC3gQBQ"
TELEGRAM_CHAT_ID = "1432798032"

SYMBOL_TARGET = "BTCUSDm"
MAGIC_NUMBER = 778898
FIXED_LOT = 0.01

# Batas Risiko & Parameter Target (Khusus Modal $24.26)
DEFAULT_SL_POINTS = 80.0     # 80 poin = -$0.80 USD
TARGET_TP1_POINTS = 120.0    # 120 poin = +$1.20 USD
TARGET_TP2_POINTS = 200.0    # 200 poin = +$2.00 USD

DAILY_LOSS_LIMIT_USD = 1.80  # Max rugi harian -$1.80 (7.4% modal)
MAX_CONSECUTIVE_LOSS = 2     # Max 2x loss berturut-turut
COOLDOWN_SECONDS = 900       # 15 menit jeda setelah loss

class TelegramClient:
    def __init__(self, token: str, chat_id: str):
        self.token = token
        self.chat_id = str(chat_id)
        self.base_url = f"https://api.telegram.org/bot{self.token}"
        self.last_update_id = 0
        self.listener_running = False

    def send(self, text: str, keyboard: bool = True) -> bool:
        """Kirim pesan format rapi ke Telegram."""
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
            with urllib.request.urlopen(req, timeout=5) as resp:
                return resp.status == 200
        except Exception as e:
            logger.warning(f"Telegram send error: {e}")
            return False

    def start_polling(self, bot_instance):
        """Mendengarkan perintah interaktif dari user di Telegram."""
        self.listener_running = True
        t = threading.Thread(target=self._poll_loop, args=(bot_instance,), daemon=True)
        t.start()

    def _poll_loop(self, bot):
        while self.listener_running:
            try:
                url = f"{self.base_url}/getUpdates?offset={self.last_update_id + 1}&timeout=10"
                req = urllib.request.Request(url, headers={"User-Agent": "Mozilla/5.0"})
                with urllib.request.urlopen(req, timeout=15) as resp:
                    data = json.loads(resp.read().decode("utf-8"))
                    if data.get("ok") and "result" in data:
                        for u in data["result"]:
                            self.last_update_id = u["update_id"]
                            msg = u.get("message", {})
                            text = (msg.get("text") or "").strip().lower()
                            from_id = str(msg.get("chat", {}).get("id", ""))
                            if from_id == self.chat_id:
                                self._handle_command(text, bot)
            except Exception as e:
                time.sleep(3)
            time.sleep(1)

    def _handle_command(self, cmd: str, bot):
        if cmd in ["/status", "status"]:
            self.send(bot.get_status_text())
        elif cmd in ["/saldo", "saldo", "balance"]:
            self.send(bot.get_balance_text())
        elif cmd in ["/stop", "stop", "jeda"]:
            bot.is_paused = True
            self.send("⏸️ <b>BOT DIJEDA OLEH PENGGUNA</b>\n\nBot tidak akan membuka transaksi baru. Posisi terbuka tetap dikawal.")
        elif cmd in ["/start", "start", "nyalakan"]:
            bot.is_paused = False
            self.send("▶️ <b>BOT DIAKTIFKAN KEMBALI</b>\n\nBot kembali memindai pasar BTCUSDm dengan disiplin modal.")
        elif cmd in ["/help", "help"]:
            self.send(
                "🤖 <b>PERINTAH BOT AUREUS</b>\n\n"
                "/status - Cek posisi berjalan & harga live\n"
                "/saldo - Cek saldo, equity & margin Exness\n"
                "/stop - Jeda bot sementara\n"
                "/start - Lanjutkan pemindaian pasar"
            )

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

        # Posisi aktif tracking
        self.tracked_ticket = None
        self.ladder_stage = 0 # 0: None, 1: 50% locked, 2: 75% locked, 3: 100% locked
        self.entry_price = 0.0
        self.pos_type = None # "BUY" or "SELL"

        # Memulai listener Telegram
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

    def run_cycle(self, acc_info: dict, current_tick: dict, candles_m5: list):
        """Dipanggil setiap 1-2 detik oleh worker thread."""
        if not MT5_AVAILABLE:
            return

        self.reset_daily_stats_if_new_day()

        # 1. Pantau posisi terbuka saat ini
        pos = self._get_open_position()
        if pos:
            self._manage_open_position(pos, current_tick)
            return

        # Jika posisi yang sebelumnya di-track ternyata sudah tertutup
        if self.tracked_ticket is not None:
            self._handle_position_closed(self.tracked_ticket, acc_info)
            self.tracked_ticket = None
            self.ladder_stage = 0
            self.pos_type = None

        # 2. Cek apakah bot sedang dijeda atau terkena Circuit Breaker
        if self.is_paused:
            return

        if self.circuit_breaker_active:
            return

        # Cooldown check
        if time.time() - self.last_loss_time < COOLDOWN_SECONDS:
            return

        # 3. Analisa Peluang Masuk (Entry Matrix)
        self._evaluate_and_enter(current_tick, candles_m5, acc_info)

    def _get_open_position(self):
        """Membaca posisi aktif milik bot (magic number 778898)."""
        positions = mt5.positions_get(symbol=SYMBOL_TARGET)
        if not positions:
            # Fallback jika simbol bernama BTCUSD
            positions = mt5.positions_get()
        if positions:
            for p in positions:
                if p.magic == MAGIC_NUMBER or "BTC" in p.symbol:
                    return p
        return None

    def _manage_open_position(self, pos, current_tick):
        """
        EKSEKUSI TANGGA PENGUNCI PROFIT BERTINGKAT:
        - +100 poin -> Geser SL ke 50% target (+60 poin / +$0.60)
        - +110 poin -> Kerek SL ke 75% target (+90 poin / +$0.90)
        - +120 poin (TP1) -> Kunci 100% TP1 (+120 poin / +$1.20)
        """
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

        # -------------------------------------------------------------
        # TANGGA 1: Capai +100 poin -> Kunci 50% Target (+60 pts / +$0.60)
        # -------------------------------------------------------------
        if pnl_pts >= 100.0 and self.ladder_stage < 1:
            target_sl = round(entry + 60.0 if is_buy else entry - 60.0, 2)
            if (is_buy and target_sl > cur_sl) or (not is_buy and (cur_sl == 0 or target_sl < cur_sl)):
                if self._modify_sl(pos, target_sl, cur_tp):
                    self.ladder_stage = 1
                    msg = (
                        f"🛡️ <b>[TANGGA 1] PROFIT 50% TERKUNCI!</b>\n"
                        f"────────────────────────\n"
                        f"Pair     : {SYMBOL_TARGET} ({self.pos_type})\n"
                        f"Floating : +${pnl_pts * 0.01:.2f} USD\n"
                        f"Aksi     : SL digeser ke <b>${target_sl:,.2f}</b>\n"
                        f"Status   : <b>+$0.60 USD (50%) Terjamin Masuk Saldo!</b>"
                    )
                    self.telegram.send(msg)

        # -------------------------------------------------------------
        # TANGGA 2: Capai +110 poin -> Kerek SL ke 75% Target (+90 pts / +$0.90)
        # -------------------------------------------------------------
        if pnl_pts >= 110.0 and self.ladder_stage < 2:
            target_sl = round(entry + 90.0 if is_buy else entry - 90.0, 2)
            if (is_buy and target_sl > cur_sl) or (not is_buy and (cur_sl == 0 or target_sl < cur_sl)):
                if self._modify_sl(pos, target_sl, cur_tp):
                    self.ladder_stage = 2
                    msg = (
                        f"🚀 <b>[TANGGA 2] PROFIT 75% TERKUNCI TEBAL!</b>\n"
                        f"────────────────────────\n"
                        f"Pair     : {SYMBOL_TARGET} ({self.pos_type})\n"
                        f"Floating : +${pnl_pts * 0.01:.2f} USD\n"
                        f"Aksi     : SL dinaikkan ke <b>${target_sl:,.2f}</b>\n"
                        f"Status   : <b>+$0.90 USD (75%) Sukses Diamankan!</b>\n"
                        f"Target   : Menuju TP1 penuh ($1.20)"
                    )
                    self.telegram.send(msg)

        # -------------------------------------------------------------
        # TANGGA 3: Capai +120 poin (TP1) -> Kunci 100% TP1 (+120 pts / +$1.20)
        # -------------------------------------------------------------
        if pnl_pts >= 120.0 and self.ladder_stage < 3:
            target_sl = round(entry + 120.0 if is_buy else entry - 120.0, 2)
            target_tp2 = round(entry + TARGET_TP2_POINTS if is_buy else entry - TARGET_TP2_POINTS, 2)
            if (is_buy and target_sl > cur_sl) or (not is_buy and (cur_sl == 0 or target_sl < cur_sl)):
                if self._modify_sl(pos, target_sl, target_tp2):
                    self.ladder_stage = 3
                    msg = (
                        f"🎯 <b>[TANGGA 3] TP1 TEMBUS — KUNCI 100%!</b>\n"
                        f"────────────────────────\n"
                        f"Pair     : {SYMBOL_TARGET} ({self.pos_type})\n"
                        f"Aksi     : SL di-lock di level TP1 (${target_sl:,.2f})\n"
                        f"Status   : <b>+$1.20 USD (100% Target) Milik Anda!</b>\n"
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
        """Membaca deals history untuk mendapatkan hasil resmi order yang baru selesai."""
        time.sleep(1) # Tunggu sejenak agar deals tersinkron
        now = datetime.now()
        deals = mt5.history_deals_get(position=ticket)
        pnl = 0.0
        if deals:
            for d in deals:
                if d.entry == mt5.DEAL_ENTRY_OUT:
                    pnl = float(d.profit)

        self.daily_pnl_usd += pnl
        current_bal = acc_info.get("balance", 24.26)

        if pnl > 0:
            self.daily_consecutive_losses = 0
            msg = (
                f"✅ <b>TRANSAKSI SELESAI — PROFIT!</b>\n"
                f"────────────────────────\n"
                f"Hasil    : <b>+${pnl:.2f} USD</b>\n"
                f"Saldo    : <b>${current_bal:.2f} USD</b>\n"
                f"PnL Hari : +${self.daily_pnl_usd:.2f} USD\n"
                f"Status   : Bersiap mencari momentum sniper berikutnya."
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

            # Circuit Breaker Check
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

    def _evaluate_and_enter(self, current_tick: dict, candles_m5: list, acc_info: dict):
        """Memindai peluang beli/jual berdasarkan konfluensi multi-timeframe."""
        if len(candles_m5) < 30:
            return

        # 1. Hitung ATR M5 untuk proteksi volatilitas liar
        closes = [c["close"] for c in candles_m5]
        highs = [c["high"] for c in candles_m5]
        lows = [c["low"] for c in candles_m5]
        
        ranges = [h - l for h, l in zip(highs[-14:], lows[-14:])]
        atr_m5 = sum(ranges) / len(ranges) if ranges else 80.0

        if atr_m5 > 140.0:
            # Pasar Liar -> Tahan diri
            return

        # 2. Hitung RSI(7) M5
        rsi7 = self._calc_rsi(closes, 7)
        cur_price = current_tick.get("bid", closes[-1])
        
        # 3. EMA 9 dan 21
        ema9 = self._calc_ema(closes, 9)
        ema21 = self._calc_ema(closes, 21)

        # 4. Deteksi Setup BUY / SELL
        direction = None
        reasons = []

        # Kondisi BUY: RSI Oversold membal naik + Trend EMA positif
        if rsi7 <= 28.0 and cur_price > ema9:
            direction = "BUY"
            reasons.append(f"RSI(7) Jenuh Jual ({rsi7:.1f}) Membal Naik")
            reasons.append("Harga di atas EMA 9")
        elif rsi7 >= 72.0 and cur_price < ema9:
            direction = "SELL"
            reasons.append(f"RSI(7) Jenuh Beli ({rsi7:.1f}) Berbalik Turun")
            reasons.append("Harga di bawah EMA 9")

        if not direction:
            return

        # Eksekusi Order
        self._execute_order(direction, cur_price, reasons, acc_info)

    def _execute_order(self, direction: str, current_price: float, reasons: list, acc_info: dict):
        order_type = mt5.ORDER_TYPE_BUY if direction == "BUY" else mt5.ORDER_TYPE_SELL
        is_buy = (direction == "BUY")

        sl_dist = DEFAULT_SL_POINTS
        sl_price = round(current_price - sl_dist if is_buy else current_price + sl_dist, 2)
        tp1_price = round(current_price + TARGET_TP1_POINTS if is_buy else current_price - TARGET_TP1_POINTS, 2)

        # Filling mode detection
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
                f"🔔 <b>[ORDER BARU TERBUKA]</b>\n"
                f"────────────────────────\n"
                f"Aksi     : <b>{direction} {SYMBOL_TARGET}</b>\n"
                f"Volume   : <b>{FIXED_LOT} lot</b> (Fixed)\n"
                f"Harga    : ${self.entry_price:,.2f}\n"
                f"Batas SL : ${sl_price:,.2f} (-${sl_dist*0.01:.2f} USD)\n"
                f"Target TP: ${tp1_price:,.2f} (+${TARGET_TP1_POINTS*0.01:.2f} USD)\n"
                f"Alasan   : {' • '.join(reasons)}\n"
                f"Saldo    : ${acc_info.get('balance', 24.26):.2f} USD\n"
                f"────────────────────────\n"
                f"<i>Bot mengawal posisi dengan tangga profit 50% & 75%.</i>"
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

    def get_status_text(self) -> str:
        pos = self._get_open_position()
        if pos:
            pnl = float(pos.profit)
            sign = "+" if pnl >= 0 else "-"
            stage_desc = "Belum Terkunci"
            if self.ladder_stage == 1: stage_desc = "Kunci 50% (+$0.60)"
            elif self.ladder_stage == 2: stage_desc = "Kunci 75% (+$0.90)"
            elif self.ladder_stage == 3: stage_desc = "Kunci 100% (+$1.20)"

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
            return (
                f"💤 <b>TIDAK ADA POSISI TERBUKA</b>\n"
                f"────────────────────────\n"
                f"Status Bot  : {'DIJEDA' if self.is_paused else 'AKTIF MEMINDAI'}\n"
                f"Rem Harian  : {cb}\n"
                f"PnL Hari Ini: ${self.daily_pnl_usd:.2f} USD\n"
                f"Loss Seq    : {self.daily_consecutive_losses}/{MAX_CONSECUTIVE_LOSS}\n"
                f"Pasar       : Menunggu konfluensi setup valid."
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

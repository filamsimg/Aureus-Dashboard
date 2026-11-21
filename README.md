# ⚡ Aureus AI - BTC Scalping Radar (Next.js + Neon + Vercel + Gemini)

Aplikasi Web Scalping Bitcoin (BTC) modern berbasis **Next.js 14 (App Router)**, **Neon Serverless PostgreSQL**, dan **Google Gemini AI**. Dirancang khusus untuk trader manual **Exness Akun Real Standard** dengan **modal $20 USD**.

Aplikasi ini berjalan **100% STANDALONE** tanpa perlu login atau akses ke akun MT5 Anda, serta siap di-deploy langsung ke **Vercel** secara gratis agar bisa diakses kapan saja dari HP atau laptop.

---

## 🌟 Fitur Utama Sistem

### 1. 🛡️ Sniper Mode untuk Akun Real Standard ($20 Capital)
* **Volume Terkunci di `0.01 lot`**: Disesuaikan dengan batas minimum broker Exness pada simbol `BTCUSD`.
* **Batas Ketat Stop Loss (70 – 130 Poin)**: Kerugian maksimal saat SL tersentuh dibatasi hanya **-$0.70 s/d -$1.30** (hanya 3.5% – 6.5% dari saldo $20 Anda).
* **Fitur Volatility Risk Gate**: Jika volatilitas pasar M5 sedang liar (ATR > 140 pts) di mana SL butuh jarak lebih dari $140, sistem **OTOMATIS MENOLAK ENTRY / STATUS WAIT** agar modal $20 Anda tidak terancam!
* **Target Realistis**:
  * **TP1 (Quick Scalp - R:R 1:1.5)**: Amankan profit +$1.05 s/d +$1.95 (+5% - 10%). *Begitu TP1 tercapai, segera ubah SL ke Entry (BEP) agar trade menjadi 100% Bebas Risiko!*
  * **TP2 (Optimal Scalp - R:R 1:2.5)**: Target profit penuh +$1.75 s/d +$3.25 (+8% - 16%).

### 2. 🧠 Google Gemini AI Copilot (Second Opinion)
* Dilengkapi tombol **"Review Gemini AI"**.
* Gemini menganalisa parameter teknis yang sudah terhitung secara matematis di browser dan memberikan opini apakah setup ini layak diambil, risiko psikologisnya, dan konfirmasi candle terakhir sebelum Anda buka MT5.

### 3. 📊 Jurnal Trading Terkoneksi ke Neon Serverless PostgreSQL
* Setiap kali Anda mengeksekusi trade di MT5, klik **"Catat Trade Manual ke Jurnal MT5"**.
* Data tersimpan permanen di cloud **Neon DB** (dengan *fallback local memory* jika database belum dikonfigurasi).
* Melacak **Win Rate (%)**, **Total PnL ($)**, dan **Profit Factor**.

### 4. 📈 Interactive Candlestick Chart
* Menggunakan **TradingView Lightweight Charts v4**.
* Menampilkan garis otomatis untuk **Entry Scalp (Cyan)**, **Stop Loss (Merah)**, **TP1 (Hijau)**, dan **TP2 (Toska)**.

### 5. 📋 1-Click Copy Tools
* Tombol salin instan untuk **Entry**, **Stop Loss**, **TP1**, **TP2**, dan **Lot** untuk langsung di-paste ke aplikasi MT5 HP atau PC.

---

## 🚀 Cara Menjalankan Secara Lokal (Windows)

Cukup **Double-Click** file:
```
start-nextjs.bat
```
Browser akan otomatis membuka `http://localhost:3005`.

Atau via Terminal:
```bash
npm run start -- -p 3005
```

---

## ☁️ Panduan Deploy ke Vercel (Gratis & Online 24/7)

Anda bisa meng-online-kan web ini ke Vercel dalam 2 menit agar bisa dibuka dari HP Anda di mana saja:

1. **Push Proyek ke GitHub**:
   ```bash
   git init
   git add .
   git commit -m "feat: Aureus AI Next.js BTC Scalper"
   git branch -M main
   git remote add origin https://github.com/[username-kamu]/[nama-repo].git
   git push -u origin main
   ```
2. **Import ke Vercel**:
   - Buka [vercel.com](https://vercel.com) dan login dengan akun GitHub Anda.
   - Klik **"Add New..."** ➔ **"Project"**.
   - Pilih repository GitHub Anda tadi.
3. **Isi Environment Variables di Vercel**:
   - `GEMINI_API_KEY`: Kunci API Google Gemini gratis dari [Google AI Studio](https://aistudio.google.com/app/apikey).
   - `DATABASE_URL`: Connection string PostgreSQL dari [Neon Console](https://neon.tech) (gratis).
4. **Deploy**:
   - Klik **"Deploy"**. Dalam 1 menit, web Anda sudah live di link `https://nama-web-kamu.vercel.app`!

---

## 📱 Panduan Eksekusi Trading Manual di Exness MT5

1. Buka dashboard web di HP atau laptop Anda.
2. Perhatikan kartu sinyal:
   - Jika muncul **`SNIPER SCALP BUY`** atau **`SNIPER SCALP SELL`**:
     - Klik tombol **"Review Gemini AI"** untuk membaca evaluasi sentimen.
     - Klik tombol **Copy SL** dan **Copy TP1**.
     - Buka aplikasi MT5 Exness Anda secara mandiri -> buka simbol **`BTCUSD`**.
     - Pasang volume **`0.01 lot`**, tempelkan SL dan TP1, lalu tekan tombol Buy/Sell.
     - Di web dashboard, klik **"Catat Trade Manual ke Jurnal MT5"**.
   - Jika muncul **`WAIT / NO SETUP`** atau **`WAIT / VOLATILITY TOO HIGH`**:
     - **Disiplin untuk tidak membuka posisi**. Menjaga saldo $20 Anda adalah kunci utama trader sukses.
3. **Aturan Wajib BEP**:
   - Begitu harga mencapai target **TP1**, segera edit posisi Anda di MT5 dan ubah harga Stop Loss ke harga Entry awal. Dengan demikian, sisa trade Anda menuju TP2 sudah **100% Bebas Risiko (Risk-Free)**!

# Aureus AI Trading - Project Rules & Operating Standards (SSOT)

> File aturan permanen untuk agen AI. Aturan ini wajib dipatuhi dalam setiap pengembangan, perbaikan, maupun deployment di proyek ini.

---

## 1. Arsitektur Single Source of Truth (SSOT) & Keamanan Kredensial
- **Zero Secret Leaks**: DILARANG KERAS melakukan hardcode terhadap password VPS, token Telegram, API key, atau kredensial broker di file kode manapun.
- **Penyimpanan Terpusat**: Seluruh kredensial rahasia disimpan eksklusif di `.env.local` (lokal) dan `C:\AureusBridge\.env` (VPS).
- **Frontend Isolation**: Frontend client browser TIDAK BOLEH mengetahui IP publik, port, atau URL jembatan VPS. Semua komunikasi browser wajib melalui proxy server Next.js (`/api/*`).
- **Template Bersih**: File `.env.example` dan `vps-daemon/.env.example` hanya boleh berisi nilai placeholder (`your_vps_ip_here`, `your_mt5_account_number`).

---

## 2. Standar Deployment Ganda (VPS Daemon + GitHub/Vercel)
Setiap kali ada penyesuaian kode, agen wajib melakukan sinkronisasi dua pintu:
1. **Sisi VPS**: Jika mengubah kode daemon (`vps-daemon/`), wajib deploy ke server VPS via `python scripts/deploy_vps.py` dan verifikasi bahwa daemon aktif listening di port 8000.
2. **Sisi Web / Vercel**: Jika mengubah kode antarmuka (`app/`, `components/`, `lib/`), wajib melakukan `git add`, `git commit`, dan `git push origin main` agar Vercel otomatis mengompilasi dan menyajikan versi terbaru.

---

## 3. Filosofi Otonom 24/7 (Tanpa Intervensi Manual)
- **Eksekusi 100% Otomatis**: Bot di VPS mengeksekusi order 0.01 lot di Exness Real secara mandiri saat konfluensi sinyal $\ge 65\%$, ruang gerak $\ge 80\text{ pts}$, ADX M5 $\ge 20$, dan tren M5 selaras (Hard Trend Gate: SuperTrend & EMA 21, Dilarang Counter-Trend/Pisau Jatuh). SL awal dikunci di 70 poin (-$0.70 USD) untuk meredam slippage broker.
- **Jurnal Otomatis**: Riwayat transaksi ditarik otomatis dari riwayat deal resmi broker MT5 (`/api/history`). DILARANG membuat tombol manual *"Salin Parameter"* atau *"Simpan ke Jurnal"*.
- **Kendali Satu Pintu Telegram**: Master switch trading hanya dikendalikan via chat Telegram pribadi (`@AureusAITraderBot`):
  - `/stop`: Mengunci eksekusi order MT5 (radar analisa di web tetap membaca pasar).
  - `/start`: Mengaktifkan kembali kesiagaan eksekusi order otomatis.
- **Web Dashboard Bersifat Read-Only (Radar Pemantau)**:
  1. Grafik Candlestick Live (M1, M5, M15, H1)
  2. Radar Status Keyakinan & Alasan Setup (SSOT dari VPS)
  3. Kalkulator Risiko Dinamis (membaca modal riil dari broker)
  4. Tabel Jurnal Deals Resmi MT5 (ter-update otomatis tanpa klik)

---

## 4. Kecepatan Kuantitatif & Bebas Bloatware
- Bot beroperasi dalam hitungan milidetik mengevaluasi candle matematika (M1, M5, M15, SuperTrend, EMA, RSI, ATR).
- Dilarang menyisipkan panggilan LLM/AI lambat berlatensi 2-3 detik di tengah eksekusi kuantitatif.
- Tidak boleh ada kartu analisis AI statis atau komponen yang menyedot token kuota tanpa faedah.

---

## 5. Kebersihan Repositori Git
- File `.gitignore` harus tetap ringkas dan ketat mengabaikan `.env*`, `.rdp`, `node_modules/`, `.next/`, `*.log`, dan file temporer.
- Jangan pernah menyimpan folder atau file *scratch* berisi kredensial ke dalam repositori.

---

## 6. Protokol Wajib 3-Pintu Sinkronisasi SSOT (Zero Reminders Guarantee)
DILARANG KERAS menyelesaikan tugas atau memberi tahu pengguna bahwa perbaikan telah selesai tanpa melakukan audit 3 pintu secara serentak bila ada parameter, rumus, atau logika trading yang diubah:
1. **Pintu 1 (Logika & Konstanta Pusat)**:
   - File konfigurasi `.env.local` dan `scripts/deploy_vps.py`.
   - Modul mesin di VPS (`vps-daemon/aureus_sniper_bot.py`) dan modul analisa web (`lib/scalpEngine.ts`).
   - Semua nilai angka didefinisikan satu kali di variabel global/konstanta. Dilarang menduplikasi angka secara manual.
2. **Pintu 2 (Pesan & Perintah Telegram)**:
   - Respon perintah bot (`/start`, `/status`, `/help`, `/saldo`).
   - Notifikasi push (`order baru`, `tangga profit terkunci`, `cooldown alert`, `cut loss`).
   - Semua string pesan WAJIB menggunakan f-string interpolasi langsung dari konstanta (`f"{int(CONFIDENCE_THRESHOLD)}%"`, `f"{int(MIN_ROOM_TO_RUN_POINTS)} pts"`, dsb.) dan DILARANG menulis teks angka statis (hardcoded).
3. **Pintu 3 (Radar Antarmuka Web & Vercel)**:
   - Komponen radar (`components/ScalpCard.tsx`), filter waktu jurnal (`components/JournalTable.tsx`), dan header informasi.
   - Verifikasi bahwa teks badge dan label di web selaras 100% dengan parameter aktif di VPS dan Telegram.

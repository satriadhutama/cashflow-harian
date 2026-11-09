# Cashflow Harian

Bot Telegram gratis untuk mencatat pemasukan dan pengeluaran melalui chat. Setiap pengguna mendapatkan Google Sheet terpisah, sehingga data tidak tercampur dan tautan laporan tidak dibagikan kepada pengguna lain.

## Fitur

- Input bebas: `makan siang 25rb tunai`
- Input terstruktur: `keluar 25000 makan makan siang`
- Pemasukan: `masuk 5jt gaji transfer`
- Tanggal mundur: `kemarin bensin 100rb gopay`, `5 november bayar listrik 450rb`
- Metode pembayaran otomatis: tunai, transfer, kartu, GoPay, OVO, DANA, ShopeePay
- Kategori otomatis
- Ringkasan harian, mingguan, bulanan, bulan tertentu, dan saldo keseluruhan
- Anggaran bulanan per kategori
- Satu Google Sheet pribadi per pengguna
- Daftar izin opsional untuk membatasi siapa yang boleh memakai bot

## Biaya

Solusi ini memakai Telegram, Google Apps Script, dan Google Sheets. Ketiganya dapat dipakai tanpa server berbayar selama pemakaian masih dalam batas kuota akun Google dan Telegram.

## Pemasangan

### 1. Buat bot Telegram

1. Buka Telegram dan cari `@BotFather`.
2. Kirim `/newbot`.
3. Ikuti petunjuk nama dan username bot.
4. Simpan token yang diberikan. Jangan menaruh token di file kode atau membagikannya kepada orang lain.

### 2. Buat proyek Google Apps Script

1. Buka [script.google.com](https://script.google.com) dan pilih **New project**.
2. Ubah nama proyek menjadi **Cashflow Harian**.
3. Salin isi `Code.gs` ke editor.
4. Buka **Project Settings**, aktifkan **Show appsscript.json manifest file in editor**, lalu ganti isinya dengan `appsscript.json` dari proyek ini.
5. Di **Project Settings > Script Properties**, tambahkan:
   - `BOT_TOKEN`: token dari BotFather.
   - `ADMIN_USER_ID`: Telegram user ID Anda. Ini disarankan agar bot tidak terbuka untuk umum. User ID dapat diketahui setelah deployment dengan mengirim pesan ke bot lalu melihat log, atau sementara kosongkan properti ini dan kirim `/id`.

### 3. Deploy sebagai Web App

1. Klik **Deploy > New deployment**.
2. Pilih jenis **Web app**.
3. Atur **Execute as** menjadi **Me**.
4. Atur **Who has access** menjadi **Anyone**.
5. Klik **Deploy**, setujui izin Google, lalu salin URL Web App yang berakhiran `/exec`.
6. Tambahkan Script Property `WEB_APP_URL` dengan URL tersebut.

### 4. Hubungkan Telegram

1. Di editor Apps Script, pilih fungsi `setWebhook` lalu klik **Run**.
2. Pilih fungsi `setBotCommands` lalu klik **Run**.
3. Buka bot di Telegram dan kirim `/start`.

Bot akan otomatis membuat dua jenis file di Google Drive akun pemasang:

- **Cashflow Harian - Daftar Pengguna** sebagai daftar internal.
- **Cashflow Harian - Nama Pengguna** sebagai laporan pribadi masing-masing pengguna.

## Menambahkan pengguna lain

Jika `ADMIN_USER_ID` telah diisi, pengguna baru akan melihat Telegram User ID miliknya saat mencoba memakai bot. Admin dapat mengizinkannya dengan:

```text
/izinkan 123456789
```

Untuk mencabut akses:

```text
/blokir 123456789
```

Setelah diizinkan, pengguna mengirim `/start`. Bot membuat Google Sheet baru khusus untuk pengguna tersebut. Pengguna lain tidak menerima tautan sheet itu.

## Contoh penggunaan

```text
makan siang 25rb tunai
keluar 100000 bensin gopay
masuk 5jt gaji transfer
kemarin bayar internet 350rb
5 november obat 120rb debit
```

Perintah laporan:

```text
/hariini
/mingguini
/bulanini
/laporan 2026-11
/saldo
/sheet
```

Anggaran:

```text
/anggaran makan 1500000
/anggaran transportasi 750000
/anggaran
```

## Struktur Google Sheet pribadi

- **Ringkasan**: pemasukan, pengeluaran, cashflow bersih, saldo, dan rincian kategori.
- **Transaksi**: semua catatan asli dan hasil pembacaan bot.
- **Anggaran**: batas bulanan, pemakaian, dan sisa setiap kategori.
- **Kategori**: daftar kategori pemasukan dan pengeluaran.

## Privasi

- Bot menolak pesan grup dan hanya memproses chat pribadi.
- Setiap Telegram User ID dipetakan ke file spreadsheet yang berbeda.
- Registry dan spreadsheet dibuat di Google Drive pemilik deployment.
- Jangan membagikan token bot atau URL spreadsheet.
- Pemilik deployment secara teknis tetap memiliki akses ke seluruh spreadsheet karena file dibuat di akun Google miliknya.

## Pengujian setelah pemasangan

Kirim pesan berikut secara berurutan:

```text
masuk 5000000 gaji transfer
makan siang 25000 tunai
kemarin bensin 100rb gopay
/hariini
/bulanini
/saldo
/sheet
```

Pastikan tiga transaksi muncul di tab **Transaksi**, angka di **Ringkasan** berubah, dan laporan Telegram sesuai.

## Catatan perubahan deployment

Jika kode diperbarui, buka **Deploy > Manage deployments > Edit**, pilih **New version**, lalu deploy ulang. URL Web App tetap dapat dipertahankan sehingga webhook tidak perlu diubah.

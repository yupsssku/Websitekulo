# VirtualSIM — Reseller Nomor Virtual OTP

Website reseller nomor virtual OTP menggunakan API RumahOTP.

## Cara Install di VPS

### 1. Upload ke VPS
```bash
scp -P 50488 -r vsim/ root@51.68.52.220:/root/
```

### 2. Masuk ke VPS & jalankan installer
```bash
ssh root@51.68.52.220 -p 50488
cd /root/vsim
bash install.sh
```

### 3. Edit API Key
Buka `server.js`, cari baris:
```javascript
API_KEY: 'MASUKKAN_API_KEY_RUMAHOTP',
```
Ganti dengan API Key RumahOTP kamu.

```bash
nano server.js
# Ctrl+X, Y, Enter untuk simpan

pm2 restart virtualsim
```

### 4. Akses Website
```
http://51.68.52.220:3000
```

## Daftar Admin
Saat register, masukkan kode admin: `ADMIN2025`
(Bisa diubah di server.js baris `ADMIN_CODE`)

## Konfigurasi (server.js)
| Variabel | Default | Keterangan |
|---|---|---|
| API_KEY | - | API Key RumahOTP (wajib diisi) |
| PROFIT_NOKOS | 500 | Markup per order (Rp) |
| PROFIT_DEPOSIT | 500 | Biaya admin deposit (Rp) |
| MIN_DEPOSIT | 2000 | Minimal deposit (Rp) |
| ADMIN_CODE | ADMIN2025 | Kode untuk daftar admin |
| PORT | 3000 | Port server |

## Fitur User
- Login & Register
- Dashboard saldo
- Beli nomor virtual (1000+ apps, 190+ negara)
- Deposit QRIS auto-verify
- Cek OTP real-time (auto-polling 5 detik)
- Cancel order + refund otomatis
- Riwayat order & deposit
- Profil user

## Fitur Admin
- Dashboard statistik lengkap
- Manajemen user (lihat, cari, detail)
- Tambah/kurangi/set saldo user
- Ban/unban user
- Monitor semua order
- Monitor semua deposit
- Log perubahan saldo

## PM2 Commands
```bash
pm2 status           # Cek status
pm2 logs virtualsim  # Lihat log
pm2 restart virtualsim  # Restart
pm2 stop virtualsim  # Stop
pm2 start virtualsim # Start
```

## Troubleshoot
- **Port sudah dipakai**: Ganti PORT di server.js
- **API error**: Cek API_KEY sudah benar
- **Database error**: `chmod 755 database/`

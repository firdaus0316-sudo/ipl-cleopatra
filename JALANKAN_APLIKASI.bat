@echo off
title Menjalankan Web Iuran Warga
cd /d "%~dp0"
set PATH=C:\Users\eri.raihanul_hijrahf\AppData\Local\Programs\nodejs;%PATH%

echo ===================================================
echo     MEMULAI APLIKASI WEB IURAN WARGA RT
echo ===================================================
echo Menyiapkan port dan server...

:: Bersihkan port 3000 jika masih ada proses sebelumnya yang menggantung
for /f "tokens=5" %%a in ('netstat -aon 2^>nul ^| findstr :3000 ^| findstr LISTENING') do (
    taskkill /f /pid %%a >nul 2>&1
)

:: Cek apakah folder build .next sudah ada
if not exist ".next" (
    echo Membangun aplikasi pertama kali...
    npm run build
)

echo Membuka browser di http://localhost:3000 ...
start http://localhost:3000

echo Menjalankan server aplikasi (Mode Cepat & Stabil)...
echo Jangan tutup jendela ini selama aplikasi digunakan.
echo ===================================================

npm run start

pause

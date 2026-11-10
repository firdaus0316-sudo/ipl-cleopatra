@echo off
title Push Kode IPL Cleopatra ke GitHub
cd /d "%~dp0"
echo ========================================================
echo   UPLOAD KODE IPL CLEOPATRA KE GITHUB
echo ========================================================
echo.
echo Sedang melakukan upload (git push) ke:
echo https://github.com/firdaus0316-sudo/ipl-cleopatra.git
echo.
echo Jika muncul jendela browser / GitHub login, silakan klik
echo "Sign in with your browser" dan "Authorize".
echo.
"C:\Users\eri.raihanul_hijrahf\AppData\Local\Programs\Git\cmd\git.exe" push -u origin main
echo.
if %ERRORLEVEL% EQU 0 (
    echo ========================================================
    echo   BERHASIL! Kode sudah ter-upload ke GitHub.
    echo   Sekarang Anda bisa kembali ke Vercel dan klik Deploy!
    echo ========================================================
) else (
    echo ========================================================
    echo   Terjadi kendala saat push. Silakan periksa koneksi
    echo   atau otorisasi login GitHub Anda.
    echo ========================================================
)
echo.
pause

@echo off
echo Make sure Ganache and IPFS Desktop are open first.
cd /d D:\blockcare\frontend
start "" cmd /c "timeout /t 6 /nobreak >nul & start http://localhost:5173"
call npm run dev
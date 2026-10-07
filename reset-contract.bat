@echo off
cd /d D:\blockcare
call truffle migrate --reset
copy /Y D:\blockcare\build\contracts\BlockCare.json D:\blockcare\frontend\src\BlockCare.json
pause
# echo $PSScriptRoot
start chrome http://localhost:4412/index
# node server/v2/main.js path="$PSScriptRoot"
./server/v3/server-v3.exe path="$PSScriptRoot"
pause

# echo $PSScriptRoot
start chrome http://localhost:4412/index
node server/v2.js path="$PSScriptRoot"
pause

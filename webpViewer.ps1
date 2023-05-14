# echo $PSScriptRoot
start chrome http://localhost:4412/
node path/to/the/repo/index.js path="$PSScriptRoot"
pause

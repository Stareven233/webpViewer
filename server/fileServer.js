// https://nodejs.cn/express/4x/api/
import express from 'express'

const app = express()
const port = 4413
// https://dev.nodejs.cn/learn/nodejs-accept-arguments-from-the-command-line/
// 第一个参数是 node 命令的完整路径。第二个参数是正被执行的文件的完整路径。所有其他的参数从第三个位置开始。
const staticRoot = process.argv[2] || 'D:/E_extension/expressStatics'
let serveOn = true

// app.use('/files', express.static(staticRoot))
app.get('/paper', async (req, res) => {
  if (!serveOn) {
    res.status(404).send('Cannot GET /paper')
    return
  }
  res.sendFile(`${staticRoot}/paper.pdf`)
  // res.sendFile('D:/code/Master/论文/hatte/paper-manual/manual.pdf')
})
app.get('/noteee', async (req, res) => {
  if (!serveOn) {
    res.status(404).send('Cannot GET /noteee')
    return
  }
  res.sendFile('D:/code/Master/论文/hatte/todo.md')
})

app.get('/status', (req, res) => {
  res.send(`status=${serveOn}`)
})

app.get('/status/:cmd', (req, res) => {
  serveOn = false
  if (req.params.cmd === 'ccc') {
    serveOn = true
  }
  res.send(`command ${req.params.cmd} and status is changed to ${serveOn}`)
})


app.listen(port, () => {
  // http://172.17.174.111:4413/paper
  console.log(`app run at http://localhost:${port}, static dir = ${staticRoot}`)
})

import express from 'express'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const app = express()
const port = 4412
const __dirname = path.dirname(fileURLToPath(import.meta.url))

// 前两个是node位置跟本文件位置
const argsList = process.argv.slice(2)
let key, root
for (const arg of argsList) {
  [key, root] = arg.split('=', 2)
  console.log(`${key}: ${root}`)
  if (key === 'path') {
    break
  }
}

if (!root) {
  console.error('error! please set static path by flag: "path=?"')
  process.exit(-1)
}

app.get('/', (req, res) => {
  // console.log(req)
  // res.send('static resources route: /static')
  res.sendFile(__dirname + '/webpViewer.html')
})
app.get('/status', (req, res) => {
  // req.query   // query参数，对象
  res.json({ root })
})
app.use('/static', express.static(root))

app.listen(port, () => {
  console.log(`app run at http://localhost:${port}/`)
})

// node index.js path='D:/movie/h/!jmcomic/commies'
// node index.js path='D:/movie/h/!bika/commies'
// node F:/CODE/Html/tools/webpViewer/index.js path='D:/movie/h/!bika/commies'

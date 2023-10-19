// https://nodejs.cn/express/4x/api/
import express from 'express'
import path from 'node:path'
import * as fs from 'node:fs/promises'

const app = express()
const port = 4412
const mountPoint = '/'
const appRoot = path.join(path.resolve('.'), 'dist')
let pwd = 'C:/'

app.get(mountPoint, (req, res) => {
  res.sendFile(path.join(appRoot, 'index.html'))
})
app.use(mountPoint, express.static(appRoot))

app.get('/list', async (req, res) => {
  // console.log('req.query :>> ', req.query)
  if (req.query.dir) {
    pwd = req.query.dir
  }
  try {
    const files = await fs.readdir(pwd, {withFileTypes: true})
    const file_arr = []
    for (const file of files) {
      file_arr.push({
        name: file.name,
        isFile: file.isFile(),
        isDirectory: file.isDirectory(),
        // isSymbolicLink: file.isSymbolicLink(),
      })
    }
    res.send(file_arr)
  } catch (err) {
    res.status(500).send(err)
  }
})

app.get('/pwd/:file', async (req, res) => {
  const fileName = req.params.file
  if (fileName === null) {
    return
  }
  res.sendFile(fileName, {root: pwd, dotfiles: 'allow'})
})

app.listen(port, () => {
  console.log(`app run at http://localhost:${port}${mountPoint}`)
})

// https://nodejs.cn/express/4x/api/
import express from 'express'
import path from 'node:path'
import * as fs from 'node:fs/promises'
import mhtml2html from 'mhtml2html'
import { JSDOM } from 'jsdom'

const app = express()
// const host = 'localhost'
const host = '0.0.0.0'
const port = 4412
const mountPoint = '/index'
const appRoot = path.join(path.resolve('.'), 'dist')

app.get(mountPoint, (req, res) => {
  res.sendFile(path.join(appRoot, 'index.html'))
})
app.use(mountPoint, express.static(appRoot))

app.get('/list', async (req, res) => {
  // console.log('req.query :>> ', req.query)
  const pwd = req.query.dir ?? 'C:/'
  try {
    const files = await fs.readdir(pwd, {withFileTypes: true})
    // fs.Dirent对象数组 https://nodejs.cn/api/fs.html#%E7%B1%BBfsdirent
    const file_arr = []
    for (const file of files) {
      let fileSize = 0
      const filePath = path.join(pwd, file.name)
      try {
        const stat = await fs.lstat(filePath)
        fileSize = stat.size
      } catch (error) {
        // 有些特殊文件无法读取，大小当做-1字节吧
        // {"errno": -4082, "code": "EBUSY", "syscall": "lstat", "path": "C:\\DumpStack.log.tmp" }
        fileSize = -1
        console.warn(`fs.stat: fail at ${filePath}`)
        continue
      }
      // console.log(file.name, stat)
      file_arr.push({
        name: file.name,
        size: fileSize,
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

app.get('/files', async (req, res) => {
  const pwd = req.query.dir
  const name = req.query.name
  if (!pwd || !name) {
    return
  }
  if (name.endsWith('.mhtml')) {
    // 将mhtml处理成html: https://github.com/msindwan/mhtml2html
    const contents = await fs.readFile(path.join(pwd, name), { encoding: 'utf8' })
    const html = await mhtml2html.parse(contents, { htmlOnly: true, parseDOM: h => new JSDOM(h) })
    // const html = (await JSDOM.fromFile(path.join(pwd, name))).serialize()
    res.contentType('text/html')
    res.send(html.serialize())
    return
  }
  res.sendFile(name, {root: pwd, dotfiles: 'allow'})
})

app.listen(port, () => {
  console.log(`app run at http://${host}:${port}${mountPoint}`)
})

// https://nodejs.cn/express/4x/api/
import express from 'express'
import path from 'node:path'
import * as fs from 'node:fs/promises'
import * as M from './htmlParser.js'
import multer from 'multer'


const app = express()
const host = 'localhost'
// const host = '0.0.0.0'
const port = 4412
const mountPoint = '/index'
const appRoot = path.join(path.resolve('.'), 'dist')
const upload = multer({ dest: 'uploads/' })


app.get(mountPoint, (req, res) => {
  res.sendFile(path.join(appRoot, 'index.html'))
})
app.use(mountPoint, express.static(appRoot))

app.get('/list', async (req, res) => {
  // console.log('req.query :>> ', req.query)
  let pwd = req.query.dir ?? 'C:/'
  if (pwd.endsWith(':')) {
    pwd = pwd + '/'
  }
  try {
    const files = await fs.readdir(pwd, {withFileTypes: true})
    // fs.Dirent对象数组 https://nodejs.cn/api/fs.html#%E7%B1%BBfsdirent
    const file_arr = []
    for (const file of files) {
      let fileSize = -1
      let mtime = 0
      const filePath = path.join(pwd, file.name)
      try {
        const stat = await fs.lstat(filePath)
        mtime = stat.mtimeMs
        fileSize = stat.size
      } catch (error) {
        // 有些特殊文件无法读取，大小当做-1字节吧
        // {"errno": -4082, "code": "EBUSY", "syscall": "lstat", "path": "C:\\DumpStack.log.tmp" }
        console.warn(error.toString())
        continue
      }
      // console.log(file.name, stat)
      file_arr.push({
        name: file.name,
        size: fileSize,
        mtime: mtime,
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
  const filePath = path.join(pwd, name)
  const ext = name.split(/\.(?=[^\.]+?$)/, 2)[1]

  switch (ext) {
    case 'mhtml':
      const html = await M.parseMHTMLIndex(filePath)
      res.contentType('text/html')
      res.send(html)
      return
    case 'html':
      const r = await M.checkHTMLResource(filePath)
      if (r) {
        const [dir, stem_uri] = r
        // 当然，dev模式下由于端口号不同不会生效
        app.use(stem_uri, express.static(dir))
      }
      break
    case 'jfif':
      res.contentType('image/jpeg')
      break
    default:
      break
  }
  res.sendFile(name, {root: pwd, dotfiles: 'allow'})
})

app.get(`${M.MHTMLENDPOINT}/*`, async (req, res) => {
  const result = M.ResourceCache.get(req.path)
  if (!result) {
    res.status(404).json({msg: 'not found'})
    return
  }
  res.contentType(result.type)
  res.send(result.content)
})

app.delete(M.MHTMLENDPOINT, async (req, res) => {
  M.ResourceCache.clear()
  res.status(200).json({msg: 'ok'})
})

app.post('/upload', upload.single('file'), async (req, res) => {
  const dir = req.query.dir
  const filePath = path.join(dir, req.file.originalname)
  try {
    // await fs.rename(req.file.path, filePath)
    await fs.copyFile(req.file.path, filePath)
    await fs.unlink(req.file.path)
    res.status(200).send({ message: 'File uploaded successfully' })
  } catch (error) {
    console.error('Error uploading file:', error)
    res.status(500).send({ message: 'Failed to upload file' })
  }
})

app.listen(port, () => {
  console.log(`app run at http://${host}:${port}${mountPoint}`)
})

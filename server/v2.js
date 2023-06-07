import express from 'express'
import path from 'node:path'

const app = express()
const mountPoint = '/app'
const port = 4412
// const appRoot = 'D:/code/Projects/webpViewer/dist'
const appRoot = path.join(path.resolve('..'), 'dist')


app.get(mountPoint, (req, res) => {
  res.sendFile(path.join(appRoot, 'index.html'))
})
app.use(mountPoint, express.static(appRoot))

app.listen(port, () => {
  console.log(`app run at http://localhost:${port}${mountPoint}`)
})

import * as fs from 'node:fs/promises'
import { Parser } from 'fast-mhtml'


export const ResourceCache = new Map()
export const MHTMLENDPOINT = '/mhtml-resources'
const parser = new Parser({
  rewriteFn(url) { 
    return `${MHTMLENDPOINT}/${url}`
  }
})


export async function parseMHTMLIndex(filePath) {
  '将mhtml处理成html资源数组: https://www.npmjs.com/package/fast-mhtml'

  let key = filePath
  const result = ResourceCache.get(key)
  if (result) {
    return result.content
  }
  const contents = await fs.readFile(filePath)
  const spitFiles = parser.parse(contents).rewrite().spit()
   // parse file; rewrite all links; return all contents
  // await fs.writeFile(filePath.replace('.mhtml', '.json'), JSON.stringify(result, null, 2))
  const index = spitFiles[0]
  if (index.type !== 'text/html') {
    const w = `parseMHTMLIndex: failed to parse html: ${filePath}, got ${index.type}`
    console.warn(w)
    return w
  }
  // 去掉index的filename属性，并返回对应的值
  ResourceCache.set(key, index) // remove hash and set in cache
  delete index.filename
  // console.log('ResourceCache :>> ', ResourceCache)
  for (const s of spitFiles.slice(1)) {
    key = s.filename.replace(/#.*/, '')
    delete s.filename
    ResourceCache.set(key, s) // remove hash and set in cache
  }
  // 返回首页html的资源
  return index.content
}


export async function checkHTMLResource(filePath) {
  '检查HTML是否引用了本地资源，默认位于同一目录下的某个文件夹内。若是则返回该文件夹名'

  const [name, ext] = filePath.split('.', 2)
  if (ext !== 'html') {
    console.warn(`checkHTMLResource: not html file: ${filePath}`)
    return null
  }
  // 默认html的资源文件夹名为html名+'_files'
  try {
    const dir = `${name}_files`
    await fs.access(dir, fs.constants.R_OK)
    let stem = dir.split(/\/|\\(?=[^\/\\]+$)/, 2)[1]
    stem = `/${encodeURIComponent(stem)}`
    return [dir, stem]
  } catch {
    return null
  }
}

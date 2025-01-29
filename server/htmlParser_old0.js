// mhtml2html版本，将所有资源以base64形式解析到单独的html文件中，很慢，而且有些bug
import * as fs from 'node:fs/promises'
import mhtml2html from 'mhtml2html'
import { JSDOM } from 'jsdom'


const MHTMLParsedObj = {
  "index": "<html-index-url>",
  "media": {
    "<asset-url>": {
      "data": "<resource-string>",
      "type": "<resource-type>",
      "encoding": "<resource-encoding>"
    }
  },
  "frames": {
    "<frame-id>": {
      "data": "<resource-string>",
      "id": "<frame-id>",
      "type:": "<resource-type>",
      "encoding": "<resource-encoding>"
    }
  }
}


function injectMedia2HTML(mobj) {
  const getAsset = (id, returnURI=false) => {
    // https://www.cnblogs.com/coder-Fish/p/15069767.html
    // data:text/css,xxxx (CSS代码)
    // data:text/css;base64,xxxx (base64编码的CSS代码)
    const asset = mobj.media[id]
    if (!asset) {
      console.warn('getDataURI error: ', id)
      return `error: id=${id}`
    }
    if (!returnURI) {
      return asset.data
    }
    if (asset.encoding === 'base64') {
      return `data:${asset.type};base64,${asset.data}`
    } else if (asset.type.startsWith('image/') && asset.encoding === 'binary') {
      const t  = new Buffer.from(asset.data, 'binary').toString('base64')
      return `data:${asset.type};base64,${t}`
    }
    // const isBase64 = asset.encoding === 'base64'
    // return `data:${asset.type}${isBase64? ';base64': ''},${asset.data}`
    return `data:${asset.type},${asset.data}`
  }

  // 默认只有且只处理第一个frame
  const frame = Object.values(mobj.frames)[0]
  const html = frame.data.replace(/\"|[\t\r\n]+/g, x => x==='\"'? '"': '')
  const dom = new JSDOM(html)
  const doc = dom.window.document

  for (const e of [...doc.head.getElementsByTagName('link')]) {
    // 不转成array会受到下面e.remove()的影响
    if (e.type !== 'text/css') {
      continue
    }
    const style = doc.createElement('style')
    style.innerHTML = getAsset(e.href)
    doc.head.appendChild(style)
    e.remove()
    // console.log('link', e.href)
  }
  for (const e of doc.body.getElementsByTagName('img')) {
    e.src = getAsset(e.src, true)
  }
  return dom.serialize()
}


export async function parseMHTML(filePath) {
  '将mhtml处理成html: https://github.com/msindwan/mhtml2html'

  const load = async encoding => {
    // const d = 'D:/documents/t'
    // const f = path.join(d, 'text.mhtml')
    let contents = await fs.readFile(filePath, { encoding: encoding })
    // mhtml2html@Error: Unexpected EOF: 要求mhtml文件最后有且只能有一个空行
    contents = contents.replace(/[\s\t\r\n]*$/, '\n')
    return mhtml2html.parse(contents, { htmlOnly: false, parseDOM: h => new JSDOM(h) })
  }

  let mobj = await load('utf-8')
  if (Object.values(mobj.frames)[0].encoding === 'binary') {
    mobj = await load('latin1')
  }

  // const h = new JSDOM(contents).serialize()
  // await fs.writeFile(filePath.replace('.mhtml', '.html'), h, { encoding: 'utf8' })
  // const mobj_json = JSON.stringify(mobj, null, 2)
  // await fs.writeFile(filePath.replace('.mhtml', '.json'), mobj_json, { encoding: 'latin1' })
  // return

  // 将对象转换为json并加入易读的缩进
  const html = injectMedia2HTML(mobj)
  return html
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

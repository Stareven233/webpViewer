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
    // FIXME htt=ps://p23.07pbc.cc/i/2024/07/26/uay5s9.jpg
    const asset = mobj.media[id]
    if (!asset) {
      console.warn('getDataURI error: ', id)
      return `error: id=${id}`
    }
    if (returnURI) {
      const isBase64 = asset.encoding === 'base64'
      return `data:${asset.type}${isBase64? ';base64': ''},${asset.data}`
    }
    return asset.data
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
  // 将mhtml处理成html: https://github.com/msindwan/mhtml2html

  // const d = 'D:/documents/t'
  // const f = path.join(d, 'text.mhtml')
  let contents = await fs.readFile(filePath, { encoding: 'utf8' })
  // mhtml2html@Error: Unexpected EOF: 要求mhtml文件最后有且只能有一个空行
  contents = contents.replace(/[\s\t\r\n]*$/, '\n')
  const mobj = await mhtml2html.parse(contents, { htmlOnly: false, parseDOM: h => new JSDOM(h) })
  // const c = await html.serialize()
  // 将对象转换为json并加入易读的缩进
  const html = injectMedia2HTML(mobj)
  return html
  // await fs.writeFile(f.replace('.mhtml', '.html'), html, { encoding: 'utf8' })
  // const mobj_json = JSON.stringify(mobj, null, 2)
  // await fs.writeFile(f.replace('.mhtml', '.json'), mobj_json, { encoding: 'utf8' })
}

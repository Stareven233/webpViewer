import { NoeFile, formatBytes } from './utils/format'


// 开发服务器 (serve 命令) 运行在 development （开发）模式，而 build 命令运行在 production （生产）模式
// 通过前缀开控制生产环境下不启用 server.proxy
const prefix = import.meta.env.DEV? '$api': ''


export const listDir = async (dir: string) => (await fetch(`${prefix}/list?dir=${encodeURIComponent(dir)}`)).json();


// export const getFile = async (path: string) => await fetch(`${prefix}/pwd/${path}`)
export const getBlob = async (file: NoeFile) => {
  if(!file.isFile && file.size<0) {
    return new Blob(['[no file selected]'], {type: 'text/warn'})
  }
  
  let blob: Blob
  const size = formatBytes(file.size, 'MB')
  // 大于5MB就先不显示
  if (size.value > 5) {
    blob = new Blob([`[too big file ${size.value}${size.scale}]`], {type: 'text/warn'})
  } else {
    // encode以避免#%等符号出现在文件名导致的问题，express默认进行decode
    const url = `${prefix}/pwd/${encodeURIComponent(file.name)}`
    blob = await (await fetch(url)).blob();
  }
  // console.log(filename, blob.type)
  return blob
}

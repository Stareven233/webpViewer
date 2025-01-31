import { NoeFile, FileType } from './utils/format.ts'
import { config } from './store.ts'


// 开发服务器 (serve 命令) 运行在 development （开发）模式，而 build 命令运行在 production （生产）模式
// 通过前缀开控制生产环境下不启用 server.proxy
const prefix = import.meta.env.DEV? '$api': ''


export const listDir = async (dir: string) => (await fetch(`${prefix}/list?dir=${encodeURIComponent(dir)}`)).json();


export const constructFileURL = (file: NoeFile) => {
  const url = `${prefix}/files?dir=${encodeURIComponent(file.dir)}&name=${encodeURIComponent(file.name)}`
  return url
}

// export const getFile = async (path: string) => await fetch(`${prefix}/pwd/${path}`)
export const getBlob = async (file: NoeFile) => {
  let blob: Blob

  if(file.type !== FileType.file && file.size.value<0) {
    return new Blob(['[no file selected]'], {type: 'text/warn'})
  }
  // const size = new FileSize(file.size, config.maxFileSize.scale)
  const size = file.size.fromScale(config.maxFileSize.scale)
  // 大于5MB就先不显示
  if (size.value > config.maxFileSize.value) {
    blob = new Blob([`[file oversize ${size.show()}/${config.maxFileSize.show()}]`], {type: 'text/warn'})
  } else {
    // encode以避免#%等符号出现在文件名导致的问题，express默认进行decode
    const url = constructFileURL(file)
    // console.log(file, size, url)
    blob = await (await fetch(url)).blob()
  }
  // console.log(filename, blob.type)
  return blob
}


export const uploadFile = async (dir: string, formData: FormData) => {
  const response = await fetch(`${prefix}/upload?dir=${encodeURIComponent(dir)}`, {
    method: 'POST',
    // headers: {
    //   'Content-Type': 'multipart/form-data'  // 让fetch自己设置才有边界 boundry
    // },
    body: formData,
  })

  if (!response.ok) {
    throw new Error(`HTTP error! status: ${response.status}`);
  }

  return response.json();
}

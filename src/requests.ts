import { NoeFile, FileType } from './utils/format.ts'
import { config } from './store.ts'


// 开发服务器 (serve 命令) 运行在 development （开发）模式，而 build 命令运行在 production （生产）模式
// 通过前缀开控制生产环境下不启用 server.proxy
const prefix = import.meta.env.DEV ? '$api' : ''


export const listDir = async (dir: string) => (await fetch(`${prefix}/list?dir=${encodeURIComponent(dir)}`)).json()


export const constructFileURL = (file: NoeFile) => {
  const url = `${prefix}/files?dir=${encodeURIComponent(file.dir)}&name=${encodeURIComponent(file.name)}`
  return url
}

export const constructDownloadURL = (file: NoeFile) => {
  const url = `${constructFileURL(file)}&download=1`
  return url
}

export type LinkTarget = {
  path: string
  isDirectory: boolean
}

/** 解析 Windows .lnk 或文件系统符号链接的本地目标。 */
export const getLinkTarget = async (dir: string, name: string): Promise<LinkTarget> => {
  const response = await fetch(`${prefix}/link-target?dir=${encodeURIComponent(dir)}&name=${encodeURIComponent(name)}`)
  if (!response.ok) {
    throw new Error(await response.text())
  }
  return response.json()
}

// export const getFile = async (path: string) => await fetch(`${prefix}/pwd/${path}`)
export const getBlob = async (file: NoeFile) => {
  let blob: Blob

  if (file.type !== FileType.file && file.size.value < 0) {
    return new Blob(['[no file selected]'], { type: 'text/warn' })
  }
  // const size = new FileSize(file.size, config.maxFileSize.scale)
  const size = file.size.fromScale(config.maxFileSize.scale)
  // 大于5MB就先不显示
  if (size.value > config.maxFileSize.value) {
    blob = new Blob([`[file oversize ${size.show()}/${config.maxFileSize.show()}]`], { type: 'text/warn' })
  } else {
    // encode以避免#%等符号出现在文件名导致的问题，express默认进行decode
    const url = constructFileURL(file)
    // console.log(file, size, url)
    blob = await (await fetch(url)).blob()
  }
  // console.log(filename, blob.type)
  return blob
}

/** 将后端返回的具体失败原因保留给调用方，而不是只显示 HTTP 状态码。 */
const readUploadError = async (response: Response) => {
  const content = await response.text()
  try {
    const payload = JSON.parse(content) as { message?: unknown }
    if (typeof payload.message === 'string' && payload.message) {
      return payload.message
    }
  } catch {
    // 非 JSON 错误响应直接回退为文本内容。
  }

  return content.trim() || response.statusText || `HTTP ${response.status}`
}

export const uploadFile = async (dir: string, formData: FormData) => {
  const response = await fetch(`${prefix}/upload?dir=${encodeURIComponent(dir)}`, {
    method: 'POST',
    // 让 fetch 设置 multipart boundary；手动设置 Content-Type 会导致服务端无法解析首个文件。
    body: formData,
  })

  if (!response.ok) {
    throw new Error(await readUploadError(response))
  }

  return response.json()
}

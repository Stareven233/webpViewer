export class NoeFile {
  public name: string
  public size: number
  public isFile: boolean
  public isDirectory: boolean

  constructor(name:string, size:number, isFile:boolean, isDirectory:boolean) {
    this.name = name
    this.size = size
    this.isFile = isFile
    this.isDirectory = isDirectory
  }

  public static path_join(...paths: string[]) {
    const old_paths = []
    const new_paths = []
    
    paths.forEach(p => {
      old_paths.push(...p.split('/'))
    })
    old_paths.slice(1, ).forEach(p => {
      if (p === '..') {
        const last = new_paths.pop()
        if (!!last) {
          new_paths.push(...last.split('/').slice(0, -1))
        }
      } else if (/^[^\\\/:*?'<>|]+$/.test(p)) {
        new_paths.push(p)
      }
    })
    if (/^[A-Za-z]:$/.test(old_paths[0])) {
      new_paths.unshift(`${old_paths[0]}/`)
    }
    return new_paths.join('/')
  }
}

export class FileSize {
  public value: number
  public scale: string

  constructor(value:number, scale:string) {
    this.value = value
    this.scale = scale
  }
}

export function formatBytes(size:number, scale='', decimals=2) {
  if (size === 0) {
    return new FileSize(0, 'B')
  } else if (size < 0) {
    return new FileSize(-1, 'err')
  }
  const k = 1024
  const scales = ['B', 'KB', 'MB', 'GB', 'TB', 'PB', 'EB', 'ZB', 'YB']
  decimals = Math.max(decimals, 0)
  // 指定的量级
  let i = scales.findIndex((e:string) => e===scale)
  // 没有满足的量级
  if (i === -1) {
    // 原本的量级
    i = Math.floor(Math.log(size) / Math.log(k))
    i = Math.min(i, scales.length-1)
  }
  size = parseFloat((size / Math.pow(k, i)).toFixed(decimals))
  return new FileSize(size, scales[i])
}

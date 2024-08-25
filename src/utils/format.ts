import { Resource } from 'solid-js'


export class NoeFile {
  public name: string
  public dir: string
  public size: number  // bytes
  public type: FileType
  // public url?: () => string
  public url?: string
  public blob?: Resource<Blob>
  public blobText?: Resource<string>

  constructor(dir:string='', name:string='', size:number=-1, isFile:boolean=false, isDirectory:boolean=false) {
    this.dir = dir
    this.name = name
    this.size = size
    if (isFile) {
      this.type = FileType.file
    }
    else if (isDirectory) {
      this.type = FileType.directory
    }
  }

  public toString() {
    return `
      dir=${this.dir}\nname=${this.name}\nsize=${this.size}\ntype=${this.type}\nmime=${this.mime()}\n
      url=${this.url}\nblob=${typeof this.blob}\nblobText=${typeof this.blobText}
    `
  }

  public mime() {
    return this.blob()?.type
    // return this.blob()?.type.split('/')[0]
  }

  public extname() {
    if (!this.name.includes('.')) {
      return ''
    }
    return this.name.split(/\.(?=[^\.]+?$)/, 2)[1]
  }

  // path_join = (...paths) => {
  public static path_join(...paths: string[]) {
    // console.log(paths)
    const pathParts = []
    for (const p of paths) {
      if (!p) { continue }
      pathParts.push(...p.split('/'))
      // pathParts.push.apply(pathParts, p.split('/'))
    }
    const [firstPart, ...restParts] = pathParts.filter(v => !!v)
    pathParts.splice(0, pathParts.length)

    // 先不管开头部分
    restParts.forEach(p => {
      if (p === '.') {
        null
      }
      else if (p === '..') {
        const last = pathParts.at(-1)
        // 说明到头了，没有上一级咯
        if (!last || last === '..') {
          pathParts.push('..')
        }
        else {
          pathParts.pop()
          pathParts.push(...last.split('/').slice(0, -1))
        }
      }
      // else if (/^[^\\\/:*?'<>|]+$/.test(p)) {
      else {
        pathParts.push(p)
      }
    })

    // windows开头是盘符
    if (/^[A-Za-z]:$/.test(firstPart)) {
      pathParts.unshift(firstPart)
    }
    // linux: /dir/xx
    else if (firstPart === '') {
      if (pathParts.length === 0) {pathParts.push('/')}
      // 还有元素放''等着后面join加/即可
      else {pathParts.unshift('')}
    }
    // path part: dir/xx
    else {
      // 特殊考虑此时 .. 还处理不完，那么firstPart被消耗
      if (pathParts[0] === '..') {pathParts.shift()}
      // new_paths长度不管是不是0都在开头加上firstPart
      else {pathParts.unshift(firstPart)}
    }
    // return pathParts.join('/')
    return pathParts.filter(v => v !== '..').join('/')
  }

  public fullpath() {
    return NoeFile.path_join(this.dir, this.name)
  }

  public update(another: NoeFile) {
    this.name = another.name ?? this.name
    this.dir = another.dir ?? this.dir
    this.size = another.size ?? this.size
    this.type = another.type ?? this.type
    this.url = another.url ?? this.url
    this.blob = another.blob ?? this.blob
    this.blobText = another.blobText ?? this.blobText
  }
}

export enum FileType {file, directory}

export class FileSize {
  public value: number
  public scale: string

  constructor(value:number, scale:string) {
    this.value = value
    this.scale = scale
  }

  public show() {
    return `${this.value}${this.scale}`
  }
}

export function formatBytes(size:number, scale='', decimals=2) {
  // TODO 整合进FileSize，再挂给NoeFile
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

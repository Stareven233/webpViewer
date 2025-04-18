import { Resource } from 'solid-js'
import _ from 'lodash'


export class NoeFile {
  public name: string
  public dir: string
  public mtime: Date
  public size: FileSize
  public type: FileType
  public url?: string
  public blob?: Resource<Blob>
  public blobText?: Resource<string>

  constructor(dir:string='', name:string='', mtime:number=0, size:number|FileSize=-1, isFile:boolean=false, isDirectory:boolean=false) {
    this.dir = dir
    this.name = name
    this.mtime = new Date(mtime)
    this.size = typeof size === 'number' ? new FileSize(size) : size
    if (isFile) {
      this.type = FileType.file
    }
    else if (isDirectory) {
      this.type = FileType.directory
    }
  }

  public toString() {
    return JSON.stringify({
      dir: this.dir,
      name: this.name,
      size: this.size.show(),
      type: this.type,
      mtime: this.mtime.toLocaleString(),
      mime: this.mime(),
      url: this.url
    }, null, 4)
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
    let p = pathParts.filter(v => v !== '..').join('/')
    if (p.endsWith(':')) {
      // 不知为何 F: 只能读取到本项目根目录下的文件并报错
      p += '/'
    }
    return p
  }

  public fullpath() {
    return NoeFile.path_join(this.dir, this.name)
  }

  public update(another: NoeFile) {
    Object.assign(this, Object.fromEntries(
      Object.entries(another).filter(([key, value]) => value !== undefined)
    ))
  }
}


export enum FileType {file, directory}


export class FileSize {
  public value: number
  public scale: string
  public decimals: number
  protected static exp_base = 1024
  protected static scale_names = ['B', 'KB', 'MB', 'GB', 'TB', 'PB', 'EB', 'ZB', 'YB']

  constructor(size: number, scale: string = '', decimals: number = 2) {
    this.value = size
    this.decimals = Math.max(decimals, 0)
    if (size === 0) {
      this.scale = 'B'
      return
    } else if (size < 0) {
      this.scale = 'null'
      return
    }

    let i = -1
    if (scale === '') {
      // 没指定就根据size自动计算
      i = Math.floor(Math.log(this.value) / Math.log(FileSize.exp_base))
      i = Math.min(i, FileSize.scale_names.length - 1)
      size = parseFloat((this.value / Math.pow(FileSize.exp_base, i)).toFixed(this.decimals))
      scale = FileSize.scale_names[i]
    } else if (!FileSize.scale_names.includes(scale)) {
      throw new Error(`invalid scale: ${scale}`)
    }
    // 直接使用给定的size跟scale
    this.value = size
    this.scale = scale
  }

  public show() {
    return `${this.value}${this.scale}`
  }

  public fromScale(scale: string) {
    const target = _.cloneDeep(this)
    if (target.value < 0) {
      return target
    }
    const i = FileSize.scale_names.findIndex((e: string) => e === scale)
    if (i === -1) {
      throw new Error(`invalid scale: ${scale}`)
    }
    const ti = FileSize.scale_names.findIndex((e: string) => e === target.scale)
    const diff = Math.pow(FileSize.exp_base, Math.abs(ti - i))
    if (ti < i) {
      target.value /= diff
    } else {
      target.value *= diff
    }
    target.scale = scale
    return target
  }
}

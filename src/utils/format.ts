import { Resource } from 'solid-js'
import _ from 'lodash'

export class NoeFile {
  public name: string
  public dir: string
  public mtime: Date
  public size: FileSize
  public type: FileType
  /** 文件系统符号链接；Windows .lnk 由扩展名识别。 */
  public isLink: boolean
  public url?: string
  public blob?: Resource<Blob>
  public blobText?: Resource<string>

  constructor(dir:string='', name:string='', mtime:number=0, size:number|FileSize=-1, isFile:boolean=false, isDirectory:boolean=false, isLink:boolean=false) {
    this.dir = dir
    this.name = name
    this.mtime = new Date(mtime)
    this.size = typeof size === 'number' ? new FileSize(size) : size
    this.isLink = isLink
    if (isDirectory) {
      this.type = FileType.directory
    } else {
      this.type = FileType.file
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
    try {
      return this.blob?.()?.type
      // return this.blob()?.type.split('/')[0]
    } catch {
      // 资源处于 errored 状态时读取会抛异常；MIME 只是展示信息，不应中断渲染或复制流程。
      return undefined
    }
  }

  public extname() {
    if (!this.name.includes('.')) {
      return ''
    }
    return this.name.split(/\.(?=[^\.]+?$)/, 2)[1]
  }

  /** Computer-root sentinel: above all drive roots on Windows, or above "/" on Unix. */
  public static readonly COMPUTER_ROOT = ''

  public static isComputerRoot(dir: string) {
    return dir === NoeFile.COMPUTER_ROOT
  }

  /** True for Windows drive roots like "C:/" or "D:". */
  public static isDriveRoot(dir: string) {
    return /^[A-Za-z]:\/?$/.test(dir)
  }

  /** True for Unix filesystem root "/". */
  public static isUnixRoot(dir: string) {
    return dir === '/'
  }

  /** Parent of dir; drive root / unix root go to computer root. */
  public static parent_of(dir: string) {
    if (NoeFile.isComputerRoot(dir) || NoeFile.isDriveRoot(dir) || NoeFile.isUnixRoot(dir)) {
      return NoeFile.COMPUTER_ROOT
    }
    return NoeFile.path_join(dir, '..')
  }

  // path_join = (...paths) => {
  public static path_join(...paths: string[]) {
    // Single empty argument is the computer-root sentinel.
    if (paths.length === 1 && paths[0] === NoeFile.COMPUTER_ROOT) {
      return NoeFile.COMPUTER_ROOT
    }

    // Flatten path segments, preserving a leading empty marker for absolute unix paths.
    const segments: string[] = []
    let unixAbsolute = false
    for (const raw of paths) {
      if (raw === undefined || raw === null) continue
      if (raw === NoeFile.COMPUTER_ROOT) continue
      if (raw.startsWith('/')) unixAbsolute = true
      for (const part of raw.split('/')) {
        if (part === '') continue
        segments.push(part)
      }
    }

    const stack: string[] = []
    let aboveRoot = false
    for (const part of segments) {
      if (part === '.') continue
      if (part === '..') {
        if (stack.length > 0) {
          stack.pop()
        } else {
          // Above a windows drive root or bare relative path.
          aboveRoot = true
        }
        continue
      }
      aboveRoot = false
      stack.push(part)
    }

    // path_join('C:/', '..') / path_join('/', '..') -> computer root
    if (stack.length === 0) {
      if (aboveRoot) return NoeFile.COMPUTER_ROOT
      if (unixAbsolute) return '/'
      // path_join('C:') alone collapses to drive root below
      return NoeFile.COMPUTER_ROOT
    }

    // If the only remaining segment is a drive letter and we popped above it earlier,
    // aboveRoot already returned. Otherwise format drive / unix / relative.
    if (/^[A-Za-z]:$/.test(stack[0])) {
      // e.g. ['C:'] or ['C:', 'Users']
      if (stack.length === 1) return stack[0] + '/'
      return stack[0] + '/' + stack.slice(1).join('/')
    }

    if (unixAbsolute) {
      return '/' + stack.join('/')
    }
    return stack.join('/')
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

// Add enum for sorting options
export enum SortType {
  NAME_ASC = 'name_asc',
  NAME_DESC = 'name_desc',
  TIME_ASC = 'time_asc',
  TIME_DESC = 'time_desc',
  RANDOM = 'random'
}

export const sortOptions = [
  { type: SortType.NAME_ASC, label: '文件名正序' },
  { type: SortType.NAME_DESC, label: '文件名逆序' },
  { type: SortType.TIME_ASC, label: '时间正序' },
  { type: SortType.TIME_DESC, label: '时间逆序' },
  { type: SortType.RANDOM, label: '随机' }
]

export const sortFiles = (files: NoeFile[], sortType: SortType): NoeFile[] => {
  if (!files) {
    return files
  }
  const sortedFiles = [...files]
  const sortDirectoriesFirst = (compareFn: (a: NoeFile, b: NoeFile) => number): NoeFile[] => {
    return sortedFiles.sort((a, b) => {
      if (a.type !== b.type) {
        // Directories first
        return a.type === FileType.directory ? -1 : 1
      }
      return compareFn(a, b)
    })
  }
  
  switch (sortType) {
    case SortType.NAME_ASC:
      return sortDirectoriesFirst((a, b) => a.name.localeCompare(b.name))
    case SortType.NAME_DESC:
      return sortDirectoriesFirst((a, b) => b.name.localeCompare(a.name))
    case SortType.TIME_ASC:
      return sortDirectoriesFirst((a, b) => a.mtime.getTime() - b.mtime.getTime())
    case SortType.TIME_DESC:
      return sortDirectoriesFirst((a, b) => b.mtime.getTime() - a.mtime.getTime())
    case SortType.RANDOM:
      // Fisher-Yates shuffle algorithm
      let t: NoeFile
      for (let i = sortedFiles.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1))
        t = sortedFiles[i]
        sortedFiles[i] = sortedFiles[j]
        sortedFiles[j] = t
      }
      return sortedFiles
    default:
      return sortedFiles
  }
}

export const formatDate = (date?: Date): string => {
  if (!date) {
    date = new Date()
  }
  const year = date.getFullYear()
  const month = (date.getMonth() + 1).toString().padStart(2, '0')
  const day = date.getDate().toString().padStart(2, '0')
  const hours = date.getHours().toString().padStart(2, '0')
  const minutes = date.getMinutes().toString().padStart(2, '0')
  const seconds = date.getSeconds().toString().padStart(2, '0')
  
  return `${year}-${month}-${day}_${hours}-${minutes}-${seconds}`
}

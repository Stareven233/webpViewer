import { listDir, getFileBuffer } from '../requests.ts'

/**
 * 本地字幕自动探测与转换。
 *
 * 浏览器 <track> 只接受 WebVTT，因此 SRT/ASS/SSA 都要先转成 VTT 文本再用 Blob URL 挂上去。
 * 探测复用现有 /list 接口：在与视频同目录里找“同名 + 额外后缀”的字幕文件，
 * 无需新增后端路由。
 */

/** 支持的源字幕扩展名，值越大优先级越高（VTT 无需转换，排最前）。 */
const SOURCE_EXT = ['vtt', 'srt', 'ass', 'ssa'] as const
type SourceExt = typeof SOURCE_EXT[number]

/** 中文常见语言标记，用于在同名多份字幕里优先选中中文字幕。 */
const CHINESE_TAGS = ['zh', 'chs', 'cht', 'chi', 'zho', 'zh-cn', 'zh-tw', 'zh-hans', 'zh-hant', 'sc', 'tc']

export type SubtitleTrack = {
  url: string
  /** 字幕文件名，作为 <track> 的 label，让用户在播放器菜单里能分辨来源。 */
  label: string
}

/**
 * 编码嗅探。中文 Windows 上的字幕大量是 GBK 或 UTF-16，
 * 直接 blob.text() 按 UTF-8 解会得到乱码，所以必须看 BOM 与字节特征。
 */
const decodeText = (buffer: ArrayBuffer) => {
  const bytes = new Uint8Array(buffer)

  if (bytes[0] === 0xef && bytes[1] === 0xbb && bytes[2] === 0xbf) {
    return new TextDecoder('utf-8').decode(bytes.subarray(3))
  }
  if (bytes[0] === 0xff && bytes[1] === 0xfe) {
    return new TextDecoder('utf-16le').decode(bytes.subarray(2))
  }
  if (bytes[0] === 0xfe && bytes[1] === 0xff) {
    return new TextDecoder('utf-16be').decode(bytes.subarray(2))
  }

  try {
    // fatal 让非法 UTF-8 直接抛错，从而落到 GBK 分支，而不是静默产出替换字符。
    return new TextDecoder('utf-8', { fatal: true }).decode(bytes)
  } catch {
    // 无 BOM 的 UTF-16：ASCII 正文会在固定一侧出现大量 0 字节。
    const sample = bytes.subarray(0, Math.min(bytes.length, 1024))
    let zeros = 0
    for (const byte of sample) {
      if (byte === 0) zeros++
    }
    if (sample.length && zeros > sample.length / 4) {
      return new TextDecoder('utf-16le').decode(bytes)
    }
    // 其余情况按简体中文环境最常见的 GBK 处理。
    return new TextDecoder('gbk').decode(bytes)
  }
}

/** 把 "00:00:01,000" / "0:00:01.00" 这类时间码统一换成 VTT 的 "00:00:01.000"。 */
const toVTTTimecode = (raw: string) => {
  const [clock, fraction = '0'] = raw.trim().replace(',', '.').split('.')
  const parts = clock.split(':').map(Number)
  const [h = 0, m = 0, s = 0] = parts.length === 3 ? parts : [0, ...parts]
  // ASS 用厘秒（2 位），SRT/VTT 用毫秒（3 位）。
  const ms = fraction.padEnd(3, '0').slice(0, 3)
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}.${ms}`
}

/** VTT 正文里 < > & 有语义，字幕原文必须转义，否则会被当成标签丢掉。 */
const escapeVTT = (text: string) => text
  .replace(/&/g, '&amp;')
  .replace(/</g, '&lt;')
  .replace(/>/g, '&gt;')

/** SRT：按空行切块，首行可选序号，第二行是时间轴，其余是正文。 */
const srtToVTT = (source: string) => {
  const cues = source
    .replace(/\r\n?/g, '\n')
    .split('\n\n')
    .map(block => block.trim())
    .filter(Boolean)

  const body = cues.map(block => {
    const lines = block.split('\n')
    const timeIndex = lines.findIndex(line => line.includes('-->'))
    if (timeIndex === -1) {
      return ''
    }
    const [start, end] = lines[timeIndex].split('-->')
    const text = lines.slice(timeIndex + 1).join('\n').trim()
    // SRT 正文同样需要 VTT 转义，否则 <...> 会被浏览器当标签整段吞掉。
    return `${toVTTTimecode(start)} --> ${toVTTTimecode(end)}\n${escapeVTT(text)}`
  }).filter(Boolean)

  return `WEBVTT\n\n${body.join('\n\n')}\n`
}

/**
 * ASS/SSA：只取 [Events] 段的 Dialogue 行。
 * 覆盖标签（{...} 里的 pos/特效/卡拉OK）直接丢弃，保留时间轴与纯文本，
 * 足以支撑“看对话”的需求，同时避免实现完整的 ASS 渲染。
 */
const assToVTT = (source: string) => {
  const lines = source.replace(/\r\n?/g, '\n').split('\n')
  let inEvents = false
  // Format 行定义字段顺序，不同字幕组的列顺序可能不同，不能写死下标。
  let startIdx = 1
  let endIdx = 2
  let textIdx = 9
  let maxIdx = 9

  const body: string[] = []
  for (const line of lines) {
    const head = line.trim()
    if (head.startsWith('[')) {
      inEvents = head.toLowerCase() === '[events]'
      continue
    }
    if (!inEvents) {
      continue
    }
    if (/^format\s*:/i.test(head)) {
      const fields = head.slice(head.indexOf(':') + 1).split(',').map(field => field.trim().toLowerCase())
      startIdx = fields.indexOf('start')
      endIdx = fields.indexOf('end')
      textIdx = fields.indexOf('text')
      maxIdx = fields.length - 1
      continue
    }
    if (!/^dialogue\s*:/i.test(head)) {
      continue
    }
    if (startIdx < 0 || endIdx < 0 || textIdx < 0) {
      continue
    }

    // Text 是最后一列且自身含逗号，所以只按前 N-1 个逗号切分。
    const payload = head.slice(head.indexOf(':') + 1)
    const cells: string[] = []
    let rest = payload
    for (let i = 0; i < maxIdx; i++) {
      const comma = rest.indexOf(',')
      if (comma === -1) {
        break
      }
      cells.push(rest.slice(0, comma))
      rest = rest.slice(comma + 1)
    }
    cells.push(rest)

    const text = (cells[textIdx] ?? '')
      .replace(/\{[^}]*\}/g, '')   // 覆盖标签
      .replace(/\\[Nn]/g, '\n')    // 硬换行
      .replace(/\\h/g, ' ')        // 不间断空格
      .trim()
    if (!text) {
      continue
    }

    body.push(`${toVTTTimecode(cells[startIdx])} --> ${toVTTTimecode(cells[endIdx])}\n${escapeVTT(text)}`)
  }

  return body.length ? `WEBVTT\n\n${body.join('\n\n')}\n` : ''
}

/** 统一的格式转换入口；已经是 VTT 的只补换行，避免重复处理破坏内容。 */
const toVTT = (source: string, ext: SourceExt) => {
  const text = source.replace(/^\uFEFF/, '')
  switch (ext) {
    case 'vtt':
      return text.trimStart().startsWith('WEBVTT') ? text : `WEBVTT\n\n${text}`
    case 'srt':
      return srtToVTT(text)
    case 'ass':
    case 'ssa':
      return assToVTT(text)
  }
}

const extOf = (name: string) => name.split('.').pop()?.toLowerCase() ?? ''

const isSourceExt = (ext: string): ext is SourceExt => (SOURCE_EXT as readonly string[]).includes(ext)

/**
 * 在同目录里挑选与视频同名的字幕。
 * 命名习惯差异很大（movie.srt / movie.zh-CN.ass / movie 1080p.chs.srt），
 * 因此以“视频主名 + 点”为前缀匹配，再按“完全同名 > 中文标记 > 其余”排序。
 */
const pickSubtitle = (videoName: string, files: { name: string, isFile?: boolean }[]) => {
  const stem = videoName.replace(/\.[^.]+$/, '')
  if (!stem) {
    return undefined
  }
  const prefix = `${stem}.`.toLowerCase()

  const candidates = files
    .filter(file => file.isFile !== false)
    .map(file => {
      const lower = file.name.toLowerCase()
      const ext = extOf(file.name)
      if (!isSourceExt(ext) || !lower.startsWith(prefix)) {
        return undefined
      }
      // 主名后的语言/版本标记，空串即完全同名。
      const tag = lower.slice(prefix.length, lower.length - ext.length - 1)
      const rank = tag === '' ? 0 : CHINESE_TAGS.includes(tag) ? 1 : 2
      // order 越小越优先：先比同名程度，再按扩展名优先级（VTT 无需转换，最稳）。
      return { name: file.name, ext, rank, order: rank * 10 + SOURCE_EXT.indexOf(ext) }
    })
    .filter((item): item is { name: string, ext: SourceExt, rank: number, order: number } => item !== undefined)
    .sort((a, b) => a.order - b.order)

  return candidates[0]
}

/**
 * 探测并加载视频的本地字幕，返回可直接挂到 <track> 的 Blob URL。
 * 目录读取失败或没有匹配字幕时返回 undefined —— 字幕是增强项，不能影响播放。
 */
export const loadLocalSubtitle = async (dir: string, videoName: string): Promise<SubtitleTrack | undefined> => {
  try {
    const files = await listDir(dir)
    if (!Array.isArray(files)) {
      return undefined
    }
    const picked = pickSubtitle(videoName, files)
    if (!picked) {
      return undefined
    }

    const buffer = await getFileBuffer({ dir, name: picked.name })
    const vtt = toVTT(decodeText(buffer), picked.ext)
    if (!vtt.trim() || vtt === 'WEBVTT') {
      return undefined
    }

    return {
      url: URL.createObjectURL(new Blob([vtt], { type: 'text/vtt' })),
      label: picked.name,
    }
  } catch (error) {
    // 字幕只是附加能力，任何失败都静默降级为“无字幕”。
    console.warn('load local subtitle failed:', error)
    return undefined
  }
}

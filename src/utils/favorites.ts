import { createRoot, createSignal } from 'solid-js'

// 统一收藏数据的存储键；旧版字符串收藏和电脑书签会在首次读取时自动迁移。
const STORAGE_KEY = 'webpviewer:favorites'
const LEGACY_COMPUTERS_KEY = 'webpviewer:computers'

/**
 * 收藏项以「IP + 路径」为唯一组合。
 * path 为空仅用于兼容旧版电脑书签，让只保存过 IP 的旧数据也能继续显示。
 */
export interface Favorite {
  ip: string
  path: string
  name?: string
  lastUsed?: number
}

export interface SavedIP {
  ip: string
  name?: string
  lastUsed?: number
}

const normalizeIP = (raw: string) => {
  try {
    const value = /^https?:\/\//i.test(raw.trim()) ? raw.trim() : `http://${raw.trim()}`
    return new URL(value).origin
  } catch {
    return ''
  }
}

const pathFromLegacyComputerURL = (raw: string) => {
  try {
    const url = new URL(raw)
    // 旧版电脑书签只要求填写 /index 地址，真正的目录仍然保存在 hash 中。
    return url.hash ? decodeURIComponent(url.hash.slice(1)) : ''
  } catch {
    return ''
  }
}

const mergeFavorites = (items: Favorite[]) => {
  const merged = new Map<string, Favorite>()
  for (const item of items) {
    const ip = normalizeIP(item.ip)
    if (!ip || typeof item.path !== 'string') continue
    const path = item.path
    const key = `${ip}\u0000${path}`
    const previous = merged.get(key)
    merged.set(key, {
      ip,
      path,
      // 同一 IP 的名称是共享信息；后续有名称的记录优先保留。
      name: item.name?.trim() || previous?.name,
      lastUsed: Math.max(item.lastUsed || 0, previous?.lastUsed || 0),
    })
  }
  return [...merged.values()].sort((a, b) => (b.lastUsed || 0) - (a.lastUsed || 0))
}

/** 从 localStorage 读取新旧两种收藏数据，并在内存中完成去重合并。 */
const loadFavorites = (): Favorite[] => {
  const items: Favorite[] = []
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (raw) {
      const parsed = JSON.parse(raw)
      if (Array.isArray(parsed)) {
        for (const entry of parsed) {
          if (typeof entry === 'string') {
            // 旧版收藏只有路径，默认归属首次迁移时所在的当前站点。
            items.push({ ip: window.location.origin, path: entry })
          } else if (entry && typeof entry === 'object' && typeof entry.ip === 'string' && typeof entry.path === 'string') {
            items.push({
              ip: entry.ip,
              path: entry.path,
              name: typeof entry.name === 'string' ? entry.name : undefined,
              lastUsed: typeof entry.lastUsed === 'number' ? entry.lastUsed : undefined,
            })
          }
        }
      }
    }
  } catch (err) {
    console.error('[favorites] 读取失败: ', err)
  }

  // 兼容最新一次提交写入的电脑书签：它们会变成只含 IP 的收藏项。
  try {
    const raw = localStorage.getItem(LEGACY_COMPUTERS_KEY)
    const parsed = raw ? JSON.parse(raw) : []
    if (Array.isArray(parsed)) {
      for (const entry of parsed) {
        if (!entry || typeof entry.url !== 'string') continue
        const ip = normalizeIP(entry.url)
        if (!ip) continue
        items.push({
          ip,
          path: pathFromLegacyComputerURL(entry.url),
          name: typeof entry.name === 'string' ? entry.name : undefined,
          lastUsed: typeof entry.lastUsed === 'number' ? entry.lastUsed : undefined,
        })
      }
    }
  } catch (err) {
    console.error('[favorites] 迁移旧电脑书签失败: ', err)
  }

  return mergeFavorites(items)
}

function _createFavorites() {
  const initial = loadFavorites()
  // 读取时即写回结构化格式，避免旧版数据在下一次修改前仍保持两套形状。
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(initial))
  } catch (err) {
    console.error('[favorites] 迁移保存失败: ', err)
  }
  const [favorites, setFavorites] = createSignal<Favorite[]>(initial)

  // 唯一落盘出口：signal 更新后同步写入，隐私模式等写入失败只告警不抛出。
  const commit = (next: Favorite[]) => {
    const normalized = mergeFavorites(next)
    setFavorites(normalized)
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(normalized))
    } catch (err) {
      console.error('[favorites] 保存失败: ', err)
    }
  }

  const isFavorite = (path: string, ip: string) => {
    const normalizedIP = normalizeIP(ip)
    return favorites().some(item => item.path === path && item.ip === normalizedIP)
  }

  /** 返回去重后的 IP 列表，名称属于 IP 而不是某一个目录。 */
  const savedIPs = () => {
    const grouped = new Map<string, SavedIP>()
    for (const item of favorites()) {
      const previous = grouped.get(item.ip)
      if (!previous || (item.lastUsed || 0) >= (previous.lastUsed || 0)) {
        grouped.set(item.ip, { ip: item.ip, name: item.name || previous?.name, lastUsed: item.lastUsed })
      } else if (!previous.name && item.name) {
        grouped.set(item.ip, { ...previous, name: item.name })
      }
    }
    return [...grouped.values()].sort((a, b) => (b.lastUsed || 0) - (a.lastUsed || 0))
  }

  /** 返回去重后的目录列表；同一路径在不同 IP 下只展示一次。 */
  const savedPaths = () => {
    const grouped = new Map<string, Favorite>()
    for (const item of favorites()) {
      if (!item.path) continue
      const previous = grouped.get(item.path)
      if (!previous || (item.lastUsed || 0) >= (previous.lastUsed || 0)) {
        grouped.set(item.path, item)
      }
    }
    return [...grouped.keys()]
  }

  /** 收藏或更新当前「IP + 路径」，名称为空时沿用该 IP 已有名称。 */
  const addFavorite = (path: string, ip: string, name = '') => {
    const normalizedIP = normalizeIP(ip)
    const trimmedName = name.trim()
    if (!path || !normalizedIP) return

    const existingName = favorites().find(item => item.ip === normalizedIP && item.name)?.name
    const now = Date.now()
    const next = favorites().filter(item => !(item.ip === normalizedIP && item.path === path))
    next.unshift({
      ip: normalizedIP,
      path,
      name: trimmedName || existingName,
      lastUsed: now,
    })
    // 输入名称时同步到同一 IP 的所有收藏，保证左侧名称稳定。
    if (trimmedName) {
      for (const item of next) {
        if (item.ip === normalizedIP) item.name = trimmedName
      }
    }
    commit(next)
  }


  /** 右侧展示的是独立目录，因此删除目录时清理它在所有 IP 下的关联。 */
  const removePath = (path: string) => commit(favorites().filter(item => item.path !== path))

  const removeIP = (ip: string) => {
    const normalizedIP = normalizeIP(ip)
    commit(favorites().filter(item => item.ip !== normalizedIP))
  }

  return { favorites, savedIPs, savedPaths, isFavorite, addFavorite, removePath, removeIP }
}

export default createRoot(_createFavorites)

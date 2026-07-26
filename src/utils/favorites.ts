import { createRoot, createSignal } from 'solid-js'


// localStorage 键名带命名空间前缀，避免与同源下其他页面冲突
const STORAGE_KEY = 'webpviewer:favorites'

/** 从 localStorage 读取收藏列表；数据损坏或无权访问时回退到空数组 */
const loadFavorites = (): string[] => {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) {
      return []
    }
    const parsed = JSON.parse(raw)
    // 只接受字符串数组，防止手改坏的数据污染后续逻辑
    return Array.isArray(parsed) ? parsed.filter((e): e is string => typeof e === 'string') : []
  } catch (err) {
    console.error('[favorites] 读取失败: ', err)
    return []
  }
}

function _createFavorites() {
  const [favorites, setFavorites] = createSignal<string[]>(loadFavorites())

  // 唯一的落盘出口：signal 更新后同步写入，隐私模式等写入失败只告警不抛出
  const commit = (next: string[]) => {
    setFavorites(next)
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(next))
    } catch (err) {
      console.error('[favorites] 保存失败: ', err)
    }
  }

  const isFavorite = (dir: string) => favorites().includes(dir)

  const removeFavorite = (dir: string) => commit(favorites().filter(e => e !== dir))

  /** 收藏/取消收藏；新收藏放到列表最前，最近收藏的更容易点到 */
  const toggleFavorite = (dir: string) => {
    if (isFavorite(dir)) {
      removeFavorite(dir)
      return
    }
    commit([dir, ...favorites()])
  }

  return { favorites, isFavorite, toggleFavorite, removeFavorite }
}

export default createRoot(_createFavorites)

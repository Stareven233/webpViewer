import { createRoot, createSignal } from 'solid-js'

// 电脑书签存储键名，带命名空间避免同源冲突
const STORAGE_KEY = 'webpviewer:computers'

/** 电脑书签条目：名称 + 访问地址，支持多机多网切换 */
export interface Computer {
  id: string
  name: string
  url: string
  remark?: string
  lastUsed?: number
}

/** 从 localStorage 读取电脑列表；损坏或无权访问时回退空数组 */
const loadComputers = (): Computer[] => {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return []
    const parsed = JSON.parse(raw)
    return Array.isArray(parsed)
      ? parsed.filter(
          (e): e is Computer =>
            typeof e === 'object' &&
            e !== null &&
            typeof e.id === 'string' &&
            typeof e.name === 'string' &&
            typeof e.url === 'string',
        )
      : []
  } catch (err) {
    console.error('[computers] 读取失败: ', err)
    return []
  }
}

function _createComputers() {
  const [computers, setComputers] = createSignal<Computer[]>(loadComputers())

  // 唯一落盘出口：signal 更新后同步写入
  const commit = (next: Computer[]) => {
    setComputers(next)
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(next))
    } catch (err) {
      console.error('[computers] 保存失败: ', err)
    }
  }

  /** 按名称 upsert；同名则更新 url/备注并刷新 lastUsed */
  const addOrUpdateComputer = (computer: Omit<Computer, 'id' | 'lastUsed'>) => {
    const now = Date.now()
    let updated = false
    const next = computers().map((c) => {
      if (c.name === computer.name) {
        updated = true
        return { ...c, url: computer.url, remark: computer.remark, lastUsed: now }
      }
      return c
    })
    if (!updated) {
      next.unshift({
        id: `comp-${now}`,
        name: computer.name,
        url: computer.url,
        remark: computer.remark,
        lastUsed: now,
      })
    }
    commit(next)
  }

  const removeComputer = (id: string) => {
    commit(computers().filter((c) => c.id !== id))
  }

  /** 最近使用优先，方便手机端快速点到常用机 */
  const sortedComputers = () =>
    [...computers()].sort((a, b) => (b.lastUsed || 0) - (a.lastUsed || 0))

  return {
    computers,
    sortedComputers,
    addOrUpdateComputer,
    removeComputer,
  }
}

export default createRoot(_createComputers)

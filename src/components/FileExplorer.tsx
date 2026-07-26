import type { Component } from 'solid-js'
import { createResource, For, Show, createSignal } from 'solid-js'
import { createEffect, onCleanup } from 'solid-js'
import { Dynamic } from 'solid-js/web'
import neoStore from '../store.ts'
import favStore from '../utils/favorites.ts'
import { listDir } from '../requests.ts'
import { NoeFile, FileType } from '../utils/format.ts'
import { SortType, sortOptions, sortFiles } from '../utils/format.ts'
import * as MsgBox from './MessageBox.tsx'
import FileUploader from './FileUploader.tsx'
import icons from './Icon.tsx'


const fileTypes = (obj: NoeFile) => {
  let comp: any
  if (obj.type === FileType.file) {
    comp = <span class='text-green-500 h-full mr-2 select-none'>F</span>
  } else if (obj.type === FileType.directory) {
    comp = <span class='text-orange-400 h-full mr-2 select-none'>D</span>
  } else {
    comp = <span class='text-gray-600 h-full mr-2 select-none'>U</span>
  }
  return () => comp
}

const { store, setStore } = neoStore
const { favorites, isFavorite, toggleFavorite, removeFavorite } = favStore
// 当前选中项在排序后列表中的下标，-1 表示未选中。
// 用 signal 声明式高亮，替代直接操作 DOM classList
const [selectedIdx, setSelectedIdx] = createSignal(-1)

const COMPUTER_LABEL = '此电脑'

const resolveDir = async (dir: string): Promise<NoeFile[]> => {
  // console.log('dir :>> ', dir)
  let res = await listDir(dir)
  if ('errno' in res) {
    console.error('error:', res)
    MsgBox.popup('error', JSON.stringify(res), MsgBox.Type.error)
    return []
  }
  const ret: NoeFile[] = res.map((item: any) => new NoeFile(dir, item.name, item.mtime, item.size, item.isFile, item.isDirectory))
  // res.unshift(parentDir)
  return ret
}

/** 标题取路径末两段，方便在浏览器标签页上辨认 */
const titleOf = (path: string) => {
  const parts = path.split('/').filter(Boolean).slice(-2)
  return parts.length ? parts.join('/') : COMPUTER_LABEL
}

/**
 * 统一的路由跳转出口：写 store、改标题、推历史记录。
 * 目录跳转（面包屑/收藏/上一级/输入框）与文件打开都走这里，避免三处重复逻辑各自漂移。
 * window.location.href = `#${hash}` 会触发hashchange事件，pushState不会
 */
const navigateTo = (path: string, opts: { isFile?: boolean } = {}) => {
  if (!opts.isFile) {
    setStore('currentDir', () => path)
    // 换目录后旧的选中下标已失效
    setSelectedIdx(-1)
  }
  document.title = titleOf(path)
  history.pushState({}, '', path ? `#${path}` : '#')
}

const clickItem = (obj: NoeFile, idx: number) => {
  if (obj.type === FileType.directory) {
    // From computer root, drive names are "C:" / "/" — treat as absolute roots.
    if (NoeFile.isComputerRoot(store.currentDir)) {
      const next = NoeFile.isUnixRoot(obj.name) ? '/' : obj.name + '/'
      navigateTo(next)
    } else {
      navigateTo(NoeFile.path_join(store.currentDir, obj.name))
    }
    return
  }
  if (obj.type === FileType.file) {
    setStore('currentFile', () => obj)
    setSelectedIdx(idx)
    navigateTo(NoeFile.path_join(store.currentDir, obj.name), { isFile: true })
  }
}

const goParent = () => {
  if (NoeFile.isComputerRoot(store.currentDir)) {
    return
  }
  navigateTo(NoeFile.parent_of(store.currentDir))
}

/**
 * 把当前目录拆成可点击的面包屑分段。
 * 首段固定为「此电脑」（COMPUTER_ROOT）；unix 绝对路径的根 "/" 需单独成段，
 * 否则会被 split('/') 吃掉，导致无法点回根目录。
 */
const breadcrumbs = (dir: string) => {
  const crumbs = [{ label: COMPUTER_LABEL, path: NoeFile.COMPUTER_ROOT }]
  if (NoeFile.isComputerRoot(dir)) {
    return crumbs
  }
  if (dir.startsWith('/')) {
    crumbs.push({ label: '/', path: '/' })
  }
  let acc = dir.startsWith('/') ? '/' : ''
  for (const part of dir.split('/').filter(Boolean)) {
    // 用 path_join 拼接，盘符 "C:" -> "C:/" 等规则已在其中处理
    acc = NoeFile.path_join(acc, part)
    crumbs.push({ label: part, path: acc })
  }
  return crumbs
}

const Comp: Component<{ hidden?: boolean }> = (props) => {
  // 路径栏默认展示面包屑，点击空白区域后切换为可直接输入的地址栏。
  const [isEditingPath, setIsEditingPath] = createSignal(false)
  // Add signal for sort menu visibility
  const [showSortMenu, setShowSortMenu] = createSignal(false)
  // 收藏下拉菜单
  const [showFavMenu, setShowFavMenu] = createSignal(false)
  // Add signal for current sort type
  const [currentSort, setCurrentSort] = createSignal<SortType>(SortType.TIME_DESC)
  let pathInput: HTMLInputElement | undefined
  let menuArea: HTMLDivElement | undefined
  // Solid treats empty-string source as "no fetch"; wrap so computer root ('') still loads.
  const [files, fileAction] = createResource(() => [store.currentDir] as const, ([dir]) => resolveDir(dir))
  // Create sorted files resource
  const sortedFiles = () => {
    return sortFiles(files() ?? [], currentSort())
  }
  // 两个下拉菜单互斥，否则会重叠
  const openSortMenu = (open: boolean) => {
    setShowSortMenu(open)
    if (open) setShowFavMenu(false)
  }
  const openFavMenu = (open: boolean) => {
    setShowFavMenu(open)
    if (open) setShowSortMenu(false)
  }
  const closeMenus = () => {
    setShowSortMenu(false)
    setShowFavMenu(false)
  }

  // 菜单打开后，点击工具区以外的任意位置都会关闭，避免悬浮菜单遮挡文件列表。
  const handleDocumentPointerDown = (event: PointerEvent) => {
    if (!menuArea?.contains(event.target as Node)) {
      closeMenus()
    }
  }
  document.addEventListener('pointerdown', handleDocumentPointerDown)
  onCleanup(() => document.removeEventListener('pointerdown', handleDocumentPointerDown))

  // 切换为输入模式后立即聚焦并选中路径，保持 Windows 地址栏的操作习惯。
  createEffect(() => {
    if (!isEditingPath()) {
      return
    }
    requestAnimationFrame(() => {
      pathInput?.focus()
      pathInput?.select()
    })
  })

  // hash 中待定位的文件名，由 handleHashChange 写入，等目录加载完再消费
  const [pendingFile, setPendingFile] = createSignal<string>('')

  const handleHashChange = (e: HashChangeEvent) => {
    // console.log(e)
    if (e.type !== 'init' && !e.isTrusted || e.oldURL === e.newURL) {
      return
    }
    const hash = new URL(e.newURL).hash
    // no hash keeps the store default (e.g. C:/); bare "#" is computer root
    if (!hash) {
      return
    }
    const raw = hash.slice(1)
    if (!raw) {
      setStore('currentDir', () => NoeFile.COMPUTER_ROOT)
      return
    }
    // rsplit('/', 1) + 解码. Keep unix "/home" from collapsing to computer root:
    // parent of "/home" is "/" (not "").
    let [dir, filename] = raw.split(/\/(?=[^\/]+$)/, 2).map(decodeURIComponent)
    if (dir === '' && raw.startsWith('/')) {
      dir = '/'
    } else if (/^[A-Za-z]:$/.test(dir)) {
      dir = dir + '/'
    }
    setStore('currentDir', () => dir)
    setSelectedIdx(-1)
    setPendingFile(filename ?? '')
  }
  // window.onhashchange = handleHashChange
  window.addEventListener('hashchange', handleHashChange, false)
  onCleanup(() => window.removeEventListener('hashchange', handleHashChange, false))
  handleHashChange(new HashChangeEvent('init', { newURL: window.location.href }))

  // 目录加载完成后定位 hash 指向的文件。
  // 用 effect 追踪 sortedFiles()，替代原先 300ms 轮询 setInterval 的写法：更快且不会泄漏
  createEffect(() => {
    const filename = pendingFile()
    if (!filename || files.loading) {
      return
    }
    const list = sortedFiles()
    const idx = list.findIndex(f => f.name === filename)
    if (idx > -1) {
      setStore('currentFile', () => list[idx])
      setSelectedIdx(idx)
    }
    setPendingFile('')
  })

  const seekFile = (step: number) => {
    const fileList = sortedFiles()
    const fileNum = fileList.length
    // 空目录直接退出，否则下面的取模会得到 NaN 并越界访问
    if (fileNum === 0) {
      return
    }
    const direction = step > 0 ? 1 : -1
    // 未选中时从头开始；已选中则从当前位置偏移
    let pos = selectedIdx() > -1 ? selectedIdx() + step : 0
    pos = ((pos % fileNum) + fileNum) % fileNum
    const lastPos = pos

    // 跳过目录，只显示文件
    while (fileList[pos].type !== FileType.file) {
      pos = (pos + direction + fileNum) % fileNum
      // 避免不存在文件的情况
      if (pos === lastPos) {
        return
      }
    }
    clickItem(fileList[pos], pos)
  }

  // createResource 不能放在外层，导致seekFile无法暴露，只能用store
  createEffect(() => {
    if (store.nextStep === 0) {
      return
    }
    // console.log('next step', store.nextStep)
    seekFile(store.nextStep)
    // 每次结束后重置，方便后面再次触发
    setStore('nextStep', s => 0)
  })

  /** 提交地址栏输入；Esc 仅退出编辑，不会意外跳转目录。 */
  const commitPath = (rawPath: string) => {
    let path = rawPath.trim()
    setIsEditingPath(false)
    if (path === COMPUTER_LABEL || path === 'Computer' || path === '') {
      path = NoeFile.COMPUTER_ROOT
    } else if (path.endsWith(':')) {
      path = path + '/'
    }
    if (store.currentDir === path) {
      return
    }
    navigateTo(path)
  }

  const handlePathKeyDown = (event: KeyboardEvent) => {
    const input = event.currentTarget as HTMLInputElement
    if (event.key === 'Enter') {
      event.preventDefault()
      commitPath(input.value)
    } else if (event.key === 'Escape') {
      event.preventDefault()
      setIsEditingPath(false)
    }
  }

  // Handle sorting
  const handleSort = (sortType: SortType) => {
    setCurrentSort(sortType)
    // 重新排序后下标失效
    setSelectedIdx(-1)
    openSortMenu(false)
  }

  const jumpTo = (path: string) => {
    openFavMenu(false)
    if (store.currentDir === path) {
      return
    }
    navigateTo(path)
  }

  // 「此电脑」不是真实目录，收藏无意义
  const canFavorite = () => !NoeFile.isComputerRoot(store.currentDir)
  const canAddCurrentFavorite = () => canFavorite() && !isFavorite(store.currentDir)
  const addCurrentFavorite = () => {
    if (!canAddCurrentFavorite()) {
      return
    }
    toggleFavorite(store.currentDir)
    openFavMenu(false)
  }
  const btnClass = 'hover:text-green-400 px-2 cursor-pointer text-gray-700'

  return (
    <aside id='explorer' classList={{ hidden: props.hidden }} class='flex flex-col border border-gray-200 w-full mx-2 my-2 overflow-hidden'>
      <section class='flex items-center gap-2 px-1 py-1 text-lg border-b border-gray-100'>
        <Show
          when={isEditingPath()}
          fallback={
            <nav
              class='grow min-w-0 flex items-center gap-1 px-1 py-1 text-gray-500 overflow-x-auto whitespace-nowrap rounded cursor-text hover:bg-gray-50'
              title='点击空白处可编辑路径'
              onClick={() => setIsEditingPath(true)}
            >
              <For each={breadcrumbs(store.currentDir)}>
                {(crumb, i) => {
                  const isLast = () => i() === breadcrumbs(store.currentDir).length - 1
                  return (
                    <>
                      <Show when={i() > 0}><span class='text-gray-300 select-none'>/</span></Show>
                      <button
                        class='shrink-0'
                        classList={{
                          'text-gray-400 cursor-default': isLast(),
                          'hover:text-green-500 cursor-pointer': !isLast(),
                        }}
                        disabled={isLast()}
                        onClick={event => {
                          // 面包屑按钮仍负责跳转，不能冒泡为“切换输入模式”。
                          event.stopPropagation()
                          jumpTo(crumb.path)
                        }}
                      >
                        {crumb.label}
                      </button>
                    </>
                  )
                }}
              </For>
            </nav>
          }
        >
          <input
            ref={pathInput}
            class='grow min-w-0 border border-green-300 rounded px-2 py-1 text-sm outline-hidden ring-2 ring-green-100'
            value={NoeFile.isComputerRoot(store.currentDir) ? COMPUTER_LABEL : store.currentDir}
            onBlur={event => commitPath(event.currentTarget.value)}
            onKeyDown={handlePathKeyDown}
            aria-label='当前路径'
          />
        </Show>

        {/* 路径操作与下拉菜单统一收纳在工具区，供全局点击关闭逻辑判断边界。 */}
        <div ref={menuArea} class='relative flex shrink-0 items-center'>
          <button class={btnClass} title='返回上一级' onClick={goParent}>
            <Dynamic component={icons('back')} />
          </button>

          {/* 星标统一作为收藏夹入口，填充状态仅提示当前目录是否已收藏。 */}
          <button
            class={btnClass}
            classList={{ 'text-yellow-400': canFavorite() && isFavorite(store.currentDir) }}
            title='打开收藏夹'
            aria-label='打开收藏夹'
            onClick={() => openFavMenu(!showFavMenu())}
          >
            <Dynamic component={icons(canFavorite() && isFavorite(store.currentDir) ? 'star-filled' : 'star')} />
          </button>

          {/* 收藏列表首项固定为新增当前目录，长列表滚动时仍可直接操作。 */}
          <Show when={showFavMenu()}>
            <div class='absolute top-full right-0 mt-1 w-56 max-h-64 overflow-y-auto bg-white rounded-md shadow-lg py-1 z-10 border border-gray-200'>
              <button
                class='sticky top-0 z-10 flex w-full items-center border-b border-gray-100 bg-white px-3 py-2 text-left text-sm font-medium text-green-600 shadow-sm'
                classList={{
                  'hover:bg-green-50 cursor-pointer': canAddCurrentFavorite(),
                  'cursor-not-allowed text-gray-400': !canAddCurrentFavorite(),
                }}
                disabled={!canAddCurrentFavorite()}
                title={canFavorite() ? (isFavorite(store.currentDir) ? '当前目录已收藏' : '收藏当前目录') : '此电脑无法收藏'}
                onClick={addCurrentFavorite}
              >
                + 新增收藏当前目录
              </button>
              <Show
                when={favorites().length}
                fallback={<p class='px-4 py-3 text-sm text-gray-400'>暂无收藏</p>}
              >
                <For each={favorites()}>
                  {path => (
                    <div class='flex items-center hover:bg-gray-100'>
                      <button
                        class='grow text-left px-3 py-2 text-sm text-gray-700 truncate cursor-pointer'
                        title={path}
                        onClick={() => jumpTo(path)}
                      >
                        {path || COMPUTER_LABEL}
                      </button>
                      <button
                        class='px-2 text-gray-400 hover:text-red-500 cursor-pointer'
                        title='删除收藏'
                        onClick={() => removeFavorite(path)}
                      >
                        <Dynamic component={icons('close')} />
                      </button>
                    </div>
                  )}
                </For>
              </Show>
            </div>
          </Show>

          <button class={btnClass} title='排序方式' onClick={() => openSortMenu(!showSortMenu())}>
            <Dynamic component={icons('sort')} />
          </button>

          {/* 排序菜单与收藏菜单共享同一个定位容器，避免窄屏时溢出。 */}
          <Show when={showSortMenu()}>
            <div class='absolute top-full right-0 mt-1 w-32 bg-white rounded-md shadow-lg py-1 z-10 border border-gray-200'>
              <For each={sortOptions}>
                {option => (
                  <button
                    class='block w-full text-left px-4 py-2 text-sm text-gray-700 hover:bg-gray-100 cursor-pointer'
                    onClick={() => handleSort(option.type)}
                  >
                    {option.label}
                  </button>
                )}
              </For>
            </div>
          </Show>
          <button class={btnClass} title='刷新目录' onClick={fileAction.refetch}>
            <Dynamic component={icons('reload')} />
          </button>
        </div>
      </section>

      <section class='file-list overflow-y-scroll'>
        <For each={sortedFiles()}>{(file, i) =>
          <p
            data-idx={i()}
            class='file-items hover:cursor-pointer py-1 whitespace-nowrap'
            classList={{ 'bg-green-200': selectedIdx() === i() }}
            onClick={() => clickItem(file, i())}
            title={file.name}
          >
            <Dynamic component={fileTypes(file)} />
            {file.name}
          </p>
        }</For>
      </section>
      <FileUploader></FileUploader>
    </aside>
  )
}

export default Comp

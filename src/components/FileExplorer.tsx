import type { Component } from 'solid-js'
import { createResource, For, createSignal } from 'solid-js'
import { createEffect } from 'solid-js'
import { Dynamic } from 'solid-js/web'
import neoStore from '../store.ts'
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
const parentDir = new NoeFile(null, '..', 0, -1, false, true)
let lastTarget: EventTarget&Element
let fileListElem: HTMLElement

const resolveDir = async (dir: string): Promise<NoeFile[]> => {
  // console.log('dir :>> ', dir)
  let res = await listDir(dir)
  if ('errno' in res) {
    console.error('error:', res)
    MsgBox.popup('error', JSON.stringify(res), MsgBox.Type.error)
    return
  }
  res = res.map((item: any) => new NoeFile(dir, item.name, item.mtime, item.size, item.isFile, item.isDirectory))
  // res.unshift(parentDir)
  return res
}

const highlightElem = (target:EventTarget&Element) => {
  if (lastTarget) {
    lastTarget.classList?.remove('bg-green-200')
  }
  target.classList?.add('bg-green-200')
  lastTarget = target
}

const clickItem = (target:EventTarget&Element, obj: NoeFile) => {
  highlightElem(target)
  let path: string
  if (obj.type === FileType.directory) {
    setStore('currentDir', dir => NoeFile.path_join(dir, obj.name))
    path = store.currentDir
  } else if (obj.type === FileType.file) {
    setStore('currentFile', () => obj)
    path = NoeFile.path_join(store.currentDir, obj.name)
  }
  // window.location.href = `#${hash}` 会触发hashchange事件，pushState不会
  document.title = NoeFile.path_join(...path.split('/').slice(-2,))
  history.pushState({}, '', `#${path}`)
}

const Comp: Component<{hidden?: boolean}> = (props) => {
  // Add signal for sort menu visibility
  const [showSortMenu, setShowSortMenu] = createSignal(false)
  // Add signal for current sort type
  const [currentSort, setCurrentSort] = createSignal<SortType>(SortType.NAME_ASC)
  let [files, fileAction] = createResource(() => store.currentDir, resolveDir)
  // Create sorted files resource
  const sortedFiles = () => {
    return sortFiles(files(), currentSort())
  }

  const handleHashChange = (e: HashChangeEvent) => {
    // console.log(e)
    if (e.type!=='init' && !e.isTrusted || e.oldURL===e.newURL) {
      return
    }
    const hash = new URL(e.newURL).hash
    if (!hash) {
      return
    }
    // rsplit('/', 1) + 解码
    const [dir, filename] = hash.slice(1, ).split(/\/(?=[^\/]+$)/, 2).map(decodeURIComponent)
    setStore('currentDir', () => dir)
    // const files = await resolveDir(dir)
    const intervalId = setInterval(() => {
      if (files.loading) {
        return
      }
      clearInterval(intervalId)
      for (const f of files()) {
        if (f.name !== filename) {
          continue
        }
        setStore('currentFile', () => f)
      }
      // 定位高亮
      highlightElem(fileListElem.querySelector(`p[title='${filename}']`))
    }, 300)
  }
  // window.onhashchange = handleHashChange
  window.addEventListener('hashchange', handleHashChange, false)
  handleHashChange(new HashChangeEvent('init', { newURL: window.location.href }))

  const seekFile = (step: number) => {
    let pos = 0
    const fileList = sortedFiles()
    const fileNum = fileList.length
    const direction = step > 0? 1: -1
    if(lastTarget && lastTarget.firstElementChild?.textContent==='F') {
      pos = parseInt((lastTarget as HTMLElement).dataset.idx) + step
    }
    pos = Math.max(0, pos) % fileNum
    const lastPos = pos
  
    // 跳过目录，只显示文件
    while (fileList[pos].type !== FileType.file) {
      pos = (pos + direction + fileNum) % fileNum
      // 避免不存在文件的情况
      if (pos === lastPos) {
        return
      }
    }
    clickItem(
      // document.querySelector(`#explorer .file-list p[data-idx='${pos}']`),
      fileListElem.querySelector(`p[data-idx='${pos}']`),
      fileList[pos]
    )
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

  const inputChange = (e: any) => {
    let p = e.currentTarget.value as string
    if (p.endsWith(':')) {
      p = p + '/'
    }
    if (store.currentDir === p) {
      return
    }
    setStore('currentDir', dir => p)
    history.pushState({}, '', `#${store.currentDir}`)
  }
  
  // Handle sorting
  const handleSort = (sortType: SortType) => {
    setCurrentSort(sortType)
    setShowSortMenu(false)
  }

  return (
    <aside id='explorer' classList={{ hidden: props.hidden }} class='flex flex-col border border-gray-200 w-[100%] mx-2 my-2 overflow-hidden'>
      <section class='flex flex-row justify-center items-center text-lg relative'>
        <input
          // flex-grow 属性决定了子容器要占用父容器多少剩余空间
          class='flex-grow border-b border-gray-200 outline-hidden w-[5%] mr-2'
          value={store.currentDir}
          onchange={inputChange}
        />
        {/* https://icones.js.org/collection/mingcute?s=sort */}
        <button class='hover:text-green-400 px-2 cursor-pointer text-gray-700' onClick={e => clickItem(e.target, parentDir)}>
          <Dynamic component={icons('back')} />
        </button>
        <button 
          class='hover:text-green-400 px-2 cursor-pointer text-gray-700'
          onClick={() => setShowSortMenu(!showSortMenu())}
        >
          <Dynamic component={icons('sort')} />
        </button>
        
        {/* Sort dropdown menu */}
        {showSortMenu() && (
          <div class="absolute top-5 right-0 mt-2 w-32 bg-white rounded-md shadow-lg py-1 z-10 border border-gray-200">
            <For each={sortOptions}>
              {option => (
                <button
                  class="block w-full text-left px-4 py-2 text-sm text-gray-700 hover:bg-gray-100"
                  onClick={() => handleSort(option.type)}
                >
                  {option.label}
                </button>
              )}
            </For>
          </div>
        )}
        <button class='hover:text-green-400 px-2 cursor-pointer text-gray-700' onClick={fileAction.refetch}>
          <Dynamic component={icons('reload')} />
        </button>
      </section>
      <section class='file-list overflow-y-scroll' ref={fileListElem}>
        <For each={sortedFiles()}>{(file, i) =>
          <p data-idx={i()} class='file-items hover:cursor-pointer py-1 whitespace-nowrap' onClick={e => clickItem(e.target, file)} title={file.name}>
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

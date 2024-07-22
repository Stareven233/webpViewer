import type { Component } from 'solid-js'
import { createResource, For } from 'solid-js'
import { createEffect } from 'solid-js';
import { Dynamic } from 'solid-js/web'
import neoStore from '../store'
import { listDir } from '../requests'
import { NoeFile, FileType } from '../utils/format'
import * as MsgBox from './MessageBox'


const fileTypes = (obj: NoeFile) => {
  let comp: any
  if (obj.type === FileType.file) {
    comp = <span class='text-green-500 mr-1 select-none'>F</span>
  } else if (obj.type === FileType.directory) {
    comp = <span class='text-orange-400 mr-1 select-none'>D</span>
  } else {
    comp = <span class='text-gray-600 mr-1 select-none'>U</span>
  }
  return () => comp
}


const { store, setStore } = neoStore
const parentDir = new NoeFile(null, '..', -1, false, true)
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
  res = res.map((item: any) => new NoeFile(dir, item.name, item.size, item.isFile, item.isDirectory))
  res.unshift(parentDir)
  return res
}


const highlightElem = (target:EventTarget&Element) => {
  if (lastTarget) {
    lastTarget.classList.remove('bg-green-200')
  }
  target.classList.add('bg-green-200')
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
  let [files, fileAction] = createResource(() => store.currentDir, resolveDir)

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
    const fileList = files()
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
    if (store.currentDir === e.currentTarget.value) {
      return
    }
    setStore('currentDir', dir => e.currentTarget.value)
    history.pushState({}, '', `#${store.currentDir}`)
  }

  return (
    <aside id='explorer' classList={{ hidden: props.hidden }} class='flex flex-col border w-[100%] mx-2 my-2 overflow-hidden'>
      <section class='flex flex-row text-lg'>
        <input
          // flex-grow 属性决定了子容器要占用父容器多少剩余空间
          class='flex-grow border-b outline-none w-[5%] mr-2'
          value={store.currentDir}
          onchange={inputChange}
        />
        <button class='hover:text-green-700 px-2' onClick={e => clickItem(e.target, parentDir)}>↑</button>
        <button class='hover:text-green-700 px-2' onClick={fileAction.refetch}>〇</button>
      </section>
      <section class='file-list overflow-y-scroll' ref={fileListElem}>
        <For each={files()}>{(file, i) =>
          <p data-idx={i()} class='hover:cursor-pointer mb-0.8 whitespace-nowrap' onClick={e => clickItem(e.target, file)} title={file.name}>
            <Dynamic component={fileTypes(file)} />
            {file.name}
          </p>
        }</For>
      </section>
    </aside>
  )
}

export default Comp

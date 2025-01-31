import type { Component } from 'solid-js'
import { createResource, For } from 'solid-js'
import { createEffect } from 'solid-js';
import { Dynamic } from 'solid-js/web'
import neoStore from '../store.ts'
import { listDir } from '../requests.ts'
import { NoeFile, FileType } from '../utils/format.ts'
import * as MsgBox from './MessageBox.tsx'
import FileUploader from './FileUploader.tsx'


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
  res.unshift(parentDir)
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

  return (
    <aside id='explorer' classList={{ hidden: props.hidden }} class='flex flex-col border border-gray-200 w-[100%] mx-2 my-2 overflow-hidden'>
      <section class='flex flex-row text-lg'>
        <input
          // flex-grow 属性决定了子容器要占用父容器多少剩余空间
          class='flex-grow border-b border-gray-200 outline-hidden w-[5%] mr-2'
          value={store.currentDir}
          onchange={inputChange}
        />
        {/* https://icones.js.org/collection/mingcute?s=sort */}
        <button class='hover:text-green-400 px-2 cursor-pointer text-gray-700' onClick={e => clickItem(e.target, parentDir)}><svg xmlns="http://www.w3.org/2000/svg" width="32" height="32" viewBox="0 0 24 24"><g fill="none"><path d="M24 0v24H0V0zM12.593 23.258l-.011.002l-.071.035l-.02.004l-.014-.004l-.071-.035q-.016-.005-.024.005l-.004.01l-.017.428l.005.02l.01.013l.104.074l.015.004l.012-.004l.104-.074l.012-.016l.004-.017l-.017-.427q-.004-.016-.017-.018m.265-.113l-.013.002l-.185.093l-.01.01l-.003.011l.018.43l.005.012l.008.007l.201.093q.019.005.029-.008l.004-.014l-.034-.614q-.005-.019-.02-.022m-.715.002a.02.02 0 0 0-.027.006l-.006.014l-.034.614q.001.018.017.024l.015-.002l.201-.093l.01-.008l.004-.011l.017-.43l-.003-.012l-.01-.01z"/><path fill="currentColor" d="M6.046 11.677A7.5 7.5 0 0 1 20 15.5a1 1 0 1 0 2 0A9.5 9.5 0 0 0 4.78 9.963l-.537-3.045a1 1 0 1 0-1.97.347l1.042 5.909a1 1 0 0 0 .412.645a1.1 1.1 0 0 0 .975.125l5.68-1.001a1 1 0 1 0-.347-1.97z"/></g></svg></button>
        <button class='hover:text-green-400 px-2 cursor-pointer text-gray-700' onClick={fileAction.refetch}><svg xmlns="http://www.w3.org/2000/svg" width="32" height="32" viewBox="0 0 24 24"><g fill="none" fill-rule="evenodd"><path d="m12.594 23.258l-.012.002l-.071.035l-.02.004l-.014-.004l-.071-.036q-.016-.004-.024.006l-.004.01l-.017.428l.005.02l.01.013l.104.074l.015.004l.012-.004l.104-.074l.012-.016l.004-.017l-.017-.427q-.004-.016-.016-.018m.264-.113l-.014.002l-.184.093l-.01.01l-.003.011l.018.43l.005.012l.008.008l.201.092q.019.005.029-.008l.004-.014l-.034-.614q-.005-.019-.02-.022m-.715.002a.02.02 0 0 0-.027.006l-.006.014l-.034.614q.001.018.017.024l.015-.002l.201-.093l.01-.008l.003-.011l.018-.43l-.003-.012l-.01-.01z"/><path fill="currentColor" d="M14.07 19.727a8 8 0 0 1-9.146-3.99a1 1 0 0 0-1.77.933c2.13 4.04 6.836 6.221 11.434 4.99c5.335-1.43 8.5-6.914 7.071-12.248c-1.43-5.335-6.913-8.5-12.247-7.071a10 10 0 0 0-7.414 9.58c-.007.903.995 1.402 1.713.919l2.673-1.801c1.008-.68.332-2.251-.854-1.986l-1.058.236a8 8 0 1 1 9.598 10.439Z"/></g></svg></button>
      </section>
      <section class='file-list overflow-y-scroll' ref={fileListElem}>
        <For each={files()}>{(file, i) =>
          <p data-idx={i()} class='hover:cursor-pointer mb-0.8 whitespace-nowrap' onClick={e => clickItem(e.target, file)} title={file.name}>
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

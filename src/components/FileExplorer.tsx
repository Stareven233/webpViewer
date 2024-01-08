import type { Component } from 'solid-js'
import { createResource, For } from 'solid-js'
import { createEffect } from 'solid-js';
import { Dynamic } from 'solid-js/web'
import neoStore from '../store'
import { listDir } from '../requests'
import { NoeFile } from '../utils/format'
import * as MsgBox from './MessageBox'


const fileTypes = (obj: NoeFile) => {
  let comp: any
  if (obj.isFile) {
    comp = <span class='text-green-500 mr-1 select-none'>F</span>
  } else if (obj.isDirectory) {
    comp = <span class='text-orange-400 mr-1 select-none'>D</span>
  } else {
    comp = <span class='text-gray-600 mr-1 select-none'>U</span>
  }
  return () => comp
}

const Comp: Component<{hidden?: boolean}> = (props) => {
  const { store, setStore } = neoStore
  const parentDir = new NoeFile('..', -1, false, true)
  let lastTarget: EventTarget&Element

  const resolveDir = async (dir: string) => {
    // console.log('dir :>> ', dir)
    let res = await listDir(dir)
    if ('errno' in res) {
      console.error('error:', res)
      MsgBox.popup('error', JSON.stringify(res), MsgBox.Type.error)
      return
    }
    res = res.map((item: any) => new NoeFile(item.name, item.size, item.isFile, item.isDirectory))
    res.unshift(parentDir)
    return res
  }
  const [files, fileAction] = createResource(() => store.currentDir, resolveDir)

  const clickItem = (target:EventTarget&Element, obj: NoeFile) => {
    if (lastTarget) {
      lastTarget.classList.remove('bg-green-200')
    }
    target.classList.add('bg-green-200')
    lastTarget = target
    if (obj.isDirectory) {
      setStore('currentDir', dir => NoeFile.path_join(dir, obj.name))
    } else if (obj.isFile) {
      setStore('currentFile', () => obj)
    }
  }

  const seekFile = (step: number) => {
    let pos = 0
    const fileNum = files().length
    const direction = step > 0? 1: -1
    if(lastTarget && lastTarget.firstElementChild?.textContent==='F') {
      pos = parseInt((lastTarget as HTMLElement).dataset.idx) + step
    }
    pos = Math.max(0, pos) % fileNum
    const lastPos = pos
  
    while (!files()[pos].isFile) {
      pos = (pos + direction + fileNum) % fileNum
      // 避免不存在文件的情况
      if (pos === lastPos) {
        return
      }
    }
    clickItem(
      document.querySelector(`#explorer .file-list p[data-idx='${pos}']`),
      files()[pos]
    )
  }

  const handleKeyEvent = (e:KeyboardEvent) => {
    switch (e.key) {
      case 'ArrowLeft':
        seekFile(-1)
        break;
      case 'ArrowRight':
        seekFile(1)
        break;
      case '+':
        break;
      case '-':
        break;
    }
    // console.log(e)
  }

  createEffect(() => {
    if (store.nextStep === 0) {
      return
    }
    // console.log('next step', store.nextStep)
    seekFile(store.nextStep)
    // 每次结束后重置，方便后面再次触发
    setStore('nextStep', s => 0)
  })

  return (
    <aside id='explorer' classList={{ hidden: props.hidden }} class='flex flex-col border w-[100%] mx-2 my-2 overflow-hidden' tabindex={0} onkeydown={e => handleKeyEvent(e)}>
      <section class='flex flex-row text-lg'>
        <input
          // flex-grow 属性决定了子容器要占用父容器多少剩余空间
          class='flex-grow border-b outline-none w-[5%] mr-2'
          value={store.currentDir}
          onChange={e => setStore('currentDir', dir => e.currentTarget.value)}
        />
        <button class='hover:text-green-700 px-2' onClick={e => clickItem(e.target, parentDir)}>↑</button>
        <button class='hover:text-green-700 px-2' onClick={fileAction.refetch}>〇</button>
      </section>
      <section class='file-list overflow-y-scroll'>
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

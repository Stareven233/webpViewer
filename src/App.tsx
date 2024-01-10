import type { Component } from 'solid-js'
import { createSignal, Show } from 'solid-js'
import { onMount } from "solid-js"

import FileExplorer from './components/FileExplorer'
import DataPanel from './components/DataPanel'
import * as MsgBox from './components/MessageBox'
import TouchEvent from './utils/touch'
import neoStore from './store'


// 大文件没有下载 url & type错误
// datapanel底部页码显示
// 预加载/缓存
// hash记录浏览位置
// 文件上传
// 支持mhtml浏览

const [viewID, setviewID] = createSignal(0)
const mainComps = [FileExplorer, DataPanel]

const pageNext = () => setviewID(prev => Math.min(prev+1, mainComps.length-1))
const pagePrev = () => setviewID(prev => Math.max(prev-1, 0))

const { setStore } = neoStore
const handleKeyEvent = (e:KeyboardEvent) => {
  switch (e.key) {
    case 'a':
      pagePrev()
      break
    case 'd':
      pageNext()
      break
    case 'w':
      setStore('nextStep', () => -1)
      break
    case 's':
      setStore('nextStep', () => 1)
      break
  }
}

const App: Component = () => {
  let mainPanel: HTMLElement
  onMount(() => {
    // 往左滑动，切换下一页
    TouchEvent.bind(mainPanel, 'slideleft', pageNext)
    // 往右滑动，切换前一页
    TouchEvent.bind(mainPanel, 'slideright', pagePrev)
  })
  return (
    <main ref={mainPanel} class='flex flex-row h-full mt-2 selection:bg-orange-300' onkeydown={e => handleKeyEvent(e)} tabindex={1}>
      {/* <Dynamic component={mainComps[viewID()]} /> */}
      <FileExplorer hidden={viewID() !== 0}></FileExplorer>
      <DataPanel hidden={viewID() !== 1}></DataPanel>
      <MsgBox.Comp></MsgBox.Comp>
    </main>
  )
}

export default App;

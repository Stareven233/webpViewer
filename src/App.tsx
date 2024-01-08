import type { Component } from 'solid-js'
import { createSignal, Show } from 'solid-js'
import { Dynamic } from "solid-js/web"
import { onMount } from "solid-js"

import FileExplorer from './components/FileExplorer'
import DataPanel from './components/DataPanel'
import * as MsgBox from './components/MessageBox'
import TouchEvent from './utils/touch'

// 图片放大
// 图片翻页
// hash记录浏览位置

const [viewID, setviewID] = createSignal(0)
const mainComps = [FileExplorer, DataPanel]

const App: Component = () => {
  let mainPanel: HTMLElement
  onMount(() => {
    // 往左滑动，切换下一页
    TouchEvent.bind(mainPanel, 'slideleft', () => setviewID(prev => Math.min(prev+1, mainComps.length-1)))
    // 往右滑动，切换前一页
    TouchEvent.bind(mainPanel, 'slideright', () => setviewID(prev => Math.max(prev-1, 0)))
  })
  return (
    <main ref={mainPanel} class='flex flex-row h-full mt-2 selection:bg-orange-300'>
      {/* <Dynamic component={mainComps[viewID()]} /> */}
      <FileExplorer hidden={viewID() !== 0}></FileExplorer>
      <DataPanel hidden={viewID() !== 1}></DataPanel>
      <MsgBox.Comp></MsgBox.Comp>
    </main>
  )
}

export default App;

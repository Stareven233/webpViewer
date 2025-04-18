import type { Component } from 'solid-js'
import { createSignal } from 'solid-js'
import { onMount } from "solid-js"

import FileExplorer from './components/FileExplorer.tsx'
import DataPanel from './components/DataPanel.tsx'
import * as MsgBox from './components/MessageBox.tsx'
import TouchEvent from './utils/touch.ts'
import neoStore from './store.ts'


const [viewID, setviewID] = createSignal(0)
const mainComps = [FileExplorer, DataPanel]
let mainPanel: HTMLElement

const viewNext = () => setviewID(prev => Math.min(prev+1, mainComps.length-1))
const viewPrev = () => setviewID(prev => Math.max(prev-1, 0))

const { setStore } = neoStore
const handleKeyEvent = (e:KeyboardEvent) => {
  if (e.target !== mainPanel) {
    return
  }
  switch (e.key) {
    case 'a':
      viewPrev()
      break
    case 'd':
      viewNext()
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
  onMount(() => {
    // 往左滑动，切换下一页
    TouchEvent.bind(mainPanel, 'slideleft', viewNext)
    // 往右滑动，切换前一页
    TouchEvent.bind(mainPanel, 'slideright', viewPrev)
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

export default App

import type { Component } from 'solid-js'
import { createSignal, onMount } from 'solid-js'

import FileExplorer from './components/FileExplorer.tsx'
import DataPanel from './components/DataPanel.tsx'
import * as MsgBox from './components/MessageBox.tsx'
import TouchEvent from './utils/touch.ts'
import neoStore from './store.ts'

const [viewID, setviewID] = createSignal(0)
let mainPanel: HTMLElement | undefined

const viewNext = () => setviewID((prev) => Math.min(prev + 1, 1))
const viewPrev = () => setviewID((prev) => Math.max(prev - 1, 0))

const { setStore } = neoStore
const handleKeyEvent = (e: KeyboardEvent) => {
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
    TouchEvent.bind(mainPanel, 'slideleft', viewNext)
    TouchEvent.bind(mainPanel, 'slideright', viewPrev)
  })

  return (
    <main
      ref={mainPanel}
      class='flex flex-row h-full mt-2 selection:bg-[#ffe49ccc] selection:text-black'
      onkeydown={(e) => handleKeyEvent(e)}
      tabindex={1}
    >
      <FileExplorer hidden={viewID() !== 0}></FileExplorer>
      <DataPanel hidden={viewID() !== 1} onShowExplorer={() => setviewID(0)}></DataPanel>
      <MsgBox.Comp></MsgBox.Comp>
    </main>
  )
}

export default App

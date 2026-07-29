import type { Component } from 'solid-js'
import { createSignal, onMount } from 'solid-js'

import FileExplorer from './components/FileExplorer.tsx'
import DataPanel from './components/DataPanel.tsx'
import MyComputers from './components/MyComputers.tsx'
import * as MsgBox from './components/MessageBox.tsx'
import TouchEvent from './utils/touch.ts'
import neoStore from './store.ts'

const [viewID, setviewID] = createSignal(0)
// 0 文件浏览 / 1 内容预览 / 2 电脑书签（跨机跳转入口）
const VIEW_COMPUTERS = 2
let mainPanel: HTMLElement | undefined

const viewNext = () => setviewID((prev) => Math.min(prev + 1, 1))
const viewPrev = () => setviewID((prev) => Math.max(prev - 1, 0))

const { setStore } = neoStore
const handleKeyEvent = (e: KeyboardEvent) => {
  if (e.target !== mainPanel) {
    return
  }
  // 书签页不参与 ad 滑动翻页，避免误切
  if (viewID() === VIEW_COMPUTERS) {
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

/** 整页跳转到目标机 webpViewer；location 会换源，收藏列表按浏览器隔离 */
const handleSelectComputer = (url: string) => {
  window.location.href = url
}

const App: Component = () => {
  onMount(() => {
    TouchEvent.bind(mainPanel, 'slideleft', () => {
      if (viewID() !== VIEW_COMPUTERS) viewNext()
    })
    TouchEvent.bind(mainPanel, 'slideright', () => {
      if (viewID() !== VIEW_COMPUTERS) viewPrev()
    })
  })

  const toggleComputers = () => {
    setviewID((prev) => (prev === VIEW_COMPUTERS ? 0 : VIEW_COMPUTERS))
  }

  return (
    <main
      ref={mainPanel}
      class='relative flex flex-row h-full mt-2 selection:bg-orange-300'
      onkeydown={(e) => handleKeyEvent(e)}
      tabindex={1}
    >
      <FileExplorer hidden={viewID() !== 0}></FileExplorer>
      <DataPanel hidden={viewID() !== 1}></DataPanel>
      <MyComputers hidden={viewID() !== VIEW_COMPUTERS} onSelect={handleSelectComputer} />
      <MsgBox.Comp></MsgBox.Comp>

      {/* 右上角：电脑书签入口，独立于 ad 视图切换 */}
      <div class='absolute top-2 right-2 z-10'>
        <button
          onClick={toggleComputers}
          class='w-9 h-9 flex items-center justify-center rounded-full bg-white shadow hover:bg-gray-100 transition-colors'
          title={viewID() === VIEW_COMPUTERS ? '返回浏览' : '我的电脑'}
        >
          {viewID() === VIEW_COMPUTERS ? (
            <svg xmlns='http://www.w3.org/2000/svg' class='w-5 h-5 text-gray-600' fill='none' viewBox='0 0 24 24' stroke='currentColor'>
              <path stroke-linecap='round' stroke-linejoin='round' stroke-width='2' d='M15 19l-7-7 7-7' />
            </svg>
          ) : (
            <svg xmlns='http://www.w3.org/2000/svg' class='w-5 h-5 text-gray-600' fill='none' viewBox='0 0 24 24' stroke='currentColor'>
              <path
                stroke-linecap='round'
                stroke-linejoin='round'
                stroke-width='2'
                d='M13.828 10.172a4 4 0 00-5.656 0l-4 4a4 4 0 105.656 5.656l1.102-1.101M10.172 13.828a4 4 0 005.656 0l4-4a4 4 0 10-5.656-5.656l-1.102 1.101'
              />
            </svg>
          )}
        </button>
      </div>
    </main>
  )
}

export default App

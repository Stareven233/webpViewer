import type { Component } from 'solid-js'
import FileExplorer from './components/FileExplorer'
import DataPanel from './components/DataPanel'
import MessageBox from './components/MessageBox'

// 加一个消息组件的component
// 图片放大
// explorer隐藏

const App: Component = () => {
  return (
    <main class='flex flex-row h-full mt-2 selection:bg-orange-300'>
      <FileExplorer></FileExplorer>
      <DataPanel></DataPanel>
      <MessageBox></MessageBox>
    </main>
  )
}

export default App;

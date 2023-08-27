import type { Component } from 'solid-js'
import FileExplorer from './components/FileExplorer'
import DataPanel from './components/DataPanel'

const App: Component = () => {
  return (
    <main class='flex flex-row mt-2 selection:bg-orange-300'>
      <FileExplorer></FileExplorer>
      <DataPanel></DataPanel>
    </main>
  )
}

export default App;

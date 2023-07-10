import type { Component } from 'solid-js';
import FileExplorer from './components/FileExplorer'

const App: Component = () => {
  return (
    <main class='flex flex-row mt-2 selection:bg-orange-300'>
      <FileExplorer></FileExplorer>
      <p class="text-4xl text-green-700 text-center py-20 flex-grow">Hello 炸虾狮!</p>
    </main>
  );
};

export default App;

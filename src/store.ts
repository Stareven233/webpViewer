import { createRoot } from 'solid-js'
import { createStore } from 'solid-js/store'
import { NoeFile } from './utils/format'


function _createStore() {
  const [store, setStore] = createStore({
    currentDir: 'C:/',
    currentFile: new NoeFile('', -1, false, false),
    // 0不动，其余表示移动步数
    nextStep: 0,
  })
  return {store, setStore}
}

export default createRoot(_createStore);

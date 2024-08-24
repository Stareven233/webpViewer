import { createRoot } from 'solid-js'
import { createStore } from 'solid-js/store'
import { NoeFile, FileSize } from './utils/format'


export const config = {
  // 默认根目录
  defaultRoot: 'C:/',
  maxFileSize: new FileSize(200, 'MB'),
  extOfText: new Set(['ass', 'srt', 'txt', 'json', 'xml', 'css', 'js', 'ts', 'py', 'java', 'php', 'sh', 'bat', 'cmd', 'ps1', 'md', 'html', 'htm', 'vue', 'jsx', 'tsx', 'c', 'cpp', 'h', 'hpp', 'h', 'log', 'ini', 'conf', 'yaml', ]),
}

function _createStore() {
  const [store, setStore] = createStore({
    currentDir: config.defaultRoot,
    currentFile: new NoeFile(),
    // 0不动，其余表示移动步数
    nextStep: 0,
  })
  return {store, setStore}
}

export default createRoot(_createStore)

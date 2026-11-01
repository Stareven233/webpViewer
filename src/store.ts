import { createRoot } from 'solid-js'
import { createStore } from 'solid-js/store'
import { NoeFile, FileSize } from './utils/format.ts'


export const config = {
  // 默认根目录：'' (COMPUTER_ROOT) 表示"设备"磁盘选择视图
  defaultRoot: NoeFile.COMPUTER_ROOT,
  maxFileSize: new FileSize(200, 'MB'),
  // 可预览的扩展名白名单：判定先于网络请求，不在名单里的文件（如 mp4）不会下载任何内容。
  extOfImage: new Set(['webp', 'jpg', 'jpeg', 'jfif', 'png', 'gif', 'bmp', 'svg', 'avif', 'ico', 'tif', 'tiff']),
  extOfHtml: new Set(['html', 'htm', 'mhtml', 'mht']),
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

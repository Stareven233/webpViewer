import { createRoot } from 'solid-js'
import { createStore } from 'solid-js/store'
import { NoeFile, FileSize } from './utils/format.ts'


export const config = {
  // 默认根目录：'' (COMPUTER_ROOT) 表示"设备"磁盘选择视图
  defaultRoot: NoeFile.COMPUTER_ROOT,
  maxFileSize: new FileSize(200, 'MB'),
  // 可预览的扩展名白名单：判定先于网络请求，不在名单里的文件（如 exe）不会下载任何内容。
  extOfImage: new Set(['webp', 'jpg', 'jpeg', 'jfif', 'png', 'gif', 'bmp', 'svg', 'avif', 'ico', 'tif', 'tiff']),
  extOfHtml: new Set(['html', 'htm', 'mhtml', 'mht']),
  // 视频/音频走 Range 流式传输，不受 maxFileSize 限制。
  // mov/mkv 属于“尽力而为”：多数浏览器只认 H.264/AAC，播放失败由 <video> 的 error 事件提示。
  extOfVideo: new Set(['mp4', 'm4v', 'mov', 'webm', 'ogv', 'ogg', 'mkv']),
  extOfAudio: new Set(['mp3', 'm4a', 'aac', 'flac', 'wav', 'opus', 'oga']),
  extOfText: new Set(['ass', 'srt', 'txt', 'json', 'xml', 'css', 'js', 'ts', 'py', 'java', 'php', 'sh', 'bat', 'cmd', 'ps1', 'md', 'html', 'htm', 'vue', 'jsx', 'tsx', 'c', 'cpp', 'h', 'hpp', 'h', 'log', 'ini', 'conf', 'yaml', ]),
}

function _createStore() {
  const [store, setStore] = createStore({
    currentDir: config.defaultRoot,
    currentFile: new NoeFile(),
    // 0不动，其余表示移动步数
    nextStep: 0,
    // 文件信息悬浮栏是否显示：全局状态，切换文件不重置，由用户主动开关决定
    showFileHeader: true,
  })
  return {store, setStore}
}

export default createRoot(_createStore)

// https://www.solidjs.com/tutorial/flow_show
import type { Component } from 'solid-js'
import { createEffect, createResource, createSignal, Show } from 'solid-js'
import { onMount } from 'solid-js'
import { Dynamic } from 'solid-js/web'

import neoStore from '../store.ts'
import { config } from '../store.ts'
import * as requests from '../requests.ts'
import { FileSize, FileType, NoeFile } from '../utils/format.ts'
import TouchEvent from '../utils/touch.ts'
import { copyFileToClipboard } from '../utils/copy.ts'


const ImagePanel: Component<{ url?: string, name: string }> = props => {
  return <img class='object-contain object-center mx-auto max-h-[96vh]' src={props.url} alt={props.name} />
}

const TextPanel: Component<{ text: string }> = props => {
  return (
    <section class='overflow-y-scroll text-left justify-normal'>
      <pre class='mx-4 wrap-break-word whitespace-pre-wrap'>{props.text}</pre>
    </section>
  )
}

const HTMLPanel: Component<{ html: string }> = props => {
  return <iframe srcdoc={props.html} height='100%' width='100%' title='文件预览'></iframe>
}

// const showPanels = (mime: string, url: string, text: string) => {
const showPanels = (file: NoeFile) => {
  const mime = file.mime()
  // if (mime === 'application/octet-stream') {
  //   // https://github.com/jsdom/jsdom
  //   const html = mhtml2html.parse(file.blobText())
  //   return () => <iframe src={file.fullpath()} height='100%' width='100%'></iframe>
  // } else if (mime.startsWith('text/html')) {
  //   return () => <HTMLPanel html={file.blobText()} />
  // }
  if (!mime || mime.startsWith('text/html')) {
    // 默认.mhtml已经转换成了html
    return () => <HTMLPanel html={file.blobText?.() ?? '[null]'} />
  }

  if (mime.startsWith('image/')) {
    return () => <ImagePanel url={file.url} name={file.name} />
  } else if (mime.startsWith('text/') || config.extOfText.has(file.extname().toLowerCase())) {
    return () => <TextPanel text={file.blobText?.() ?? '[null]'} />
  }
  return () => <p class='text-2xl'>该文件暂不支持浏览: {file.toString()}</p>
}

const Comp: Component<{ hidden?: boolean }> = (props) => {
  const { store, setStore } = neoStore
  const maxSize = config.maxFileSize
  const [hasHeader, setHasHeader] = createSignal(true)
  const [copyStatus, setCopyStatus] = createSignal('')
  let panel: HTMLElement | undefined

  /** 当前选中文件是唯一事实来源，避免复制到普通对象后失去 Solid 的响应式追踪。 */
  const currentFile = () => store.currentFile
  const hasSelectedFile = () => currentFile().type === FileType.file && Boolean(currentFile().name)
  const [blob] = createResource(currentFile, requests.getBlob)
  // 链接的目标只能由本机后端解析；普通文件不发额外请求。
  const isLocalLink = () => currentFile().isLink || currentFile().extname().toLowerCase() === 'lnk'
  const [linkTarget] = createResource(
    () => isLocalLink() ? [currentFile().dir, currentFile().name] as const : undefined,
    ([dir, name]) => requests.getLinkTarget(dir, name),
  )
  const [blobText] = createResource(blob, async currentBlob => {
    const size = new FileSize(currentBlob.size, maxSize.scale)
    if (!currentBlob.type.startsWith('text/') && size.value > maxSize.value) {
      return `[oversize file ${size.show()}/${maxSize.show()} for blob.text()]`
    }
    return await currentBlob.text()
  })

  /**
   * 为预览层补充请求结果。每次读取都从 store 取最新文件，
   * 因此在文件列表选择其他文件后，隐藏的 DataPanel 重新显示时也会立即刷新。
   */
  const previewFile = () => {
    const file = new NoeFile()
    file.update(currentFile())
    file.url = requests.constructFileURL(file)
    file.blob = blob
    file.blobText = blobText
    return file
  }

  createEffect(() => {
    // 文件切换时恢复信息栏并清空旧文件的复制反馈，避免状态串到下一份文件。
    currentFile()
    setHasHeader(true)
    setCopyStatus('')
  })

  onMount(() => {
    if (!panel) {
      return
    }
    TouchEvent.bind(panel, 'slideup', () => setStore('nextStep', () => -1))
    TouchEvent.bind(panel, 'slidedown', () => setStore('nextStep', () => 1))
  })

  const copy2Clipboard = async () => {
    const state = await copyFileToClipboard(previewFile())
    setCopyStatus(state)
    setTimeout(() => setCopyStatus(''), 2000)
  }

  /**
   * 沿用文件浏览器的 hash 路由：目标为文件时自动在所在目录选中它，
   * 目标为目录时补上末尾斜杠，让路由将其识别为目录而不是文件名。
   */
  const jumpToLinkTarget = () => {
    const target = linkTarget()
    if (!target) {
      return
    }
    window.location.hash = target.isDirectory ? `${target.path}/` : target.path
  }

  return (
    <section id='dataPanel' ref={panel} classList={{ hidden: props.hidden }} class='relative w-full h-full text-center'>
      <Show
        when={hasSelectedFile() && hasHeader()}
        fallback={
          <Show when={hasSelectedFile()}>
            <button
              class='absolute top-3 right-3 z-10 rounded-full border border-gray-200 bg-white/90 px-3 py-1.5 text-xs text-gray-600 shadow-sm backdrop-blur hover:bg-white hover:text-green-600 cursor-pointer'
              title='显示文件信息'
              onClick={() => setHasHeader(true)}
            >
              文件信息
            </button>
          </Show>
        }
      >
        {/* 紧凑的悬浮信息栏不再占用预览区域的大块高度，文件切换时会自动展示最新信息。 */}
        <header class='absolute inset-x-3 top-3 z-10 flex items-center gap-3 rounded-xl border border-gray-200 bg-white/90 px-3 py-2 text-left shadow-sm backdrop-blur-md'>
          <div class='min-w-0 grow'>
            {/* 文件名只承担信息展示；下载行为集中到右侧唯一的明确按钮。 */}
            <p class='truncate text-sm font-medium text-gray-800' title={currentFile().name}>
              {currentFile().name}
            </p>
            <p class='mt-0.5 truncate text-xs text-gray-500'>
              {currentFile().size.show()} · {previewFile().mime() || '正在识别文件类型'}
            </p>
          </div>
          <div class='flex shrink-0 items-center gap-1'>
            <a
              class='rounded-md px-2 py-1 text-xs text-gray-600 hover:bg-gray-100 hover:text-green-600'
              href={requests.constructDownloadURL(currentFile())}
              download={currentFile().name}
            >
              下载
            </a>
            <Show when={isLocalLink()}>
              <button
                class='rounded-md px-2 py-1 text-xs text-gray-600 hover:bg-gray-100 hover:text-green-600 disabled:cursor-not-allowed disabled:text-gray-400 disabled:hover:bg-transparent'
                disabled={linkTarget.loading || !linkTarget()}
                title={linkTarget()?.path ?? (linkTarget.loading ? '正在解析链接目标' : '链接目标不可用')}
                onClick={jumpToLinkTarget}
              >
                {linkTarget.loading ? '解析中…' : linkTarget() ? '跳转' : '链接不可用'}
              </button>
            </Show>
            <button
              class='rounded-md bg-green-600 px-2 py-1 text-xs text-white shadow-sm hover:bg-green-700 cursor-pointer'
              onClick={copy2Clipboard}
            >
              {copyStatus() || '复制'}
            </button>
            <button
              class='ml-1 rounded-md px-1.5 py-1 text-base leading-none text-gray-400 hover:bg-gray-100 hover:text-gray-700 cursor-pointer'
              title='隐藏文件信息'
              aria-label='隐藏文件信息'
              onClick={() => setHasHeader(false)}
            >
              ×
            </button>
          </div>
        </header>
      </Show>

      <div class='flex flex-col h-full justify-center overflow-y-scroll'>
        {/* 套一层 Show，避免 Blob 尚未解析时渲染出过期预览。 */}
        <Show when={blob.loading}>
          <p class='text-sm text-gray-500'>正在加载文件…</p>
        </Show>
        <Show when={hasSelectedFile() && !blob.loading && blob()}>
          <Dynamic component={showPanels(previewFile())} />
        </Show>
        {/* 调用 URL.revokeObjectURL(url) 方法，从内部映射中删除引用，从而允许删除 Blob（如果没有其他引用），并释放内存 */}
      </div>
    </section>
  )
}

export default Comp

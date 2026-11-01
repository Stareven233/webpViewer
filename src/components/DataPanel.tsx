// https://www.solidjs.com/tutorial/flow_show
import type { Component } from 'solid-js'
import { createEffect, createMemo, createResource, createSignal, ErrorBoundary, onCleanup, Show } from 'solid-js'
import { onMount } from 'solid-js'

import neoStore from '../store.ts'
import { config } from '../store.ts'
import * as requests from '../requests.ts'
import { FileType, NoeFile } from '../utils/format.ts'
import TouchEvent from '../utils/touch.ts'
import { copyFileToClipboard } from '../utils/copy.ts'


type PreviewKind = 'html' | 'image' | 'text' | 'unsupported'

const ImagePanel: Component<{ url?: string, name: string }> = props => {
  return <img class='object-contain object-center mx-auto max-h-[96vh]' src={props.url} alt={props.name} />
}

const TextPanel: Component<{ text: string }> = props => {
  return (
    <section class='w-full overflow-y-scroll text-left justify-normal'>
      <pre class='mx-4 wrap-break-word whitespace-pre-wrap'>{props.text}</pre>
    </section>
  )
}

const HTMLPanel: Component<{ html: string }> = props => {
  return <iframe srcdoc={props.html} height='100%' width='100%' class='w-full' title='文件预览'></iframe>
}

/**
 * 让出一帧，保证悬浮栏先完成绘制再做文本解码，
 * 否则超大文本的 text() 会连同首帧一起阻塞。
 */
const nextPaint = () => new Promise<void>(resolve => {
  requestAnimationFrame(() => setTimeout(resolve, 0))
})

/** 后端对超限文件会返回 text/warn 文本，不当成图片/文本展示。 */
const isWarnBlob = (content: Blob) => content.type === 'text/warn'

/**
 * 预览加载/失败时的统一样式。
 * 这些提示不依赖任何网络请求，出现在预览区而不会影响上方悬浮下载栏。
 */
const Notice: Component<{ title: string, detail?: string, children?: any }> = props => (
  <div class='mx-auto flex max-w-md flex-col items-center gap-2 px-6 py-8 text-center text-sm text-gray-500'>
    <p class='text-base font-medium text-gray-700'>{props.title}</p>
    <Show when={props.detail}>
      <p class='break-all text-xs text-gray-400'>{props.detail}</p>
    </Show>
    {props.children}
  </div>
)

const Comp: Component<{ hidden?: boolean, onShowExplorer?: () => void }> = (props) => {
  const { store, setStore } = neoStore
  const [hasHeader, setHasHeader] = createSignal(true)
  const [copyStatus, setCopyStatus] = createSignal('')
  // 出错重试计数，作为资源 source 的一部分触发重新请求。
  const [retryTick, setRetryTick] = createSignal(0)
  let panel: HTMLElement | undefined
  let loadController: AbortController | undefined

  /** 当前选中文件是唯一事实来源，避免复制到普通对象后失去 Solid 的响应式追踪。 */
  const currentFile = () => store.currentFile
  const hasSelectedFile = () => currentFile().type === FileType.file && Boolean(currentFile().name)
  const extname = () => currentFile().extname().toLowerCase()

  /**
   * 预览类型完全由扩展名判定，必须先于网络请求得出：
   * 不支持的格式（如 mp4）根本不发请求，避免几 GB 文件被整份下载。
   */
  const previewKind = createMemo<PreviewKind>(() => {
    if (!hasSelectedFile()) {
      return 'unsupported'
    }
    const ext = extname()
    if (config.extOfImage.has(ext)) {
      return 'image'
    }
    if (config.extOfHtml.has(ext)) {
      return 'html'
    }
    if (config.extOfText.has(ext)) {
      return 'text'
    }
    return 'unsupported'
  })

  /**
   * 读取文件内容。切换文件时中止上一次仍在传输的请求，
   * 否则快速连续点击大文件会堆积多个下载，把真正想看的文件排在后面。
   */
  const fetchBlob = async (file: NoeFile) => {
    loadController?.abort()
    const controller = new AbortController()
    loadController = controller
    return await requests.getBlob(file, controller.signal)
  }
  // 只有可预览的类型才拉取内容；不支持的文件只保留悬浮栏里的下载入口。
  const [blob] = createResource(
    () => previewKind() !== 'unsupported' ? [currentFile(), retryTick()] as const : undefined,
    ([file]) => fetchBlob(file),
  )
  onCleanup(() => loadController?.abort())

  /** errored 状态下直接读取资源会抛异常，这里统一收敛为 undefined。 */
  const safeBlob = () => blob.state === 'errored' ? undefined : blob()

  // 链接的目标只能由本机后端解析；普通文件不发额外请求。
  const isLocalLink = () => currentFile().isLink || extname() === 'lnk'
  const [linkTarget] = createResource(
    () => isLocalLink() ? [currentFile().dir, currentFile().name] as const : undefined,
    ([dir, name]) => requests.getLinkTarget(dir, name),
  )

  /**
   * 文本/HTML 才需要解码；解码前先让出一帧，保证悬浮栏已绘制。
   */
  const textSource = () => {
    const kind = previewKind()
    if (kind !== 'text' && kind !== 'html') {
      return undefined
    }
    const content = safeBlob()
    // 超限的 warn 文本由 renderPreview 统一提示，无需再解码。
    if (!content || isWarnBlob(content)) {
      return undefined
    }
    return content
  }
  const decodeText = async (content: Blob) => {
    await nextPaint()
    return await content.text()
  }
  const [blobText] = createResource(textSource, decodeText)

  // 图片直接复用已下载的 Blob，避免 <img src> 再发一次请求造成“二次等待”。
  // 用 memo 保证首帧就有 URL；上一个 objectURL 在重算时立即释放，避免 Blob 常驻内存。
  let lastObjectURL: string | undefined
  const objectURL = createMemo(() => {
    const content = previewKind() === 'image' ? safeBlob() : undefined
    if (lastObjectURL) {
      URL.revokeObjectURL(lastObjectURL)
      lastObjectURL = undefined
    }
    if (!content) {
      return undefined
    }
    lastObjectURL = URL.createObjectURL(content)
    return lastObjectURL
  })
  onCleanup(() => lastObjectURL && URL.revokeObjectURL(lastObjectURL))

  /**
   * 为复制功能补充请求结果。每次读取都从 store 取最新文件，
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

  const retryLoad = () => {
    // 错误多来自后端瞬时失败，重新拉取即可；文本资源会随新的 Blob 自动重算。
    setRetryTick(tick => tick + 1)
  }

  /** 预览默认自动加载，不拦截用户；加载中通过 Notice 告知即可。 */
  const renderPreview = () => {
    if (!hasSelectedFile()) {
      return <Notice title='未选择文件' detail='在左侧文件列表中点击一个文件即可预览' />
    }

    const kind = previewKind()
    // 不支持的格式不请求内容，也不提示加载中，直接用下载入口兜底。
    if (kind === 'unsupported') {
      return (
        <Notice title='该文件暂不支持预览' detail={`${currentFile().name} · ${currentFile().size.show()}`}>
          <a
            class='text-xs text-gray-500 underline hover:text-green-600'
            href={requests.constructDownloadURL(currentFile())}
            download={currentFile().name}
          >
            下载文件
          </a>
        </Notice>
      )
    }

    if (blob.loading) {
      return (
        <Notice title='正在读取文件…' detail={currentFile().name}>
          <p class='text-xs text-gray-400'>
            {currentFile().size.show()} · 可以在上方直接下载或复制，无需等待预览完成
          </p>
        </Notice>
      )
    }
    if (blob.state === 'errored') {
      return (
        <Notice title='文件读取失败' detail={String(blob.error?.message ?? blob.error)}>
          <button
            class='mt-1 rounded-md border border-gray-200 px-3 py-1.5 text-xs text-gray-600 hover:bg-gray-50 cursor-pointer'
            onClick={retryLoad}
          >
            重新加载
          </button>
        </Notice>
      )
    }
    if (!safeBlob()) {
      return <Notice title='暂无可预览内容' />
    }

    // 超过预览上限时后端只回一个 warn 文本，统一提示，不当作图片/文本渲染。
    if (isWarnBlob(safeBlob()!)) {
      return <Notice title='文件过大，无法预览' detail={`${currentFile().size.show()}，上方仍可直接下载`} />
    }

    // 图片不需要文本解码，优先渲染。
    if (kind === 'image') {
      return <ImagePanel url={objectURL()} name={currentFile().name} />
    }

    // blobText 尚未生成时也读到 undefined，统一当作解码中。
    if (blobText.state === 'errored') {
      return (
        <Notice title='文本解码失败' detail={String(blobText.error?.message ?? blobText.error)}>
          <button
            class='mt-1 rounded-md border border-gray-200 px-3 py-1.5 text-xs text-gray-600 hover:bg-gray-50 cursor-pointer'
            onClick={retryLoad}
          >
            重新加载
          </button>
        </Notice>
      )
    }

    const text = blobText()
    if (text === undefined) {
      return <Notice title='正在解码文本…' detail={`${currentFile().name} · 上方可直接下载或复制`} />
    }

    if (kind === 'html') {
      return <HTMLPanel html={text} />
    }
    return <TextPanel text={text} />
  }

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
    if (target.isDirectory) {
      // 目录目标应立即回到浏览器视图，再由 hashchange 驱动目录刷新。
      props.onShowExplorer?.()
      window.location.hash = `${target.path}/`
      return
    }
    window.location.hash = target.path
  }

  /** 悬浮栏的副标题：MIME 尚未就绪时用扩展名兜底，保证信息栏始终有内容。 */
  const subtitle = () => {
    const mime = currentFile().mime()
    const ext = extname()
    const type = mime || (ext ? `.${ext}` : '正在识别文件类型')
    return `${currentFile().size.show()} · ${type}`
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
        {/*
          悬浮栏只依赖 selectedFile 这些同步数据，绝不读取 blob：
          预览请求再慢或失败，下载/复制入口也能立即渲染并可用。
        */}
        <header class='absolute inset-x-3 top-3 z-10 flex items-center gap-3 rounded-xl border border-gray-200 bg-white/90 px-3 py-2 text-left shadow-sm backdrop-blur-md'>
          <div class='min-w-0 grow'>
            {/* 文件名只承担信息展示；下载行为集中到右侧唯一的明确按钮。 */}
            <p class='truncate text-sm font-medium text-gray-800' title={currentFile().name}>
              {currentFile().name}
            </p>
            <p class='mt-0.5 truncate text-xs text-gray-500'>{subtitle()}</p>
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
        <div class='flex h-full w-full flex-col items-center justify-center'>
          {/*
            预览区的任何渲染异常都只影响预览本身：
            悬浮信息栏在边界之外，下载/复制入口不会因为预览崩溃而消失。
          */}
          <ErrorBoundary fallback={(err, reset) => (
            <Notice title='预览出错了' detail={String(err?.message ?? err)}>
              <button
                class='mt-1 rounded-md border border-gray-200 px-3 py-1.5 text-xs text-gray-600 hover:bg-gray-50 cursor-pointer'
                onClick={() => {
                  retryLoad()
                  reset()
                }}
              >
                重试
              </button>
            </Notice>
          )}>
            {renderPreview()}
          </ErrorBoundary>
        </div>
        {/* 调用 URL.revokeObjectURL(url) 方法，从内部映射中删除引用，从而允许删除 Blob（如果没有其他引用），并释放内存 */}
      </div>
    </section>
  )
}

export default Comp

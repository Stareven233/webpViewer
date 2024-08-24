// https://www.solidjs.com/tutorial/flow_show
import type { Component } from 'solid-js'
import { createEffect, createResource, Show, createSignal } from 'solid-js'
import { onMount } from 'solid-js'
import { Dynamic } from 'solid-js/web'

import neoStore from '../store'
import { config } from '../store'
import * as requests from '../requests'
import { formatBytes, NoeFile } from '../utils/format'
import TouchEvent from '../utils/touch'


// 超过限制的其余类型文件（text以外）不解码为文本，否则速度很慢
const [hasHeader, setHasHeader] = createSignal(false)
const toggleHeader = (e: MouseEvent) => {
  if (e.clientY > 100) {
    return
  }
  setHasHeader(v => !v)
  e.stopImmediatePropagation()
}

const ImagePanel: Component<any> = props => {
  return <img class='object-contain object-center mx-auto max-h-[96vh]' src={props.url} alt={props.name} />
}

const TextPanel: Component<any> = props => {
  return (
    <section class='overflow-y-scroll text-left justify-normal'>
      <pre class='mx-auto break-words whitespace-pre-wrap'>{props.text}</pre>
    </section>
  )
}

const HTMLPanel: Component<any> = props => {
  let frame: HTMLIFrameElement
  const onLoad = () => {
    frame.contentDocument.addEventListener('click', toggleHeader)
  }
  return <iframe ref={frame} srcdoc={props.html} height='100%' width='100%' onLoad={onLoad}></iframe>
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
  if (mime.startsWith('text/html')) {
    // 默认.mhtml已经转换成了html
    return () => <HTMLPanel html={file.blobText()} />
  }

  if (mime.startsWith('image/')) {
    return () => <ImagePanel url={file.url} name={file.name} />
  } else if (mime.startsWith('text/') || config.extOfText.has(file.ext().toLowerCase())) {
    return () => <TextPanel text={file.blobText()} />
  }
  return () => <p class='text-2xl'>该文件暂不支持浏览: {file.toString()}</p>
}

const Comp: Component<{hidden?: boolean}> = (props) => {
  const { store, setStore } = neoStore
  const maxSize = config.maxFileSize
  let panel: HTMLElement
  onMount(() => {
    TouchEvent.bind(panel, 'slideup', () => setStore('nextStep', () => -1))
    TouchEvent.bind(panel, 'slidedown', () => setStore('nextStep', () => 1))
  })
  const [blob] = createResource(() => store.currentFile, requests.getBlob)
  const [blobText] = createResource(blob, async b => {
    const size = formatBytes(b.size, maxSize.scale)
    if (!b.type.startsWith('text/') && size.value>maxSize.value) {
      return `[oversize file ${formatBytes(b.size).show()}/${maxSize.show()} for blob.text()]`
    }
    return await b.text()
  })
  const file = new NoeFile()
  createEffect(() => {
    file.update(store.currentFile)
    file.url = requests.constructFileURL(file)
  })
  file.blob = blob
  file.blobText = blobText

  return (
    <section id='dataPanel' ref={panel} classList={{ hidden: props.hidden }} class='w-full h-full text-center' onClick={toggleHeader}>
      <Show when={hasHeader()}>
        <header class='text-sm text-grey-600 absolute top-0 py-2 px-1 w-full h-1/6 bg-rose-100' onClick={() => setHasHeader(false)}>
          <a href={file.url} download={ file.name }>{ file.name }</a>
          <p class='text-xs py-2'>{formatBytes(file.size).show()} {file.mime()}</p>
          {/* <p class='text-xs py-2'>{Object.values(formatBytes(file.size)).join('')} {blob()?.type}</p> */}
        </header>
      </Show>

      <div class='flex flex-col h-full justify-center overflow-y-scroll'>
        {/* 套一层show，防止blob未解析时报错 */}
        <p class='text-2xl w-full absolute text-center'>{blob.loading && 'Loading...'}</p>
        <Show when={file.mime()}>
          {/* 依赖 Show when 和 响应式函数共同追踪文件选择状态 */}
          <Dynamic component={showPanels(file)} />
        </Show>
        {/* 调用 URL.revokeObjectURL(url) 方法，从内部映射中删除引用，从而允许删除 Blob（如果没有其他引用），并释放内存 */}
      </div>
    </section>
  )
}

export default Comp

// https://www.solidjs.com/tutorial/flow_show
import type { Component } from 'solid-js'
import { createMemo, createResource, Show, createSignal } from 'solid-js'
import { onMount } from 'solid-js'
import { Dynamic } from 'solid-js/web'

import neoStore from '../store'
import { getBlob } from '../requests'
import { formatBytes } from '../utils/format'
import TouchEvent from '../utils/touch'


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
  // https://github.com/msindwan/mhtml2html/tree/master
  return (
    // <section class='overflow-y-scroll w-full text-left justify-normal'>
    //   {props.url}
      // {/* <iframe src={props.url} srcdoc={props.text}></iframe> */}
      <iframe srcdoc={props.text} height='100%' width='100%'></iframe>
    // </section>
  )
}

const Comp: Component<{hidden?: boolean}> = (props) => {
  const { store, setStore } = neoStore
  const [blob] = createResource(() => store.currentFile, getBlob)
  const blobURL = createMemo(() => URL.createObjectURL(new Blob([blob()])))
  const [blobText] = createResource(() => blob(), async b => await b.text())
  const dataType = createMemo(() => blob()?.type.split('/')[0])

  const options = {
    image: () => <ImagePanel url={blobURL()} name={store.currentFile.name} />,
    text: () => <TextPanel text={blobText()} />,
    application: () => <TextPanel text={blobText()} />,
    // application: () => <HTMLPanel text={blobText()} />,
  }
  const PanelFallback = <p class='text-2xl'>暂不支持的类型: {dataType()}</p>

  let panel: HTMLElement
  onMount(() => {
    TouchEvent.bind(panel, 'slideup', () => setStore('nextStep', () => -1))
    TouchEvent.bind(panel, 'slidedown', () => setStore('nextStep', () => 1))
  })

  const [hasHeader, setHasHeader] = createSignal(false)
  const toggleHeader = (e: MouseEvent) => {
    if (e.y > 60) {
      return
    }
    setHasHeader(v => !v)
  }

  return (
    <section id='dataPanel' ref={panel} classList={{ hidden: props.hidden }} class='w-full h-full text-center' onClick={toggleHeader}>
      <Show when={hasHeader()}>
        <header class='text-sm text-grey-600 absolute top-0 py-2 px-1 w-full bg-rose-100' onClick={() => setHasHeader(false)}>
          <a href={blobURL()} download={ store.currentFile.name }>{ store.currentFile.name }</a>
          <p class='text-xs py-2'>{Object.values(formatBytes(store.currentFile.size)).join('')} {blob()?.type}</p>
        </header>
      </Show>

      <div class='flex flex-col h-full justify-center overflow-y-scroll'>
        {/* 套一层show，防止blob未解析时报错 */}
        <Show when={blob() && dataType() in options} fallback={PanelFallback}>
          <Dynamic component={options[dataType()]} />
        </Show>
        {/* 调用 URL.revokeObjectURL(url) 方法，从内部映射中删除引用，从而允许删除 Blob（如果没有其他引用），并释放内存 */}
      </div>
    </section>
  )
}

export default Comp

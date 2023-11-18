// https://www.solidjs.com/tutorial/flow_show
import type { Component } from 'solid-js'
import { createMemo, createResource, Show } from "solid-js"
import { Dynamic } from "solid-js/web"
import neoStore from "../store"
import { getFile } from '../api'

const ImagePanel: Component<any> = props => {
  return <img class="object-contain object-center mx-auto max-h-full" src={props.url} alt={props.name} />
}

const TextPanel: Component<any> = props => {
  return (
    <section class='max-h-full overflow-y-scroll text-left justify-normal py-3'>
      <pre class="mx-auto break-words whitespace-pre-wrap">{props.text}</pre>
    </section>
  )
}

const Comp: Component = () => {
  const { store } = neoStore
  const [blob] = createResource(() => store.currentItem, getFile)
  const blobURL = createMemo(() => URL.createObjectURL(new Blob([blob()])))
  const [blobText] = createResource(() => blob(), async b => await b.text())
  const dataType = createMemo(() => blob()?.type.split('/')[0])
  const options = {
    image: () => <ImagePanel url={blobURL()} name={store.currentItem} />,
    text: () => <TextPanel text={blobText()} />,
    application: () => <TextPanel text={blobText()} />,
  }
  const PanelFallback = <p class='text-2xl'>暂不支持的类型: {dataType()}</p>

  return (
    <main class='max-w-[80%] flex flex-col h-full flex-grow text-center'>
      <p class="text-base h-[3%] text-green-700 overflow-x-hidden whitespace-nowrap">
        <a href={blobURL()} download={ store.currentItem }>"{ store.currentItem }"</a>
        <span class='ml-2'>{blob()?.type}</span>
      </p>

      <div class="h-[97%] flex flex-col justify-center">
        {/* 套一层show，防止blob未解析时报错 */}
        <Show when={blob() && dataType() in options} fallback={PanelFallback}>
          <Dynamic component={options[dataType()]} />
        </Show>
        {/* 调用 URL.revokeObjectURL(url) 方法，从内部映射中删除引用，从而允许删除 Blob（如果没有其他引用），并释放内存 */}
      </div>
    </main>
  )
}

export default Comp

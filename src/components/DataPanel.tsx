// https://www.solidjs.com/tutorial/flow_show
import type { Component } from 'solid-js'
import { createMemo, createResource, Show } from "solid-js"
import { Dynamic } from "solid-js/web"
import neoStore from "../store"
import { getFile } from '../api'

const Comp: Component = () => {
  const { store } = neoStore
  const [blob] = createResource(() => store.currentItem, getFile)
  const blobURL = createMemo(() => URL.createObjectURL(new Blob([blob()])))
  const dataType = createMemo(() => blob()?.type.split('/')[0])

  const ImagePanel = () => <div>
    <img class="object-contain object-center mx-auto" src={blobURL()} alt={store.currentItem} />
  </div>
  const options = {
    image: ImagePanel,
  }
  const PanelFallback = <div>
    <p>暂不支持的类型: {dataType()}</p>
  </div>

  return (
    <section class='flex-grow text-center'>
      <div class="text-xl h-1/10 text-green-700">
        <a href={blobURL()} download={ store.currentItem }>"{ store.currentItem }"</a>
        <span class='ml-2'>{blob()?.type}</span>
      </div>

      <div class="panel h-9/10">
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

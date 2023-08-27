import type { Component } from 'solid-js'
import { createSignal } from "solid-js"

const [hidden, setHidden] = createSignal(true);
const [title, setTitle] = createSignal('title');
const [content, setContent] = createSignal('content');

export enum Type {
  success, info, warn, error
}

const bgColors = {
  [Type.success]: 'bg-green-100',
  [Type.info]: 'bg-blue-100',
  [Type.warn]: 'bg-orange-100',
  [Type.error]: 'bg-red-100',
}

export const popup = (title:string, content:string, type:Type) => {
  const box = (document.querySelector('#msg-box') as HTMLElement)
  const lastType = parseInt(box.dataset.type)
  if (lastType > -1) {
    box.classList.remove(bgColors[lastType])
  }
  setTitle(title)
  setContent(content)
  setHidden(false)
  box.classList.add(bgColors[type])
  box.dataset.type = type.toString()
  setTimeout(() => {setHidden(true)}, 5000)
}

const Comp: Component = () => {
  return (
    <div 
      id='msg-box' data-type="-1"
      class="fixed top-[40%] left-[40%] w-[20%] h-[20%] text-center p-4 border-1 z-10 border-gray-200 rounded text-gray-700 shadow-lg"
      classList={{hidden: hidden()}}
      >
      <header class="text-2xl font-semibold flex flex-row justify-end">
        <span class="w-[90%] ml-[5%]">{title()}</span>
        <span class="w-[5%] cursor-pointer" onClick={e => setHidden(true)}>X</span>
      </header>
      <section class="mt-4 break-all">{content()}</section>
    </div>
  )
}

export default Comp

import type { Component } from 'solid-js'
import { createSignal, createResource, Show, For } from "solid-js"
import { Dynamic } from "solid-js/web"

class NoeFile {
  public name: string
  public isFIle: boolean
  public isDirectory: boolean

  constructor(name:string, isFIle:boolean, isDirectory:boolean) {
    this.name = name
    this.isFIle = isFIle
    this.isDirectory = isDirectory
  }

  public static path_join(...paths: string[]) {
    const old_paths = []
    const new_paths = []
    
    paths.forEach(p => {
      old_paths.push(...p.split('/'))
    })
    old_paths.slice(1, ).forEach(p => {
      if (p === '..') {
        const last = new_paths.pop()
        if (!!last) {
          new_paths.push(...last.split('/').slice(0, -1))
        }
      } else if (p.length > 1 && /^[^\\\/:*?"<>|]+$/.test(p)) {
        new_paths.push(p)
      }
    })
    if (/^[A-Za-z]:$/.test(old_paths[0])) {
      new_paths.unshift(`${old_paths[0]}/`)
    }
    return new_paths.join('/')
  }
}

const fileTypes = (obj: NoeFile) => {
  let comp: any
  if (obj.isFIle) {
    comp = <span class='text-green-500 mr-1 select-none'>F</span>
  } else if (obj.isDirectory) {
    comp = <span class='text-orange-400 mr-1 select-none'>D</span>
  } else {
    comp = <span class='text-gray-600 mr-1 select-none'>U</span>
  }
  return () => comp
}

const Comp: Component = () => {
  const [currentDir, setCurrentDir] = createSignal('C:/')
  const parentDir = new NoeFile('..', false, true)
  const listDir = async (dir: string) => {
    // console.log('dir :>> ', dir)
    let res = await (await fetch(`$api/list?dir=${dir}`)).json()
    // console.log('object :>> ', res[1].name, res[1].isDirectory, Object.keys(res[1]))
    res = res.map((item: any) => new NoeFile(item.name, item.isFIle, item.isDirectory))
    res.unshift(parentDir)
    return res
  }
  const [files, fileAction] = createResource(currentDir, listDir)
  const clickItem = (obj: NoeFile) => {
    if (obj.isDirectory) {
      setCurrentDir(NoeFile.path_join(currentDir(), obj.name))
    } else if (obj.isFIle) {
      // open file
    }
  }

  return (
    <aside class='flex flex-col border mx-2 my-2 px-2 w-[20%] min-h-screen'>
      <section class='flex flex-row'>
        <input
          //  flex-grow 属性决定了子容器要占用父容器多少剩余空间
          class='flex-grow border-b outline-none w-[5%] mr-2'
          value={currentDir()}
          onChange={e => setCurrentDir(e.currentTarget.value)}
        />
        <button class='hover:text-green-700' onClick={e => clickItem(parentDir)}>↑</button>
        <button class='hover:text-green-700' onClick={fileAction.refetch}>〇</button>
      </section>
      <section>
        <For each={files()}>{(file, i) =>
          <p>
            <Dynamic component={fileTypes(file)} />
            <span class='hover:cursor-pointer' onClick={e => clickItem(file)}>{file.name}</span>
          </p>
        }</For>
      </section>
    </aside>
  )
}

export default Comp

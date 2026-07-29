import type { Component } from 'solid-js'
import { For, Show, createSignal } from 'solid-js'
import * as MsgBox from './MessageBox.tsx'
import computerStore, { type Computer } from '../utils/computers.ts'

interface MyComputersProps {
  hidden?: boolean
  onSelect: (url: string) => void
}

const { sortedComputers, addOrUpdateComputer, removeComputer } = computerStore

const MyComputers: Component<MyComputersProps> = (props) => {
  const [editing, setEditing] = createSignal<Computer | null>(null)
  const [newName, setNewName] = createSignal('')
  const [newUrl, setNewUrl] = createSignal('')
  const [newRemark, setNewRemark] = createSignal('')

  const resetForm = () => {
    setEditing(null)
    setNewName('')
    setNewUrl('')
    setNewRemark('')
  }

  const handleSubmit = () => {
    const name = newName().trim()
    const url = newUrl().trim()
    if (!name || !url) {
      MsgBox.popup('error', '名称和地址必填', MsgBox.Type.error)
      return
    }
    // 简单补全协议，避免用户只填 host:port 时跳转失败
    const normalized = /^https?:\/\//i.test(url) ? url : `http://${url}`
    addOrUpdateComputer({
      name,
      url: normalized,
      remark: newRemark().trim() || undefined,
    })
    resetForm()
  }

  const handleEdit = (comp: Computer) => {
    setEditing(comp)
    setNewName(comp.name)
    setNewUrl(comp.url)
    setNewRemark(comp.remark || '')
  }

  const handleRemove = (id: string) => {
    if (!confirm('确定删除这个电脑书签？')) return
    removeComputer(id)
    if (editing()?.id === id) resetForm()
  }

  return (
    <div class='flex flex-col h-full p-4 bg-gray-50' classList={{ hidden: props.hidden }}>
      <h2 class='text-xl font-bold mb-4'>我的电脑</h2>

      <div class='flex flex-col sm:flex-row gap-2 mb-4'>
        <input
          type='text'
          placeholder='电脑名称'
          value={newName()}
          onInput={(e) => setNewName(e.currentTarget.value)}
          class='flex-1 px-3 py-2 border rounded focus:outline-none focus:border-blue-500'
        />
        <input
          type='text'
          placeholder='地址 (http://host:port/index)'
          value={newUrl()}
          onInput={(e) => setNewUrl(e.currentTarget.value)}
          class='flex-2 px-3 py-2 border rounded focus:outline-none focus:border-blue-500'
        />
        <input
          type='text'
          placeholder='备注（可选）'
          value={newRemark()}
          onInput={(e) => setNewRemark(e.currentTarget.value)}
          class='flex-1 px-3 py-2 border rounded focus:outline-none focus:border-blue-500'
        />
        <button
          onClick={handleSubmit}
          class='px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700 transition-colors'
        >
          {editing() ? '保存' : '添加'}
        </button>
        <Show when={editing()}>
          <button
            onClick={resetForm}
            class='px-4 py-2 bg-gray-300 text-gray-700 rounded hover:bg-gray-400 transition-colors'
          >
            取消
          </button>
        </Show>
      </div>

      <div class='flex-1 overflow-auto'>
        <Show
          when={sortedComputers().length > 0}
          fallback={<p class='text-sm text-gray-500 text-center mt-8'>还没有电脑书签，先添加一台吧</p>}
        >
          <For each={sortedComputers()}>
            {(comp) => (
              <div class='flex items-center justify-between gap-3 p-3 bg-white rounded shadow mb-2 hover:bg-gray-50 transition-colors'>
                <button
                  class='flex-1 text-left min-w-0'
                  onClick={() => props.onSelect(comp.url)}
                  title='点击跳转到该电脑'
                >
                  <div class='font-medium text-gray-900 truncate'>{comp.name}</div>
                  <div class='text-sm text-gray-600 truncate'>{comp.url}</div>
                  <Show when={comp.remark}>
                    <div class='text-xs text-gray-500 mt-1 truncate'>{comp.remark}</div>
                  </Show>
                </button>
                <div class='flex gap-2 shrink-0'>
                  <button
                    onClick={() => props.onSelect(comp.url)}
                    class='px-3 py-1 bg-green-600 text-white text-sm rounded hover:bg-green-700 transition-colors'
                  >
                    打开
                  </button>
                  <button
                    onClick={() => handleEdit(comp)}
                    class='px-3 py-1 bg-blue-600 text-white text-sm rounded hover:bg-blue-700 transition-colors'
                  >
                    编辑
                  </button>
                  <button
                    onClick={() => handleRemove(comp.id)}
                    class='px-3 py-1 bg-red-600 text-white text-sm rounded hover:bg-red-700 transition-colors'
                  >
                    删除
                  </button>
                </div>
              </div>
            )}
          </For>
        </Show>
      </div>

      <div class='mt-4 text-xs text-gray-500 text-center'>
        提示：可把各网段 IP 都加进来；同一台电脑用不同名称区分（如「书房-内网」「书房-Tailscale」）。
      </div>
    </div>
  )
}

export default MyComputers

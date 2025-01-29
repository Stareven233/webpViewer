import type { Component } from 'solid-js'
import { createSignal, createMemo } from 'solid-js'
import neoStore from '../store.ts'
import { uploadFile } from '../requests.ts'

const Comp: Component<{hidden?: boolean}> = (props) => {
  const [file, setFile] = createSignal<File | null>(null)
  const fileInputRef = createMemo(() => document.querySelector<HTMLInputElement>('#fileInput'))

  const handleFileChange = (event: Event) => {
    const target = event.target as HTMLInputElement
    if (target.files && target.files.length > 0) {
      setFile(target.files[0])
    }
  }

  const handleUpload = async () => {
    if (file()) {
      const dir = neoStore.store.currentDir
      const formData = new FormData()
      formData.append('file', file()!)
      try {
        await uploadFile(dir, formData)
        setFile(null)
        alert('File uploaded successfully!')
      } catch (error) {
        console.error('Error uploading file:', error)
        alert(`Failed to upload file: ${error}`)
      }
    }
  }

  return (
    <div classList={{ hidden: props.hidden }}>
      <input id="fileInput" type="file" onChange={handleFileChange} />
      <button
        class="rounded-full w-10 h-10 bg-blue-500 text-white flex items-center justify-center"
        onClick={() => fileInputRef().click()}
      >
        +
      </button>
      {file() && (
        <button
          class="mt-2 rounded-full w-10 h-10 bg-green-500 text-white flex items-center justify-center"
          onClick={handleUpload}
        >
          ⬆️
        </button>
      )}
    </div>
  )
}

export default Comp

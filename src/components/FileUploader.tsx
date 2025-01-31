import type { Component } from 'solid-js'
import neoStore from '../store.ts'
import { uploadFile } from '../requests.ts'
import * as MsgBox from './MessageBox.tsx'


const Comp: Component = () => {
  const handleFileChange = async (event: Event) => {
    const target = event.target as HTMLInputElement
    if (!target.files || target.files.length <= 0) {
      return
    }
    const { store } = neoStore
    const formData = new FormData()
    formData.append('file', target.files[0])
    try {
      await uploadFile(store.currentDir, formData)
      MsgBox.popup('success', 'File uploaded successfully!', MsgBox.Type.success)
    } catch (error) {
      console.error('Uploading file:', error)
      MsgBox.popup('fail', `Failed to upload file: ${error}`, MsgBox.Type.error)
    }
  }

  return (
    <div 
      class='fixed right-[5%] bottom-[5%] w-16 h-16 rounded-full bg-orange-400 text-4xl text-white flex items-center justify-center z-10 hover:cursor-pointer hover:bg-green-500'
      onClick={() => document.getElementById('fileInput')?.click()}
      >
      +
      <input id="fileInput" type="file" onChange={handleFileChange} hidden />
    </div>
  )
}

export default Comp

import type { Component } from 'solid-js'
import neoStore from '../store.ts'
import { uploadFile } from '../requests.ts'
import * as MsgBox from './MessageBox.tsx'
import { formatDate } from '../utils/format.ts'


const Comp: Component = () => {
  let textModal: HTMLDialogElement | undefined
  let fileNameInput: HTMLInputElement | undefined
  let fileExtensionInput: HTMLInputElement | undefined
  let fileContentTextarea: HTMLTextAreaElement | undefined

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

  const createTextFile = async () => {
    if (!fileNameInput || !fileContentTextarea) {
      return
    }

    const fileName = fileNameInput.value
    const fileExtension = fileExtensionInput.value
    const fileContent = fileContentTextarea.value

    if (!fileName) {
      MsgBox.popup('error', 'Please enter a file name', MsgBox.Type.error)
      return
    }

    const fullFileName = fileExtension ? `${fileName}.${fileExtension.replace(/^\./, '')}` : fileName

    try {
      const { store } = neoStore
      const blob = new Blob([fileContent], { type: 'text/plain' })
      const formData = new FormData()
      formData.append('file', blob, fullFileName)

      await uploadFile(store.currentDir, formData)
      MsgBox.popup('success', 'Text file created successfully!', MsgBox.Type.success)

      // Close modal and reset form
      textModal?.close()
    } catch (error) {
      console.error('Creating text file:', error)
      MsgBox.popup('fail', `Failed to create text file: ${error}`, MsgBox.Type.error)
    }
  }

  const showTextModal = () => {
    fileNameInput.value = `webpviewer@${formatDate()}`
    fileContentTextarea.value = ''
    fileExtensionInput.value = 'txt'
    textModal?.showModal()
  }

  return (
    <>
      <div class="fixed right-[5%] bottom-[5%] flex flex-col gap-2">
        <div
          class='size-16 rounded-full bg-[#ff9e61] text-3xl text-white flex items-center justify-center z-10 hover:cursor-pointer hover:bg-green-500'
          onClick={() => document.getElementById('fileInput')?.click()}
        >
          +
          <input id="fileInput" type="file" onChange={handleFileChange} hidden />
        </div>

        <div
          class='size-16 rounded-full bg-[#ff7361] text-3xl text-white flex items-center justify-center z-10 hover:cursor-pointer hover:bg-green-500'
          onClick={showTextModal}
        >
          T
        </div>
      </div>

      <dialog ref={textModal} class="fixed w-full md:w-5/12 top-1/2 left-1/2 transform -translate-x-1/2 -translate-y-1/2">
        <div class="bg-white rounded-lg shadow-xl p-5 w-full">
          <h3 class="font-bold text-lg mb-4">Create New File</h3>
          <div class="mb-4">
            <label class="block text-gray-700 text-sm font-bold mb-2">
              File Name
            </label>
            <div class="flex gap-2">
              <input
                type="text"
                placeholder="Enter file name"
                class="shadow appearance-none border rounded w-5/6 py-2 px-3 text-gray-700 leading-tight focus:outline-none focus:shadow-outline"
                ref={fileNameInput}
              />
              <span class="flex items-end pb-1">.</span>
              <input
                type="text"
                placeholder="Extension"
                class="shadow appearance-none border rounded w-1/6 py-2 px-3 text-gray-700 leading-tight focus:outline-none focus:shadow-outline"
                ref={fileExtensionInput}
              />
            </div>
          </div>
          <div class="mb-4">
            <label class="block text-gray-700 text-sm font-bold mb-2">
              File Content
            </label>
            <textarea
              placeholder="Enter file content"
              autofocus
              class="shadow appearance-none border rounded w-full py-2 px-3 text-gray-700 leading-tight focus:outline-none focus:shadow-outline h-60"
              ref={fileContentTextarea}
            ></textarea>
          </div>
          <div class="flex justify-end space-x-2">
            <button
              class="bg-green-500 hover:bg-green-700 text-white font-bold py-2 px-4 rounded focus:outline-none focus:shadow-outline"
              onClick={createTextFile}
            >
              Create
            </button>
            <button
              class="bg-gray-500 hover:bg-gray-700 text-white font-bold py-2 px-4 rounded focus:outline-none focus:shadow-outline"
              onClick={() => textModal?.close()}
            >
              Cancel
            </button>
          </div>
        </div>
      </dialog>
    </>
  )
}

export default Comp

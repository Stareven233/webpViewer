import { Setter } from 'solid-js'
import type { NoeFile } from './format.ts'


const copy = async (text: string): Promise<boolean> =>  {
  // 检查 Clipboard API 是否可用
  if (typeof navigator.clipboard !== 'undefined' && navigator.clipboard.writeText) {
    // 使用 Clipboard API 复制内容
    await navigator.clipboard.writeText(text)
    return true
  }

  // 备选方案：使用传统的 textarea 和 document.execCommand
  const textarea = document.createElement('textarea')
  textarea.value = text
  textarea.setAttribute('readonly', '')
  textarea.style.position = 'absolute'
  textarea.style.left = '-9999px'
  document.body.appendChild(textarea)

  const isiOS = /ipad|iphone/i.test(navigator.userAgent)
  if (isiOS) {
    // iOS特殊处理
    const range = document.createRange()
    range.selectNodeContents(textarea)
    const selection = window.getSelection()
    if (selection) {
      selection.removeAllRanges()
      selection.addRange(range)
      textarea.setSelectionRange(0, 999999)
    }
  } else {
    textarea.select()
  }

  const success = document.execCommand('copy')
  document.body.removeChild(textarea)
  if (success) {
    return true
  }
  return false
}

export const copyFileToClipboard = async (file: NoeFile): Promise<string> => {
  try {
    let contentToCopy = ''
    // 根据文件类型决定复制的内容
    if (file.blobText && typeof file.blobText() === 'string') {
      // 如果是文本内容，直接复制文本
      contentToCopy = file.blobText()
    } else if (file.url) {
      // 如果是文件 URL，则复制 URL
      contentToCopy = file.url
    } else {
      // 其他情况提示无法复制
      return '无法复制该类型文件'
    }
    const success = await copy(contentToCopy)
    return success? '已复制!' : '复制失败!'
  } catch (err) {
    console.error('[copyFileToClipboard] 无法复制: ', err)
    return `复制失败: ${err instanceof Error ? err.message : String(err)}`
  }
}

/* @refresh reload */
import './index.css'
import { render } from 'solid-js/web'

import App from './App.tsx'

const root = document.getElementById('root')
root.classList.add('h-full')

if (import.meta.env.DEV && !(root instanceof HTMLElement)) {
  throw new Error(
    'Root element not found. Did you forget to add it to your index.html? Or maybe the id attribute got mispelled?',
  )
}

render(() => <App />, root!)

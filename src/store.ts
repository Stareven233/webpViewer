import { createRoot } from "solid-js";
import { createStore } from "solid-js/store";

function _createStore() {
  const [store, setStore] = createStore({ 
    currentDir: 'D:/',
    currentItem: '',
  })
  return {store, setStore}
}

export default createRoot(_createStore);

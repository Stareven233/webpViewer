import type { JSX } from 'solid-js'


export default (name: string) => {
  let comp: JSX.Element
  switch (name) {
    case 'back':
      comp = <svg xmlns="http://www.w3.org/2000/svg" width="32" height="32" viewBox="0 0 24 24"><g fill="none"><path d="M24 0v24H0V0zM12.593 23.258l-.011.002l-.071.035l-.02.004l-.014-.004l-.071-.035q-.016-.005-.024.005l-.004.01l-.017.428l.005.02l.01.013l.104.074l.015.004l.012-.004l.104-.074l.012-.016l.004-.017l-.017-.427q-.004-.016-.017-.018m.265-.113l-.013.002l-.185.093l-.01.01l-.003.011l.018.43l.005.012l.008.007l.201.093q.019.005.029-.008l.004-.014l-.034-.614q-.005-.019-.02-.022m-.715.002a.02.02 0 0 0-.027.006l-.006.014l-.034.614q.001.018.017.024l.015-.002l.201-.093l.01-.008l.004-.011l.017-.43l-.003-.012l-.01-.01z"/><path fill="currentColor" d="M6.046 11.677A7.5 7.5 0 0 1 20 15.5a1 1 0 1 0 2 0A9.5 9.5 0 0 0 4.78 9.963l-.537-3.045a1 1 0 1 0-1.97.347l1.042 5.909a1 1 0 0 0 .412.645a1.1 1.1 0 0 0 .975.125l5.68-1.001a1 1 0 1 0-.347-1.97z"/></g></svg>
      break;
    case 'shuffle':
      comp = <svg xmlns="http://www.w3.org/2000/svg" width="32" height="32" viewBox="0 0 24 24"><g fill="none"><path d="m12.594 23.258l-.012.002l-.071.035l-.02.004l-.014-.004l-.071-.036q-.016-.004-.024.006l-.004.01l-.017.428l.005.02l.01.013l.104.074l.015.004l.012-.004l.104-.074l.012-.016l.004-.017l-.017-.427q-.004-.016-.016-.018m.264-.113l-.014.002l-.184.093l-.01.01l-.003.011l.018.43l.005.012l.008.008l.201.092q.019.005.029-.008l.004-.014l-.034-.614q-.005-.019-.02-.022m-.715.002a.02.02 0 0 0-.027.006l-.006.014l-.034.614q.001.018.017.024l.015-.002l.201-.093l.01-.008l.003-.011l.018-.43l-.003-.012l-.01-.01z"/><path fill="currentColor" d="M6.301 6a4 4 0 0 1 3.312 1.756l.118.186l4.253 7.087a2 2 0 0 0 1.553.965L15.7 16h1.194l.02-.415l.022-.36l.012-.159c.027-.346.352-.557.631-.41l.306.164l.36.203l.198.117l.43.263l.229.147l.463.31l.21.147l.377.273l.315.24l.133.104c.236.188.225.566-.023.762l-.28.217l-.34.252l-.4.282l-.456.305l-.462.291l-.416.249l-.365.205l-.307.165c-.275.143-.572-.036-.598-.36l-.025-.347l-.024-.415l-.01-.23H15.7a4 4 0 0 1-3.312-1.756l-.118-.186l-4.253-7.087a2 2 0 0 0-1.553-.965L6.3 8H4a1 1 0 0 1-.117-1.993L4 6zm3.714 7.643a1 1 0 0 1 .342 1.371l-.626 1.044A4 4 0 0 1 6.301 18H4a1 1 0 1 1 0-2h2.301a2 2 0 0 0 1.715-.971l.627-1.043a1 1 0 0 1 1.371-.344Zm7.563-8.988l.306.165l.36.203l.198.117l.43.263l.229.147l.463.31l.21.147l.377.273l.315.24l.133.104c.236.188.225.566-.023.762l-.28.217l-.34.252q-.186.135-.4.282l-.456.305l-.462.291l-.416.249l-.365.206l-.307.164c-.275.143-.572-.036-.598-.36l-.025-.347l-.024-.415l-.01-.23H15.7a2 2 0 0 0-1.627.836l-.088.135l-.626 1.043a1 1 0 0 1-1.77-.925l.055-.104l.626-1.043a4 4 0 0 1 3.209-1.936l.22-.006h1.195l.02-.415l.022-.36l.012-.159c.027-.346.352-.557.631-.41Z"/></g></svg>
      break;
    case 'refresh':
      comp = <svg xmlns="http://www.w3.org/2000/svg" width="32" height="32" viewBox="0 0 24 24"><g fill="none"><path d="m12.593 23.258l-.011.002l-.071.035l-.02.004l-.014-.004l-.071-.035q-.016-.005-.024.005l-.004.01l-.017.428l.005.02l.01.013l.104.074l.015.004l.012-.004l.104-.074l.012-.016l.004-.017l-.017-.427q-.004-.016-.017-.018m.265-.113l-.013.002l-.185.093l-.01.01l-.003.011l.018.43l.005.012l.008.007l.201.093q.019.005.029-.008l.004-.014l-.034-.614q-.005-.018-.02-.022m-.715.002a.02.02 0 0 0-.027.006l-.006.014l-.034.614q.001.018.017.024l.015-.002l.201-.093l.01-.008l.004-.011l.017-.43l-.003-.012l-.01-.01z"/><path fill="currentColor" d="M2 12.08c-.006-.862.91-1.356 1.618-.975l.095.058l2.678 1.804c.972.655.377 2.143-.734 2.007l-.117-.02l-1.063-.234a8.002 8.002 0 0 0 14.804.605a1 1 0 0 1 1.82.828c-1.987 4.37-6.896 6.793-11.687 5.509A10 10 0 0 1 2 12.08m.903-4.228C4.89 3.482 9.799 1.06 14.59 2.343a10 10 0 0 1 7.414 9.581c.007.863-.91 1.358-1.617.976l-.096-.058l-2.678-1.804c-.972-.655-.377-2.143.734-2.007l.117.02l1.063.234A8.002 8.002 0 0 0 4.723 8.68a1 1 0 1 1-1.82-.828"/></g></svg>
      break;
    default:
      break;
  }
  return () => comp
}

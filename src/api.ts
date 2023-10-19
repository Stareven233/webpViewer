// 开发服务器 (serve 命令) 运行在 development （开发）模式，而 build 命令运行在 production （生产）模式
// 通过前缀开控制生产环境下不启用 server.proxy
const prefix = import.meta.env.DEV? '$api': ''

export const listDir = async (dir: string) => (await fetch(`${prefix}/list?dir=${encodeURIComponent(dir)}`)).json();

// export const getFile = async (path: string) => await fetch(`${prefix}/pwd/${path}`)
export const getFile = async (filename: string) => {
  let blob: Blob;
  if(filename.length === 0) {
    blob = new Blob(['no file selected'], {type: 'text/plain'});
  } else {
    // encode以避免#%等符号出现在文件名导致的问题，express默认进行decode
    const url = `${prefix}/pwd/${encodeURIComponent(filename)}`
    blob = await (await fetch(url)).blob();
  }
  // console.log(filename, blob.type)
  return blob
};

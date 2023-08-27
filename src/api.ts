export const listDir = async (dir: string) => (await fetch(`$api/list?dir=${dir}`)).json();

// export const getFile = async (path: string) => await fetch(`$api/pwd/${path}`)
export const getFile = async (filename: string) => {
  let blob: Blob;
  if(filename.length === 0) {
    blob = new Blob(['no file selected'], {type: 'text/plain'});
  } else {
    // encode以避免#%等符号出现在文件名导致的问题，express默认进行decode
    const url = `$api/pwd/${encodeURIComponent(filename)}`
    blob = await (await fetch(url)).blob();
  }
  console.log(filename, blob.type)
  return blob
};

## webpViewer
原意是有不少图片是webp格式，windows无法直接查看，每次一张张用浏览器打开很麻烦，就想整一个能快捷翻页的js脚本

结果写着写着用上了express，支持了其他图片格式，也加了一些快捷键，目前虽然不美观，使用也比较繁琐，但好歹能用，算是达成目的了Ψ(￣∀￣)Ψ

## use
1. git clone
2. cd webpViewer
3. pnpm i
4. 修改 webpViewer.ps1 里面index.js的路径
5. 将webpViewer.ps1放到图片父文件夹
6. 运行 webpViewer.ps1
7. 在网页中选择包含图片的子文件夹
8. 4~6也可忽略，手动开启express

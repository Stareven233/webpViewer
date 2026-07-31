import fs from 'node:fs/promises'
import { execFile } from 'node:child_process'
import { promisify } from 'node:util'
import path from 'node:path'
import { defineConfig } from 'vite'
import solidPlugin from 'vite-plugin-solid'
import tailwindcss from '@tailwindcss/vite'

const execFilePromise = promisify(execFile)

const newProxyItem = ([key, target]: string[]) => ({
  // 匹配 */$key/**
  [`/\$${key}`]: {
    target,
    changeOrigin: true,
    rewrite: (path: string) => path.replace(/^\/\$\w+/, '')
  }
})

export default defineConfig({
  base: '/index',
  plugins: [
    solidPlugin(),
    tailwindcss(),
    {
      name: 'inject-version',
      async closeBundle() {
        const pkg = JSON.parse(await fs.readFile(path.resolve(__dirname, 'package.json'), 'utf8'))
        const versionJson = {
          name: pkg.name,
          version: pkg.version,
          author: pkg.author,
          buildTime: new Date().toISOString(),
        }
        const distPath = path.resolve(__dirname, 'dist')
        const distFile = (name: string) => path.join(distPath, name)
        await fs.writeFile(distFile('version.json'), JSON.stringify(versionJson, null, 2))
        // Go 会根据构建主机生成原生可执行文件；发布目录也使用对应平台的名称。
        // 显式指定 -o 可避免 Linux 依赖 Windows 的 .exe 文件名。
        const serverBinaryName = process.platform === 'win32' ? 'server.exe' : 'server'
        const serverDirectory = path.resolve(__dirname, 'server/v3')
        const serverPath = distFile(serverBinaryName)
        console.log(`building ${serverBinaryName}...`)
        await execFilePromise('go', ['build', '-o', serverPath, '.'], { cwd: serverDirectory })
        // Linux 的发布包需要保留可执行位，防止解压后无法直接运行 ./server。
        if (process.platform !== 'win32') {
          await fs.chmod(serverPath, 0o755)
        }
        await fs.copyFile(path.join(serverDirectory, 'config.yaml'), distFile('config.yaml'))
        console.log('\n✅ Info and config written to:', distPath)
      }
    },
  ],
  build: {
    target: 'esnext',
  },
  server: {
    host: true,
    port: 6628,
    cors: true,
    proxy: Object.assign({}, ...[
      ['api', 'http://localhost:4412'],
    ].map(newProxyItem))
  }
})

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
        console.log('building server...')
        await execFilePromise('go', ['build', '.'], { cwd: './server/v3', })
        console.log('copying files...')
        const serverFile = (name: string) => path.resolve(__dirname, 'server/v3', name)
        await fs.copyFile(serverFile('server-v3.exe'), distFile('server.exe'))
        await fs.copyFile(serverFile('config.yaml'), distFile('config.yaml'))
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

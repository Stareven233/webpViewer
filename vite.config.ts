import fs from 'fs'
import path from 'path'
import { defineConfig } from 'vite'
import solidPlugin from 'vite-plugin-solid'
import tailwindcss from '@tailwindcss/vite'

const pkg = JSON.parse(fs.readFileSync(path.resolve(__dirname, 'package.json'), 'utf8'))

const newProxyItem = ([key, target]) => ({
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
      closeBundle() {
        const versionJson = {
          name: pkg.name,
          version: pkg.version,
          author: pkg.author,
          buildTime: new Date().toISOString(),
        }
        const distPath = path.resolve(__dirname, 'dist/version.json')
        fs.writeFileSync(distPath, JSON.stringify(versionJson, null, 2))
        console.log('\n✅ Version info written to:', distPath)
      }
    },
  ],
  build: {
    target: 'esnext',
  },  
  server:{
    host: true,
    port: 6628,
    cors: true,
    proxy: Object.assign({}, ...[
      ['api', 'http://localhost:4412'],
    ].map(newProxyItem))
  }
})

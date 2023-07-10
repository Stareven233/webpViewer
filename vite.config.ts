import { defineConfig } from 'vite';
import solidPlugin from 'vite-plugin-solid';

const newProxyItem = ([key, target]) => ({
  // 匹配 */$key/**
  [`/\$${key}`]: {
    target,
    changeOrigin: true,
    rewrite: (path: string) => path.replace(/^\/\$\w+/, '')
  }
})

export default defineConfig({
  plugins: [solidPlugin()],
  build: {
    target: 'esnext',
  },  
  server:{
    host: true,
    port: 6628,
    cors: true,
    proxy: Object.assign({}, ...[
      ['api', 'http://172.17.174.111:4412'],
    ].map(newProxyItem))
  }
});

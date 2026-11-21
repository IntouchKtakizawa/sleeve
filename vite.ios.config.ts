import {defineConfig, type Plugin} from 'vite';
import react from '@vitejs/plugin-react';
import {resolve} from 'node:path';
// iOS (Capacitor) build: relative base, no web manifest/service worker, edge-to-edge viewport.
const nativeHtml: Plugin = {name:'sleeve-native-html',transformIndexHtml:html=>html
  .replace('initial-scale=1.0"','initial-scale=1.0, viewport-fit=cover"')
  .replace(/<link rel="(icon|manifest|apple-touch-icon)"[^>]*>/g,'')};
export default defineConfig({root:resolve(import.meta.dirname,'pages'),base:'./',plugins:[react(),nativeHtml],publicDir:false,build:{outDir:resolve(import.meta.dirname,'ios-dist'),emptyOutDir:true}});

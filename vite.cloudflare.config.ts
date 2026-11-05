import vinext from 'vinext';
import {defineConfig} from 'vite';
import {cloudflare} from '@cloudflare/vite-plugin';

// Independent deployment: no Sites plugin, mock identity or ChatGPT connector.
export default defineConfig({plugins:[vinext(), cloudflare({
  configPath:'./wrangler.cloudflare.generated.json',
  viteEnvironment:{name:'rsc',childEnvironments:['ssr']}, inspectorPort:false,
})]});

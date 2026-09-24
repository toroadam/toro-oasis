import {defineConfig,loadEnv} from 'vite';
import {oasisLive} from './server/live.js';
// Live mode reads MIXPANEL_SERVICE_ACCOUNT / MIXPANEL_SERVICE_SECRET from .env.local (never committed).
// PAGES_BASE is set by the Pages workflow (the site lives at /toro-oasis-globe/).
export default defineConfig(({mode})=>{
 const env=loadEnv(mode,process.cwd(),['MIXPANEL_','OASIS_']);process.env.OASIS_INTERNAL_PLACES??=env.OASIS_INTERNAL_PLACES;
 // Keep /*! ... */ licence comments (the MIT notice) in the published bundle.
 return {base:process.env.PAGES_BASE||'/',esbuild:{legalComments:'eof'},plugins:[oasisLive(env,process.cwd())],build:{rollupOptions:{input:{oasis:'index.html'},output:{manualChunks:{three:['three']}}}}};
});

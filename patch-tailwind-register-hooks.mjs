import { readFile, writeFile } from 'node:fs/promises'
import path from 'node:path'

const tailwindNodeDistDir = path.join(process.cwd(), 'node_modules', '@tailwindcss', 'node', 'dist')

const patches = [
  {
    file: path.join(tailwindNodeDistDir, 'index.js'),
    needle:
      'process.versions.bun||_t.register?.((0,Dt.pathToFileURL)(require.resolve("@tailwindcss/node/esm-cache-loader")));',
    replacement:
      'if(!process.versions.bun){let e=require.resolve("@tailwindcss/node/esm-cache-loader"),r=(0,Dt.pathToFileURL)(e).href;if(typeof _t.registerHooks=="function"){_t.registerHooks({resolve:(t,i,o)=>{let l=o(t,i);if(l.url===r||(0,_t.isBuiltin)(l.url)||!i.parentURL)return l;let n=new URL(i.parentURL).searchParams.get("id");if(n===null)return l;let s=new URL(l.url);return s.searchParams.set("id",n),{...l,url:`${s}`}}})}else _t.register?.((0,Dt.pathToFileURL)(e));}'
  },
  {
    file: path.join(tailwindNodeDistDir, 'index.mjs'),
    needle:
      'if(!process.versions.bun){let e=fe.createRequire(import.meta.url);fe.register?.(Xr(e.resolve("@tailwindcss/node/esm-cache-loader")))}',
    replacement:
      'if(!process.versions.bun){let e=fe.createRequire(import.meta.url),r=Xr(e.resolve("@tailwindcss/node/esm-cache-loader")).href;if(typeof fe.registerHooks=="function"){fe.registerHooks({resolve:(t,i,o)=>{let l=o(t,i);if(l.url===r||fe.isBuiltin(l.url)||!i.parentURL)return l;let n=new URL(i.parentURL).searchParams.get("id");if(n===null)return l;let s=new URL(l.url);return s.searchParams.set("id",n),{...l,url:`${s}`}}})}else fe.register?.(Xr(e.resolve("@tailwindcss/node/esm-cache-loader")))}'
  }
]

let patchedCount = 0

for (const patch of patches) {
  let source

  try {
    source = await readFile(patch.file, 'utf8')
  } catch {
    continue
  }

  if (source.includes(patch.replacement)) {
    patchedCount += 1
    continue
  }

  if (!source.includes(patch.needle)) {
    continue
  }

  await writeFile(patch.file, source.replace(patch.needle, patch.replacement))
  patchedCount += 1
}

if (patchedCount > 0) {
  console.log(`Patched Tailwind loader registration in ${patchedCount} file(s).`)
}

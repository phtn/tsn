import * as esbuild from 'esbuild'
import babel from 'esbuild-plugin-babel'
import { execSync } from 'child_process'
import { copyFileSync, existsSync, mkdirSync, readdirSync } from 'fs'
import { join } from 'path'

const isDev = process.argv.includes('--dev')
const distDir = 'dist'

function copyGeistFonts() {
  const fonts = [
    {
      source: 'node_modules/geist/dist/fonts/geist-sans/Geist-Variable.woff2',
      target: join(distDir, 'fonts', 'Geist-Variable.woff2')
    },
    {
      source: 'node_modules/geist/dist/fonts/geist-mono/GeistMono-Variable.woff2',
      target: join(distDir, 'fonts', 'GeistMono-Variable.woff2')
    },
    {
      source: 'node_modules/geist/dist/fonts/geist-pixel/GeistPixel-Square.woff2',
      target: join(distDir, 'fonts', 'GeistPixel-Square.woff2')
    }
  ]

  mkdirSync(join(distDir, 'fonts'), { recursive: true })

  fonts.forEach(({ source, target }) => {
    if (!existsSync(source)) {
      throw new Error(`Missing font asset: ${source}`)
    }

    copyFileSync(source, target)
  })
}

function copySFX() {
  const sfxSrc = 'public/sfx'
  const sfxDest = 'sfx'
  mkdirSync(sfxDest, { recursive: true })
  readdirSync(sfxSrc).forEach((file) => {
    copyFileSync(join(sfxSrc, file), join(sfxDest, file))
  })
}

// Process CSS with PostCSS - output to sidepanel.css to match HTML reference
console.log('Processing CSS with PostCSS...')
try {
  copyGeistFonts()
  copySFX()
  execSync('bunx postcss src/global.css -o dist/sidepanel.css', { stdio: 'inherit' })
} catch (error) {
  console.error('PostCSS processing failed:', error.message)
  process.exit(1)
}

const esbuildOptions = {
  entryPoints: {
    sidepanel: 'src/index.tsx',
    background: 'src/core/background.ts',
    content: 'src/core/content.ts',
    injected: 'src/core/injected.ts'
  },
  bundle: true,
  outdir: 'dist',
  // Allow resolving Tailwind's "style" export for @import "tailwindcss"
  conditions: ['style', 'browser', 'import', 'default'],
  loader: {
    '.png': 'dataurl',
    '.svg': 'text',
    '.css': 'css'
  },
  define: {
    'process.env.NODE_ENV': isDev ? '"development"' : '"production"'
  },
  sourcemap: isDev ? 'inline' : false,
  minify: !isDev,
  plugins: [
    babel({
      // Only run Babel over app source files. Third-party bundles like react-dom
      // should stay on esbuild's path to avoid noisy deopt warnings.
      filter: /src\/.*\.(tsx?|jsx?)$/,
      namespace: ''
    })
  ]
}

if (isDev) {
  const ctx = await esbuild.context(esbuildOptions)
  await ctx.watch()
  console.log('Watching for changes...')
} else {
  await esbuild.build(esbuildOptions).catch((error) => {
    console.error('Build failed:', error.message)
    process.exit(1)
  })
}

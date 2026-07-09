import * as esbuild from 'esbuild'
import babel from 'esbuild-plugin-babel'
import { execSync } from 'child_process'
import { copyFileSync, existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from 'fs'
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
      source: 'node_modules/geist/dist/fonts/geist-pixel/GeistPixel-Circle.woff2',
      target: join(distDir, 'fonts', 'GeistPixel-Circle.woff2')
    },
    {
      source: 'node_modules/geist/dist/fonts/geist-pixel/GeistPixel-Grid.woff2',
      target: join(distDir, 'fonts', 'GeistPixel-Grid.woff2')
    },
    {
      source: 'node_modules/geist/dist/fonts/geist-pixel/GeistPixel-Line.woff2',
      target: join(distDir, 'fonts', 'GeistPixel-Line.woff2')
    },
    {
      source: 'node_modules/geist/dist/fonts/geist-pixel/GeistPixel-Square.woff2',
      target: join(distDir, 'fonts', 'GeistPixel-Square.woff2')
    },
    {
      source: 'node_modules/geist/dist/fonts/geist-pixel/GeistPixel-Triangle.woff2',
      target: join(distDir, 'fonts', 'GeistPixel-Triangle.woff2')
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
  const sfxDest = join(distDir, 'sfx')
  mkdirSync(sfxDest, { recursive: true })
  readdirSync(sfxSrc).forEach((file) => {
    copyFileSync(join(sfxSrc, file), join(sfxDest, file))
  })
}

function copyIcons() {
  const iconsSrc = 'icons'
  const iconsDest = join(distDir, 'icons')
  mkdirSync(iconsDest, { recursive: true })
  readdirSync(iconsSrc).forEach((file) => {
    copyFileSync(join(iconsSrc, file), join(iconsDest, file))
  })
}

function copyPublicFonts() {
  const fontsSrc = 'public/fonts'
  const fontsDest = join(distDir, 'fonts')
  mkdirSync(fontsDest, { recursive: true })
  readdirSync(fontsSrc).forEach((file) => {
    copyFileSync(join(fontsSrc, file), join(fontsDest, file))
  })
}

function writeDistManifest() {
  const manifest = JSON.parse(readFileSync('manifest.json', 'utf8'))
  const stripDistPrefix = (path) => path.replace(/^dist\//, '')

  manifest.content_scripts = manifest.content_scripts?.map((contentScript) => ({
    ...contentScript,
    js: contentScript.js?.map(stripDistPrefix)
  }))
  manifest.background = {
    ...manifest.background,
    service_worker: stripDistPrefix(manifest.background.service_worker)
  }
  manifest.web_accessible_resources = manifest.web_accessible_resources?.map((resource) => ({
    ...resource,
    resources: resource.resources?.map(stripDistPrefix)
  }))

  writeFileSync(join(distDir, 'manifest.json'), `${JSON.stringify(manifest, null, 2)}\n`)
}

function writeDistSidepanel() {
  const sidepanel = readFileSync('sidepanel.html', 'utf8').replaceAll('dist/', '')
  writeFileSync(join(distDir, 'sidepanel.html'), sidepanel)
}

function verifyDistExtension() {
  const manifest = JSON.parse(readFileSync(join(distDir, 'manifest.json'), 'utf8'))
  const referencedFiles = [
    ...(manifest.content_scripts?.flatMap((contentScript) => contentScript.js ?? []) ?? []),
    manifest.background?.service_worker,
    manifest.side_panel?.default_path,
    ...Object.values(manifest.action?.default_icon ?? {}),
    ...Object.values(manifest.icons ?? {}),
    ...(manifest.web_accessible_resources?.flatMap((resource) => resource.resources ?? []) ?? [])
  ].filter((path) => typeof path === 'string')

  const missingFiles = referencedFiles.filter((path) => !existsSync(join(distDir, path)))
  if (missingFiles.length > 0) {
    throw new Error(`Missing dist extension assets: ${missingFiles.join(', ')}`)
  }

  const sidepanel = readFileSync(join(distDir, 'sidepanel.html'), 'utf8')
  for (const asset of ['sidepanel.css', 'sidepanel.js']) {
    if (!sidepanel.includes(`\"${asset}\"`)) {
      throw new Error(`dist/sidepanel.html does not reference ${asset}`)
    }
  }
}

// Process CSS with PostCSS - output to sidepanel.css to match HTML reference
console.log('building...')
try {
  copyGeistFonts()
  copyPublicFonts()
  copySFX()
  copyIcons()
  writeDistManifest()
  writeDistSidepanel()
  execSync('bunx postcss src/global.css -o dist/sidepanel.css', { stdio: 'inherit' })
  console.log('build complete.')
} catch (error) {
  console.error('PostCSS processing failed:', error.message)
  process.exit(1)
} finally {
  console.log('writing outputs...')
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
  verifyDistExtension()
}

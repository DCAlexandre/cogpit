#!/usr/bin/env node
/**
 * Makes the integrated terminal available.
 *
 * The default backend (@homebridge/node-pty-prebuilt-multiarch) ships N-API
 * prebuilt binaries, so on most machines the integrated terminal already works
 * and this script simply confirms it. If the prebuilt can't load (unusual
 * arch/OS), the script detects and installs the native build prerequisites
 * (Windows: Python + Visual Studio C++ Build Tools via winget; macOS: Xcode CLT;
 * Linux: build-essential + python3) and then rebuilds the module.
 *
 * Run it once: `pnpm setup:terminal`
 */
const { spawnSync } = require('child_process')
const path = require('path')

const BACKEND = '@homebridge/node-pty-prebuilt-multiarch'

function log(msg) {
  console.log(msg)
}
function title(msg) {
  console.log(`\n\x1b[1m\x1b[33m${msg}\x1b[0m`)
}

function capture(cmd, args) {
  const r = spawnSync(cmd, args, { encoding: 'utf8', shell: false })
  return r.status === 0 ? (r.stdout || '').trim() : null
}
function run(cmd, args, opts = {}) {
  return spawnSync(cmd, args, { stdio: 'inherit', ...opts })
}

function backendState() {
  try {
    require.resolve(BACKEND)
  } catch {
    return { installed: false, loads: false }
  }
  try {
    require(BACKEND)
    return { installed: true, loads: true }
  } catch (e) {
    return { installed: true, loads: false, error: e && e.message }
  }
}

function packageManager() {
  const ua = process.env.npm_config_user_agent || ''
  if (ua.includes('pnpm')) return 'pnpm'
  if (ua.includes('yarn')) return 'yarn'
  return 'npm'
}

function rebuild() {
  title('Recompilation du module natif contre Electron…')
  const pm = packageManager()
  const r = run(pm, ['run', 'rebuild'], { shell: true })
  return r.status === 0
}

// ----------------------------------------------------------------------------
// Windows
// ----------------------------------------------------------------------------
function vswherePath() {
  const base = process.env['ProgramFiles(x86)'] || 'C:\\Program Files (x86)'
  return path.join(base, 'Microsoft Visual Studio', 'Installer', 'vswhere.exe')
}
function hasVCTools() {
  const vs = vswherePath()
  const out = capture(vs, [
    '-latest',
    '-products',
    '*',
    '-requires',
    'Microsoft.VisualStudio.Component.VC.Tools.x86.x64',
    '-property',
    'installationPath'
  ])
  return !!out
}
function hasPython() {
  return !!(capture('py', ['--version']) || capture('python', ['--version']))
}
function hasWinget() {
  return !!capture('winget', ['--version'])
}

function ensureWindows() {
  const needPython = !hasPython()
  const needVC = !hasVCTools()
  if (!needPython && !needVC) {
    log('✓ Prérequis présents (Python + VC++ Build Tools).')
    return true
  }
  if (!hasWinget()) {
    log('\x1b[31mwinget est introuvable.\x1b[0m Installe manuellement :')
    if (needPython) log('  • Python 3 : https://www.python.org/downloads/')
    if (needVC)
      log('  • Visual Studio Build Tools (charge « Développement Desktop en C++ ») : https://visualstudio.microsoft.com/visual-cpp-build-tools/')
    return false
  }
  if (needPython) {
    title('Installation de Python 3 (winget, UAC possible)…')
    run('winget', [
      'install',
      '-e',
      '--id',
      'Python.Python.3.12',
      '--accept-source-agreements',
      '--accept-package-agreements'
    ])
  }
  if (needVC) {
    title('Installation des Visual Studio Build Tools + workload C++ (winget, UAC, ~plusieurs Go)…')
    run('winget', [
      'install',
      '-e',
      '--id',
      'Microsoft.VisualStudio.2022.BuildTools',
      '--accept-source-agreements',
      '--accept-package-agreements',
      '--override',
      '--quiet --wait --add Microsoft.VisualStudio.Workload.VCTools --includeRecommended'
    ])
  }
  log('\nPrérequis installés. Ouvre un NOUVEAU terminal si la recompilation échoue (PATH à rafraîchir).')
  return true
}

// ----------------------------------------------------------------------------
// macOS / Linux
// ----------------------------------------------------------------------------
function ensureMac() {
  if (capture('xcode-select', ['-p'])) {
    log('✓ Xcode Command Line Tools présents.')
    return true
  }
  title('Installation des Xcode Command Line Tools…')
  run('xcode-select', ['--install'])
  return true
}

function ensureLinux() {
  log('Installe les prérequis de build avec ton gestionnaire de paquets, par exemple :')
  log('  • Debian/Ubuntu : sudo apt-get install -y build-essential python3')
  log('  • Fedora        : sudo dnf groupinstall -y "Development Tools" && sudo dnf install -y python3')
  log('  • Arch          : sudo pacman -S --needed base-devel python')
  return true
}

// ----------------------------------------------------------------------------
function main() {
  title('Cogpit — terminal intégré')
  const state = backendState()

  if (state.loads) {
    log('✓ Le terminal intégré est déjà fonctionnel (binaire prébuilt chargé).')
    log('  Active-le dans Paramètres → Terminal → « Intégré ».')
    process.exit(0)
  }
  if (!state.installed) {
    log(`Le backend ${BACKEND} n'est pas installé. Lance d'abord « pnpm install ».`)
    process.exit(1)
  }

  log(`Le binaire prébuilt ne se charge pas ici${state.error ? ` (${state.error})` : ''}.`)
  log('Je prépare une compilation depuis les sources.')

  let ok = false
  if (process.platform === 'win32') ok = ensureWindows()
  else if (process.platform === 'darwin') ok = ensureMac()
  else ok = ensureLinux()

  if (!ok) {
    log('\nInstalle les prérequis ci-dessus puis relance « pnpm setup:terminal ».')
    process.exit(1)
  }

  const built = rebuild()
  const after = backendState()
  if (built && after.loads) {
    title('✓ Terminal intégré prêt.')
    log('Active-le dans Paramètres → Terminal → « Intégré ».')
    process.exit(0)
  }
  log('\n\x1b[31mLa recompilation a échoué.\x1b[0m Cogpit reste pleinement utilisable avec le terminal externe.')
  process.exit(1)
}

main()

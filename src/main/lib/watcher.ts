import chokidar, { type FSWatcher } from 'chokidar'

let watcher: FSWatcher | null = null

/** Watch the Claude projects root and fire (debounced) on any session change. */
export function startWatcher(root: string, onChange: () => void): void {
  stopWatcher()
  let timer: NodeJS.Timeout | null = null
  const debounced = (): void => {
    if (timer) clearTimeout(timer)
    timer = setTimeout(onChange, 400)
  }
  watcher = chokidar.watch(root, {
    ignoreInitial: true,
    depth: 2,
    awaitWriteFinish: { stabilityThreshold: 500, pollInterval: 100 }
  })
  watcher
    .on('add', debounced)
    .on('unlink', debounced)
    .on('change', debounced)
    .on('addDir', debounced)
    .on('unlinkDir', debounced)
}

export function stopWatcher(): void {
  watcher?.close()
  watcher = null
}

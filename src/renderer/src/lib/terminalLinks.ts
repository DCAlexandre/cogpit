import type { IBufferRange, ILink, ILinkProvider, Terminal } from '@xterm/xterm'

// Candidates: absolute paths (C:\…, \\server\…, /usr/…, ~/…) OR relative/bare paths
// that carry a file extension (CW-22400-x.md, src/foo.ts, ./a/b.js). The regex is
// deliberately liberal — every candidate is then validated against the filesystem
// (resolved against the session cwd) before it becomes a link, so non-files such as
// "console.log" or "1.0.0" never underline.
const LINK_RE =
  /(?<![A-Za-z])(?:[A-Za-z]:[\\/]|\\\\|\/|~\/)[^\s"'<>()[\]{}|]+|(?<![\w.-])(?:\.{0,2}[\\/])?(?:[\w.-]+[\\/])*[\w.-]+\.[A-Za-z0-9]{1,10}/g

/** Link provider for file paths — absolute or cwd-relative — that actually exist.
 *  Opening is gated on a modifier (Ctrl/Cmd). A trailing `:line:col` is stripped. */
export function pathLinkProvider(
  term: Terminal,
  getCwd: () => string | null,
  resolve: (cwd: string | null, candidate: string) => Promise<string | null>,
  open: (absPath: string) => void,
  wantsOpen: (e: MouseEvent) => boolean
): ILinkProvider {
  return {
    provideLinks(lineNo, cb): void {
      const line = term.buffer.active.getLine(lineNo - 1)
      if (!line) return cb(undefined)
      const text = line.translateToString(true)
      const cands: { raw: string; clean: string; startX: number }[] = []
      let m: RegExpExecArray | null
      LINK_RE.lastIndex = 0
      while ((m = LINK_RE.exec(text)) !== null) {
        const raw = m[0].replace(/[.,;:)\]}'"]+$/, '') // drop trailing punctuation
        if (raw.length < 3) continue
        cands.push({ raw, clean: raw.replace(/:\d+(?::\d+)?$/, ''), startX: m.index + 1 })
      }
      if (!cands.length) return cb(undefined)
      const cwd = getCwd()
      void Promise.all(cands.map((c) => resolve(cwd, c.clean))).then((abs) => {
        const links: ILink[] = []
        cands.forEach((c, i) => {
          const target = abs[i]
          if (!target) return
          const range: IBufferRange = {
            start: { x: c.startX, y: lineNo },
            end: { x: c.startX + c.raw.length - 1, y: lineNo }
          }
          links.push({
            range,
            text: c.raw,
            activate: (e): void => {
              if (wantsOpen(e)) open(target)
            }
          })
        })
        cb(links.length ? links : undefined)
      })
    }
  }
}

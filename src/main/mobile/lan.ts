import { networkInterfaces } from 'os'

/** Non-internal IPv4 addresses, best candidate first (192.168.* / 10.* preferred). */
export function lanAddresses(): string[] {
  const nets = networkInterfaces()
  const out: string[] = []
  for (const name of Object.keys(nets)) {
    for (const ni of nets[name] || []) {
      if (ni.family === 'IPv4' && !ni.internal) out.push(ni.address)
    }
  }
  const score = (ip: string): number => (ip.startsWith('192.168.') ? 0 : ip.startsWith('10.') ? 1 : ip.startsWith('172.') ? 2 : 3)
  return out.sort((a, b) => score(a) - score(b))
}

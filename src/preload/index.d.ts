import type { CogpitApi } from '../shared/types'

declare global {
  interface Window {
    api: CogpitApi
  }
}

export {}

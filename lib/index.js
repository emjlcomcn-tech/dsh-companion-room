import { applyLife } from './life.js'

export const name = 'dsh-companion-room'
export const inject = ['tools', 'agents', 'sessionController', 'workspaceRegistry', 'attachments']

export function apply(ctx) {
  applyLife(ctx)
}

import { realpathSync } from 'node:fs'
import { homedir } from 'node:os'
import { join, resolve } from 'node:path'

export function dshHome(env = process.env) {
  const value = env.DSH_HOME?.trim()
  if (!value || value === '~') return join(homedir(), '.dsh')
  return resolve(value.startsWith('~/') || value.startsWith('~\\') ? join(homedir(), value.slice(2)) : value)
}

export function getWorkspace(registry, id) {
  if (typeof id !== 'string' || !id) return undefined
  return registry?.get?.(id)
}

export function publicWorkspaces(registry) {
  return (registry?.list?.() || []).map(({ id, title }) => ({ id, title }))
}

export function bareSessionId(id) {
  return String(id || '').replace(/^session-/, '')
}

function canonical(path) {
  if (typeof path !== 'string' || !path) return ''
  const value = realpathSync.native(path)
  return process.platform === 'win32' ? value.toLowerCase() : value
}

export function sessionInWorkspace(session, workspace) {
  if (!session || !workspace || session.header?.parentSession || session.header?.delegationDepth > 0) return false
  const id = bareSessionId(session.id || session.sessionId)
  if (id && Array.from(workspace.sessionIds || []).some(candidate => bareSessionId(candidate) === id)) return true
  try {
    const location = canonical(session.header?.cwd)
    return !!location && location === canonical(workspace.path)
  } catch { return false }
}

/** Match the existing owner's private QQ binding against the selected workspace on each use. */
export function privateQqSession(bridge, workspace) {
  const owner = String(bridge?.['私聊QQ'] || '')
  if (!workspace || !owner || bridge['总开关'] === false || bridge['转私聊'] === false) return ''
  const bindings = Array.isArray(bridge['绑定']) ? bridge['绑定'] : []
  const ids = new Set(Array.from(workspace.sessionIds || [], bareSessionId))
  const inWorkspace = id => !!id && ids.has(bareSessionId(id))
  if (bindings.length) {
    const matches = bindings.filter(b => b?.['开'] !== false && b?.['类型'] === '私聊' && String(b['号码']) === owner && inWorkspace(b['会话']))
    return (matches.find(b => bareSessionId(b['会话']) === bareSessionId(bridge['私聊会话'])) || matches.at(-1))?.['会话'] || ''
  }
  const id = bridge['私聊会话'] || bridge['目标会话']
  return inWorkspace(id) && bareSessionId(id) !== bareSessionId(bridge['群会话']) ? id : ''
}

const validTime = value => typeof value === 'string' && /^(?:[01]\d|2[0-3]):[0-5]\d$/.test(value)
export function validateSetup(data, registry) {
  const workspace = getWorkspace(registry, data?.workspaceId)
  if (!workspace) return { error: '请选择 DSH 已登记的工作区。' }
  const displayName = typeof data.displayName === 'string' ? data.displayName.trim() : ''
  if (!displayName || displayName.length > 30 || /[\u0000-\u001f\u007f]/.test(displayName)) return { error: '请填写 1–30 个字符的角色称呼。' }
  const catName = (typeof data.catName === 'string' && data.catName.trim()) || '小猫'
  if (catName.length > 20 || /[\u0000-\u001f\u007f]/.test(catName)) return { error: '小猫的名字最多 20 个字符。' }
  if (!validTime(data.bedtime) || !validTime(data.wakeup) || data.bedtime === data.wakeup) return { error: '请分别填写有效的睡觉和起床时间。' }
  return { values: { workspaceId: workspace.id, displayName, bedtime: data.bedtime, wakeup: data.wakeup,
    theme: data.theme === 'cyber' ? 'cyber' : 'cozy', qqEnabled: data.qqEnabled === true, cat: data.cat === true, catName,
    maxThoughtsPerDay: data.thoughts === true ? 36 : 0, on: true } }
}

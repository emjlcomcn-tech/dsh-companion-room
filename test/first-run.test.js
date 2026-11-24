import assert from 'node:assert/strict'
import { mkdtemp, mkdir, readFile, writeFile } from 'node:fs/promises'
import net from 'node:net'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import test from 'node:test'

const freePort = async () => {
  const server = net.createServer()
  await new Promise((resolve, reject) => server.once('error', reject).listen(0, '127.0.0.1', resolve))
  const { port } = server.address()
  await new Promise(resolve => server.close(resolve))
  return port
}

test('fresh install binds an existing workspace and keeps each room state separate', async t => {
  const home = await mkdtemp(join(tmpdir(), 'dsh-companion-test-'))
  const room = join(home, 'companion-room')
  const first = { id: 'a', title: '我的角色', path: join(home, 'workspace a'), sessionIds: ['a-1', 'a-2', 'a-group'] }
  const second = { id: 'b', title: '另一个角色', path: join(home, 'workspace b'), sessionIds: ['b-1'] }
  await Promise.all([mkdir(room), mkdir(first.path), mkdir(second.path)])
  const port = await freePort()
  await writeFile(join(room, 'settings.json'), JSON.stringify({ port }))
  process.env.DSH_HOME = home
  const originalNow = Date.now
  Date.now = () => new Date(2026, 6, 19, 11, 30).getTime()
  t.after(() => { Date.now = originalNow; delete process.env.DSH_HOME })
  const workspaces = [first, second]
  const tools = new Map()
  const { apply } = await import('../lib/index.js')
  apply({ get: key => key === 'workspaceRegistry' ? { list: () => workspaces, get: id => workspaces.find(w => w.id === id) } : undefined,
    tools: { register: (spec, options) => tools.set(spec.name, { ...spec, when: options.when }) }, effect: creator => t.after(creator()) })
  const origin = 'http://127.0.0.1:' + port
  const get = path => fetch(origin + path, { redirect: 'manual' })
  const post = (path, value, requestOrigin = origin) => fetch(origin + path, { method: 'POST',
    headers: { origin: requestOrigin, 'content-type': 'application/json' }, body: JSON.stringify(value) })
  const settings = { displayName: '鲸泡', bedtime: '23:00', wakeup: '07:00', theme: 'cyber' }
  const actor = (id, cwd) => ({ agent: { session: { id, header: { cwd } } } })

  const redirected = await get('/')
  assert.equal(redirected.status, 302)
  assert.equal(redirected.headers.get('location'), '/setup')
  assert.equal((await get('/setup')).status, 200)
  assert.equal((await (await get('/api/state')).json()).on, false)
  const setup = await (await get('/api/setup')).json()
  assert.deepEqual(setup.workspaces, workspaces.map(({ id, title }) => ({ id, title })))
  assert.equal(setup.qqEnabled, false)
  assert.equal(setup.thoughts, false)
  assert.equal(setup.cat, false)
  assert.equal(setup.catName, '小猫')
  assert.equal(setup.avatar, 'dfy')
  assert.equal((await post('/api/setup', { ...settings, workspaceId: 'unknown' })).status, 400)
  assert.equal((await post('/api/setup', { ...settings, workspaceId: first.id }, 'http://example.test')).status, 403)
  assert.equal((await post('/api/setup', { ...settings, workspaceId: first.id })).status, 200)
  assert.equal((await post('/api/think', {}, 'http://example.test')).status, 403)
  assert.equal((await fetch(origin + '/api/think', { method: 'POST' })).status, 403)
  assert.equal((await post('/api/think', {})).status, 200)
  assert.equal((await get('/')).status, 200)
  assert.equal((await (await get('/api/layout')).json()).avatar, 'dfy')
  for (const filename of ['dfy.glb', 'face_closed.webp', 'face_smile.webp', 'face_talk.webp']) {
    const response = await get('/r3d/' + filename)
    assert.equal(response.status, 200)
    assert.deepEqual(Buffer.from(await response.arrayBuffer()), await readFile(new URL('../lib/models/' + filename, import.meta.url)))
  }
  const state = await (await get('/api/state')).json()
  assert.equal(state.displayName, '鲸泡')
  assert.equal(state.on, true)
  assert.equal(state.cat, null)
  assert.equal(state.feibi, null)
  assert.equal((await post('/api/setup', { ...settings, workspaceId: first.id, cat: true, catName: '绒团' })).status, 200)
  assert.equal((await (await get('/api/state')).json()).cat.name, '绒团')
  const look = tools.get('room_look')
  assert.equal(look.when(actor('a-2', first.path)), true)
  assert.equal(look.when(actor('new-session', first.path)), true)
  assert.equal(look.when(actor('b-1', second.path)), false)
  assert.match((await look.execute({}, actor('b-1', second.path))).text, /绑定/)

  await writeFile(join(home, 'qq-bridge-config.json'), JSON.stringify({ '私聊QQ': '10001', '私聊会话': 'a-1', '绑定': [
    { '类型': '私聊', '号码': '10001', '会话': 'a-1' },
    { '类型': '群聊', '号码': '10002', '会话': 'a-group' },
  ] }))
  assert.equal(look.when(actor('a-1', first.path)), false)
  assert.equal((await post('/api/setup', { ...settings, workspaceId: first.id, qqEnabled: true })).status, 200)
  assert.equal(look.when(actor('a-1', first.path)), true)
  assert.equal(look.when(actor('a-group', first.path)), false)
  assert.equal((await post('/api/city-dispatch', { destination: 'cafe' })).status, 200)
  assert.equal((await (await get('/api/state')).json()).act.leisure.kind, 'cafe')
  assert.equal((await post('/api/setup', { ...settings, workspaceId: second.id })).status, 200)
  assert.equal((await (await get('/api/state')).json()).act.leisure, undefined)
  assert.equal(look.when(actor('a-2', first.path)), false)
  assert.equal(look.when(actor('b-1', second.path)), true)
  assert.equal((await post('/api/setup', { ...settings, workspaceId: first.id })).status, 200)
  assert.equal((await (await get('/api/state')).json()).act.leisure.kind, 'cafe')
  const saved = JSON.parse(await readFile(join(room, 'settings.json'), 'utf8'))
  assert.equal(saved.workspaceId, first.id)
})

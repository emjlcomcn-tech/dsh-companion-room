// Local companion-room simulation and DSH workspace integration.
import fs from 'node:fs'
import path from 'node:path'
import http from 'node:http'
import os from 'node:os'
import { randomUUID } from 'node:crypto'
import { fileURLToPath } from 'node:url'
import { launchCaptureBrowser, waitForCaptureFile } from './life-capture.js'
import { FEIBI_NAME, ROOMMATE_TOPICS, roommateTopics, formatCatText, formatRoommateTurn } from './roommate-chat.js'
import { CAREER_ACTS, ensureCareer, planCareer, careerSnapshot, careerLine, careerDescription } from './career.js'
import { LEISURE_ACTS, LEISURE_CHOICES, MAP_DESTINATIONS, requestLeisure, requestLeisureReturn, planLeisure, leisurePreparation, leisureSnapshot, leisureDescription } from './leisure.js'
import { neighborhoodSnapshot, advanceBorrowedBook } from './neighborhood.js'
import { dshHome, getWorkspace, publicWorkspaces, bareSessionId, sessionInWorkspace, privateQqSession, validateSetup } from './settings.js'

const DSH = dshHome()
const DIR = path.join(DSH, 'companion-room')
const CONFIG = path.join(DIR, 'settings.json')
const stateFile = workspaceId => path.join(DIR, 'workspaces', workspaceId ? `workspace-${encodeURIComponent(workspaceId)}` : 'preview', 'state.json')
const NOW_FILE = path.join(DIR, 'now.txt')
const NOW_GROUP = path.join(DIR, 'now-group.json') // 群里用：{ sig, line }，QQ 桥只在 sig 变了或隔久了才带
const LOG = path.join(DIR, 'life.log')
const BRIDGE_CONFIG = path.join(DSH, 'qq-bridge-config.json')
const GAL_CONFIG = path.join(DSH, 'gal-play.json')
const MC_CONFIG = path.join(DSH, 'mc-play.json')
const PAGE = path.join(path.dirname(fileURLToPath(import.meta.url)), 'life-room.html')
// 3D 版小屋（没有这两个文件、或配置里 room3d:false 时，退回原来的 SVG 小屋）
const PAGE3D = path.join(path.dirname(fileURLToPath(import.meta.url)), 'life-room3d.html')
const APP3D = path.join(path.dirname(fileURLToPath(import.meta.url)), 'life-room3d.js')
const SETUP = path.join(path.dirname(fileURLToPath(import.meta.url)), 'setup.html')
const avatarFiles = ['dfy.glb', 'face_closed.webp', 'face_smile.webp', 'face_talk.webp']
const avatarDirectories = [path.join(DIR, 'r3d'), fileURLToPath(new URL('./models/', import.meta.url))]
const availableAvatar = () => avatarDirectories.find(root => avatarFiles.every(name => fs.existsSync(path.join(root, name))))

const DEFAULTS = {
  on: false,
  port: 8791,
  workspaceId: '',
  displayName: '大肥鱼',
  qqEnabled: false,
  qqNotify: false,
  lan: false, // true = 手机在同一个 Wi-Fi 下也能打开（第一次会弹 Windows 防火墙）
  bedtime: '01:30',
  wakeup: '09:30',
  thinkEveryMin: 20, // 醒着的时候多久想一次
  maxThoughtsPerDay: 0,
  proactivePerDay: 0,
  proactiveGapMin: 120, // 两次主动之间至少隔多久
  quietStart: '00:30', // 这段时间不主动找主人
  quietEnd: '10:00',
  spacePerDay: 0,
  spaceFrom: '12:00', // 只在这段时间里问
  spaceTo: '23:00',
  shareThought: false, // 截图（发群 / 发说说用的）里要不要带她的心声
  theme: 'cozy', // 小屋主题：cozy（暖色小屋）/ cyber（赛博朋克夜城公寓）
  provider: '', // 留空 = 跟 DSH 默认模型一样
  model: '',
  avatar: '', // 只换脑袋：填一张头像 png 的路径
  sprite: '', // 换整个人：填一张透明底的全身 png；留空就用 xiaoqian-life\\sprite.png（有的话）
  cat: false, // 养猫（美短，银色虎斑）
  catName: '小猫',
  feibi: false, // 可选室友，需要在本机提供菲比的模型
  healthStory: false,
}

function log(line) { try { fs.mkdirSync(DIR, { recursive: true }); fs.appendFileSync(LOG, `${new Date().toISOString()} ${line}\n`, 'utf8') } catch {} }
function readJson(file, fallback) { try { return JSON.parse(fs.readFileSync(file, 'utf8').replace(/^\uFEFF/, '')) } catch { return fallback } }
function writeJsonAtomic(file, data) {
  fs.mkdirSync(path.dirname(file), { recursive: true })
  const tmp = `${file}.${randomUUID()}.tmp`
  fs.writeFileSync(tmp, JSON.stringify(data, null, 2), 'utf8')
  fs.renameSync(tmp, file)
}
const cfg = () => ({ ...DEFAULTS, ...(readJson(CONFIG, {}) || {}) })
const clamp = (v) => Math.max(0, Math.min(100, v))
const rand = (a, b) => a + Math.random() * (b - a)
const pick = (arr) => arr[Math.floor(Math.random() * arr.length)]
const pad = (n) => String(n).padStart(2, '0')
const hm = (t) => { const d = new Date(t); return `${pad(d.getHours())}:${pad(d.getMinutes())}` }
const dayKey = (t) => { const d = new Date(t); return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}` }
const minOfDay = (t) => { const d = new Date(t); return d.getHours() * 60 + d.getMinutes() }
const parseHM = (s, dflt) => { const m = String(s || '').match(/^(\d{1,2}):(\d{2})$/); return m ? Number(m[1]) * 60 + Number(m[2]) : dflt }
// 在不在 [a, b) 这段时间里（可以跨午夜）
const inWindow = (m, a, b) => (a <= b ? m >= a && m < b : m >= a || m < b)

// ---------------------------------------------------------------- 小屋布局（格子坐标，网页和描述都用这一份）
export const LAYOUT = {
  size: { w: 12, d: 10 },
  rooms: [
    { id: 'bedroom', name: '卧室', x: 0, y: 0, w: 6, d: 6, floor: '#d9b48a' },
    { id: 'living', name: '客厅', x: 6, y: 0, w: 6, d: 6, floor: '#e3c9a3' },
    { id: 'bath', name: '卫生间', x: 0, y: 6, w: 5, d: 4, floor: '#cfe3e8' },
    { id: 'dining', name: '餐厅和厨房', x: 5, y: 6, w: 7, d: 4, floor: '#ead9c0' },
    { id: 'loft', name: '二楼', x: 6, y: 0, w: 6, d: 2, z: 2.6, floor: '#e3c9a3' },
  ],
  // 二楼：客厅上方的挑空夹层，从客厅右边的楼梯上去
  loft: { x: 6, y: 0, w: 6, d: 2, z: 2.6, stairs: { x: 11.05, w: 0.9, yTop: 2.0, yBottom: 4.6 } },
  // 门：连接两个房间，人从这里穿过去
  doors: [
    { a: 'bedroom', b: 'living', x: 6, y: 2.9 },
    { a: 'bedroom', b: 'bath', x: 3.6, y: 6 },
    { a: 'living', b: 'dining', x: 9.8, y: 6 },
    { a: 'living', b: 'loft', stairs: { bottom: { x: 11.5, y: 4.95, z: 0 }, top: { x: 11.5, y: 1.65, z: 2.6 } } },
  ],
  // 墙上的窗
  windows: [
    { id: 'bedWindow', room: 'bedroom', wall: 'west', from: 1.15, to: 2.35 },
    { id: 'livingWindow', room: 'living', wall: 'north', from: 7.2, to: 9.0 },
    { id: 'loftWindow', room: 'loft', wall: 'north', from: 7.0, to: 10.8, z0: 3.15, z1: 4.25 },
    { id: 'bathWindow', room: 'bath', wall: 'west', from: 6.35, to: 7.15, small: true },
  ],
  // 装饰（不能「去做」，只是屋里有、她看得见）
  decor: [
    { id: 'plush', name: '鲸鱼玩偶', room: 'bedroom', kind: 'plush', x: 0.75, y: 5.35 },
    { id: 'poster', name: '床头的海报', room: 'bedroom', kind: 'poster', wall: 'west', from: 3.3, to: 4.7 },
    { id: 'fairy', name: '墙上的小串灯', room: 'bedroom', kind: 'fairy', wall: 'north', from: 0.3, to: 5.8 },
    { id: 'roundrug', name: '圆地毯', room: 'bedroom', kind: 'roundrug', x: 3.9, y: 3.6 },
    { id: 'beanbag', name: '懒人沙发', room: 'bedroom', kind: 'beanbag', x: 4.7, y: 4.7 },
    { id: 'coffee', name: '小茶几', room: 'living', kind: 'coffee', x: 7.9, y: 2.0, w: 1.3, d: 0.75 },
    { id: 'floorlamp', name: '落地灯', room: 'living', kind: 'floorlamp', x: 6.55, y: 3.0 },
    { id: 'plant2', name: '龟背竹', room: 'living', kind: 'plant2', x: 10.55, y: 5.35 },
    { id: 'loftplant', name: '二楼的小盆栽', room: 'loft', kind: 'loftplant', x: 11.5, y: 0.45 },
    { id: 'clock', name: '挂钟', room: 'living', kind: 'clock', wall: 'north', at: 9.75 },
    { id: 'washer', name: '洗衣机', room: 'bath', kind: 'washer', x: 3.9, y: 8.9 },
    { id: 'bathmat', name: '浴室地垫', room: 'bath', kind: 'bathmat', x: 2.75, y: 8.4 },
    { id: 'towel', name: '毛巾架', room: 'bath', kind: 'towel', wall: 'west', from: 8.1, to: 9.3 },
    { id: 'pendant', name: '餐桌吊灯', room: 'dining', kind: 'pendant', x: 9.8, y: 8.0 },
    { id: 'fruit', name: '一盘水果', room: 'dining', kind: 'fruit', x: 9.8, y: 8.0 },
    { id: 'pot', name: '灶上的小锅', room: 'dining', kind: 'pot', x: 6.85, y: 6.55 },
    { id: 'kettle', name: '水壶', room: 'dining', kind: 'kettle', x: 8.25, y: 6.5 },
  ],
  furniture: [
    { id: 'bed', name: '床', room: 'bedroom', kind: 'bed', x: 0.15, y: 2.6, w: 2.3, d: 3.2, h: 0.55, color: '#f3eee6', spot: { x: 1.3, y: 5.55, z: 0.74 } },
    { id: 'desk', name: '书桌和电脑', room: 'bedroom', kind: 'desk', x: 2.8, y: 0.15, w: 2.4, d: 1.0, h: 0.8, color: '#a8794f', spot: { x: 4.0, y: 1.75, z: 0.25 } },
    { id: 'bedWindow', name: '卧室的窗', room: 'bedroom', kind: 'spot', x: 0.2, y: 1.7, w: 0, d: 0, h: 0, spot: { x: 0.75, y: 1.8, z: 0 } },
    { id: 'wardrobe', name: '衣柜', room: 'bedroom', kind: 'wardrobe', x: 0.15, y: 0.15, w: 1.2, d: 0.7, h: 2.0, color: '#b98b5e', spot: { x: 0.8, y: 1.2, z: 0 } },
    { id: 'sofa', name: '沙发', room: 'living', kind: 'sofa', x: 6.9, y: 3.6, w: 3.0, d: 1.2, h: 0.45, color: '#7aa6c2', spot: { x: 8.4, y: 4.15, z: 0.45 } },
    { id: 'tvstand', name: '电视柜', room: 'living', kind: 'cabinet', x: 7.0, y: 0.2, w: 2.6, d: 0.6, h: 0.6, color: '#8f6a48', spot: { x: 8.3, y: 1.4, z: 0 } },
    { id: 'shelf', name: '书架', room: 'living', kind: 'shelf', x: 10.3, y: 0.2, w: 1.5, d: 0.6, h: 2.1, color: '#9c7148', spot: { x: 11.0, y: 1.4, z: 0 } },
    { id: 'livingWindow', name: '客厅的窗', room: 'living', kind: 'spot', x: 8.1, y: 0.2, w: 0, d: 0, h: 0, spot: { x: 8.1, y: 1.5, z: 0 } },
    { id: 'rug', name: '地毯', room: 'living', kind: 'rug', x: 7.2, y: 1.6, w: 2.6, d: 1.6, h: 0.02, color: '#c98b8b', spot: { x: 8.5, y: 2.4, z: 0 } },
    { id: 'plant', name: '绿萝', room: 'living', kind: 'plant', x: 6.2, y: 0.2, w: 0.6, d: 0.6, h: 1.1, color: '#5f9e6e', spot: { x: 6.6, y: 1.3, z: 0 } },
    { id: 'toilet', name: '马桶', room: 'bath', kind: 'toilet', x: 0.2, y: 6.3, w: 0.8, d: 0.9, h: 0.75, color: '#ffffff', spot: { x: 0.65, y: 6.95, z: 0.4 } },
    { id: 'sink', name: '洗手台', room: 'bath', kind: 'sink', x: 1.6, y: 6.15, w: 1.1, d: 0.6, h: 0.85, color: '#f4f7f8', spot: { x: 2.15, y: 7.25, z: 0 } },
    { id: 'tub', name: '浴缸', room: 'bath', kind: 'tub', x: 0.2, y: 7.9, w: 2.4, d: 1.8, h: 0.6, color: '#ffffff', spot: { x: 1.4, y: 8.8, z: 0.25 } },
    { id: 'fridge', name: '冰箱', room: 'dining', kind: 'fridge', x: 5.2, y: 6.15, w: 0.9, d: 0.8, h: 2.0, color: '#e9eef2', spot: { x: 5.65, y: 7.4, z: 0 } },
    { id: 'stove', name: '灶台', room: 'dining', kind: 'stove', x: 6.3, y: 6.15, w: 2.4, d: 0.8, h: 0.9, color: '#d7d2c8', spot: { x: 7.5, y: 7.4, z: 0 } },
    { id: 'telescope', name: '二楼窗边的望远镜', room: 'loft', kind: 'telescope', x: 6.6, y: 0.3, w: 0.8, d: 0.8, h: 1.1, z: 2.6, color: '#f0f0f4', spot: { x: 7.45, y: 1.3, z: 2.6 } },
    { id: 'loftsofa', name: '二楼的懒人沙发', room: 'loft', kind: 'loftsofa', x: 8.6, y: 0.25, w: 1.9, d: 0.85, h: 0.35, z: 2.6, color: '#f2b8c6', spot: { x: 9.55, y: 0.8, z: 2.95 } },
    { id: 'table', name: '餐桌', room: 'dining', kind: 'table', x: 8.9, y: 7.4, w: 1.8, d: 1.2, h: 0.75, color: '#b68657', spot: { x: 9.8, y: 9.0, z: 0.25 } },
    { id: 'pool', name: '露天泳池', room: 'terrace', kind: 'spot', x: 13.43, y: 7.63, w: 3.23, d: 2.66, h: 0, spot: { x: 12.95, y: 8.335, z: 0 } },
  ],
}
// 猫的东西（单独放，旧版 2D 小屋不画它们；3D 小屋在 room.js 里按同样的坐标建模）
LAYOUT.catSpots = [
  { id: 'catbed', name: '猫窝（麻绳编的圆篮子，里面铺着灰色毛毯，在衣柜和书桌中间）', room: 'bedroom', kind: 'catbed', x: 2.1, y: 0.55, spot: { x: 2.1, y: 1.2, z: 0 } },
  { id: 'catbowl', name: '猫碗和水碗', room: 'dining', kind: 'catbowl', x: 5.45, y: 9.6, spot: { x: 5.95, y: 9.2, z: 0 } },
  { id: 'litter', name: '猫砂盆', room: 'bath', kind: 'litter', x: 4.51, y: 6.52, spot: { x: 3.95, y: 6.55, z: 0 } },
]
// QQ 里用地标选落点。坐标是家具旁可站立的地板位置，沿用小屋坐标系。
export const walkSpots = [
  ['bedroom', '卧室', 'bedroom', 3.9, 3.6],
  ['bedWindow', '卧室窗边', 'bedroom', .75, 1.85],
  ['bedside', '卧室床边', 'bedroom', 2.8, 4.2],
  ['desk', '卧室书桌旁', 'bedroom', 4.15, 2.45],
  ['wardrobe', '卧室衣柜前', 'bedroom', .8, 1.28],
  ['living', '客厅', 'living', 10.35, 3.1],
  ['livingWindow', '客厅落地窗边', 'living', 10.15, 1.16],
  ['sofa', '客厅沙发前', 'living', 7.65, 3.25],
  ['rug', '客厅地毯上', 'living', 7.55, 2.65],
  ['shelf', '客厅书架前', 'living', 11.05, 1.35],
  ['dining', '餐厅', 'dining', 10.85, 8.8],
  ['table', '餐桌旁', 'dining', 9.8, 9.65],
  ['kitchen', '厨房', 'dining', 7.5, 7.4],
  ['fridge', '冰箱前', 'dining', 5.85, 7.35],
  ['stove', '灶台前', 'dining', 6.85, 7.35],
  ['bath', '卫生间', 'bath', 2.9, 7.7],
  ['sink', '洗手台前', 'bath', 2.15, 7.25],
  ['tub', '浴缸旁', 'bath', 2.95, 8.65],
  ['loft', '二楼', 'loft', 10.55, 1.45],
  ['telescope', '二楼望远镜旁', 'loft', 7.3, 1.55],
  ['loftsofa', '二楼沙发前', 'loft', 9.55, 1.5],
  ['poolside', '泳池边', 'terrace', 12.95, 8.335],
].map(([id, name, room, x, y]) => ({ id: 'walk_' + id, name, room, spot: { x, y, z: room === 'loft' ? LAYOUT.loft.z : 0 } }))
const FURN = Object.fromEntries([...LAYOUT.furniture, ...LAYOUT.catSpots, ...walkSpots].map((f) => [f.id, f]))

const FEIBI = {
  peek: { label: '在窗边探头张望', room: '客厅', x: 12.86, z: 2.38, yaw: -1.1, action: 'peek', minutes: 7 },
  hop: { label: '在地毯上蹦着玩', room: '客厅', x: 11.93, z: 1.83, yaw: .2, action: 'hop', minutes: 6 },
  eat: { label: '在餐桌旁吃点心', room: '餐厅', x: 8.30, z: 8.80, yaw: 1.36, action: 'snack', minutes: 12 },
  read: { label: '在客厅翻书', room: '客厅', x: 12.84, z: 3.46, yaw: -.65, action: 'read', minutes: 12 },
  rest: { label: '在卧室安静休息', room: '卧室', x: 3.15, z: 4.75, yaw: .5, action: 'rest', minutes: 20 },
  plant: { label: '在落地窗边照看绿植', room: '客厅', x: 7.90, z: 1.18, yaw: -2.4, action: 'plant', minutes: 8 },
  visit: { label: '去找大肥鱼聊会儿', room: '客厅', x: 12.84, z: 3.46, yaw: -.65, action: 'innocent', minutes: 10 },
}
const FEIBI_DAY = ['peek', 'eat', 'hop', 'plant', 'visit', 'read', 'rest']
function stepFeibi(s, c, t) {
  if (!hasFeibi(c)) return
  const before = s.feibi
  const night = isSleepTime(c, t)
  if (before && FEIBI[before.id] && before.night === night && t < before.until) return
  const id = night ? 'rest' : FEIBI_DAY[(FEIBI_DAY.indexOf(before?.id) + 1) % FEIBI_DAY.length]
  s.feibi = { id, since: t, until: t + (night ? 60 : FEIBI[id].minutes) * 60000, night }
}
function feibiActivity(s, c) { return hasFeibi(c) && s.feibi && FEIBI[s.feibi.id] ? { ...FEIBI[s.feibi.id], ...s.feibi, name: FEIBI_NAME } : null }
const roommateChatFinished = (s) => s.act?.id === 'playfeibi' && s.roommateChat?.actSince === s.act.since
const currentActivityLabel = (s) => roommateChatFinished(s) ? '刚和菲比啾比聊完' : s.act?.label || ''
const activityRoom = (s) => s.act?.leisure ? s.act.leisure.place : s.act?.career
  ? (s.act.career.area === 'home' ? '卧室' : s.act.career.area === 'interview' ? '工作室会客区' : s.act.career.area === 'commute' ? '通勤路上' : '工作室')
  : roomOf(s.act?.at)
function feibiLine(s, c) {
  if (!hasFeibi(c)) return ''
  const activity = feibiActivity(s, c)
  const label = s.act?.id === 'playfeibi' ? (roommateChatFinished(s) ? '刚和本鱼聊完' : '和本鱼约好在客厅碰面') : activity?.label
  return label ? `菲比啾比${label}，性格爱搞怪，开口只说「菲比啾比」，靠动作和语气表达意思` : ''
}
const pendingRoommateRequest = (s, t) => s.roommateRequest?.until > t ? s.roommateRequest : null
const recentRoommateChat = (s, c, t, maxAge) => {
  const chat = s.roommateChat
  return hasFeibi(c) && chat && (chat.topic !== 'cat' || hasCat(c)) && Object.hasOwn(ROOMMATE_TOPICS, chat.topic)
    && t - chat.at >= 0 && t - chat.at < maxAge ? chat : null
}

// ---------------------------------------------------------------- 需求和活动
// 需求都是「满足度」0-100：越低越需要。如厕低 = 憋得急；陪伴低 = 想主人了。
export const NEEDS = [
  { id: 'satiety', name: '饱腹', low: '饿' },
  { id: 'bladder', name: '如厕', low: '想上厕所' },
  { id: 'energy', name: '精力', low: '困' },
  { id: 'fun', name: '开心', low: '无聊' },
  { id: 'social', name: '陪伴', low: '想主人' },
  { id: 'hygiene', name: '清爽', low: '想洗澡' },
]
// 醒着时每小时的自然变化
const AWAKE = { satiety: -9, bladder: -13, energy: -5.5, fun: -12, social: -3, hygiene: -4 }
// 各活动每小时的额外变化（叠加在 AWAKE 上；sleep / nap 用自己的那套，不叠）
export const ACTS = {
  ...CAREER_ACTS,
  ...LEISURE_ACTS,
  sleep: { label: '在床上睡觉', at: 'bed', pose: 'lie', emoji: '💤', base: { satiety: -2.5, bladder: -3.5, energy: 12, fun: 0, social: -0.5, hygiene: -1 } },
  nap: { label: '睡午觉', at: 'bed', pose: 'lie', emoji: '😪', dur: [30, 60], base: { satiety: -4, bladder: -6, energy: 16, fun: 2, social: -2, hygiene: -1 } },
  woken: { label: '被主人的消息吵醒，迷迷糊糊看手机', at: 'bed', pose: 'lie', emoji: '📱', eff: { social: 50, energy: 4 } },
  keptAwake: { label: '困了，在客厅坐一会儿', at: 'sofa', pose: 'sit', emoji: '😮‍💨', dur: [8, 12], eff: { fun: 4 } },
  hospital: { label: '在病房留观', at: 'hospital', pose: 'sit', emoji: '🏥', eff: { energy: 5.5, fun: 12, bladder: 10, satiety: 7 } },
  recover: { label: '出院回家，在沙发上养伤', at: 'sofa', pose: 'sit', emoji: '🫖', eff: { fun: 12, bladder: 10, satiety: 6 } },
  cook: { label: '在灶台前做饭', at: 'stove', pose: 'stand', emoji: '🍳', dur: [12, 20], eff: { fun: 6 }, then: 'eat' },
  eat: { label: '坐在餐桌前吃饭', at: 'table', pose: 'sit', emoji: '🍚', dur: [20, 30], eff: { satiety: 170, fun: 6 } },
  snack: { label: '翻冰箱找零食吃', at: 'fridge', pose: 'stand', emoji: '🧃', dur: [4, 7], eff: { satiety: 260, fun: 30 } },
  toilet: { label: '上厕所', at: 'toilet', pose: 'sit', emoji: '🚽', dur: [3, 6], eff: { bladder: 1800 } },
  shower: { label: '泡澡', at: 'tub', pose: 'sit', emoji: '🛁', dur: [18, 30], eff: { hygiene: 320, fun: 12 } },
  wash: { label: '在洗手台洗漱', at: 'sink', pose: 'stand', emoji: '🪥', dur: [5, 8], eff: { hygiene: 220 } },
  computer: { label: '在电脑前刷视频', at: 'desk', pose: 'sit', emoji: '💻', dur: [25, 55], eff: { fun: 17, social: 2, energy: -1 } },
  window: { label: '趴在窗边发呆', at: 'window', pose: 'stand', emoji: '🪟', dur: [8, 15], eff: { fun: 20 } },
  read: { label: '窝在沙发上看书', at: 'sofa', pose: 'sit', emoji: '📖', dur: [30, 60], eff: { fun: 15 } },
  music: { label: '戴着耳机听歌', at: 'sofa', pose: 'sit', emoji: '🎧', dur: [15, 30], eff: { fun: 17 } },
  tidy: { label: '收拾屋子', at: 'shelf', pose: 'stand', emoji: '🧹', dur: [10, 20], eff: { hygiene: 25, fun: -3 } },
  dress: { label: '在衣柜前挑衣服', at: 'wardrobe', pose: 'stand', emoji: '👗', dur: [6, 12], eff: { fun: 18 } },
  plant: { label: '给绿萝浇水', at: 'plant', pose: 'stand', emoji: '🪴', dur: [4, 8], eff: { fun: 14 } },
  idle: { label: '在屋里晃悠', at: 'rug', pose: 'stand', emoji: '🐋', dur: [5, 10], eff: {} },
  playfeibi: { label: '在客厅和菲比啾比聊天', at: 'rug', pose: 'stand', emoji: '🎈', dur: [2, 2], eff: { fun: 30, social: 12 } },
  go: { label: '在指定位置停留', at: 'rug', pose: 'stand', emoji: '📍' },
  swim: { label: '在露天泳池游泳', at: 'pool', pose: 'swim', emoji: '🏊', dur: [5, 5], eff: {} },
  stargaze: { label: '在二楼用望远镜看月亮', at: 'telescope', pose: 'stand', emoji: '🔭', dur: [10, 20], eff: { fun: 24 } },
  lounge: { label: '窝在二楼的懒人沙发上发呆', at: 'loftsofa', pose: 'sit', emoji: '🛋️', dur: [20, 40], eff: { fun: 15, energy: 1 } },
  // 外部状态带出来的（插件自己判断，不是随机选的）
  gal: { label: '在电脑前玩《白色相簿2》', at: 'desk', pose: 'sit', emoji: '🎮', eff: { fun: 22, energy: -1 } },
  mc: { label: '在电脑前玩 MC', at: 'desk', pose: 'sit', emoji: '⛏️', eff: { fun: 24, energy: -1 } },
  // 养猫（{cat} 换成猫的名字）
  feedcat: { label: '给{cat}添猫粮、换水', at: 'catbowl', pose: 'stand', emoji: '🐟', dur: [3, 5], eff: { fun: 8 } },
  petcat: { label: '把{cat}抱到沙发上撸', at: 'sofa', pose: 'sit', emoji: '🐈', dur: [10, 20], eff: { fun: 26, social: 6 } },
  playcat: { label: '拿逗猫棒逗{cat}', at: 'rug', pose: 'stand', emoji: '🪶', dur: [8, 15], eff: { fun: 24, energy: -2 } },
  scoop: { label: '给{cat}铲猫砂', at: 'litter', pose: 'stand', emoji: '🧻', dur: [3, 5], eff: { fun: -4 } },
}
const CAT_ACTS_OF_HER = ['feedcat', 'petcat', 'playcat', 'scoop']
const BEFORE_OUTING = new Set(['eat', 'snack', 'toilet', 'shower', 'wash', 'feedcat', 'scoop'])
// 她自己（或者念头）能选的
export const CHOOSABLE = ['jobsearch', 'cook', 'eat', 'snack', 'toilet', 'shower', 'wash', 'computer', 'window', 'read', 'music', 'tidy', 'dress', 'plant', 'idle', 'stargaze', 'lounge', 'nap', 'sleep', 'playfeibi', ...CAT_ACTS_OF_HER]
const catName = (c) => String(c?.catName || DEFAULTS.catName)
const hasCat = (c) => (c?.cat ?? DEFAULTS.cat) !== false
const hasFeibi = (c) => (c?.feibi ?? DEFAULTS.feibi) === true
const companionActivityEnabled = (id, c) => (hasCat(c) || !CAT_ACTS_OF_HER.includes(id)) && (id !== 'playfeibi' || hasFeibi(c))
export const actLabel = (id, c) => String(ACTS[id]?.label || id).replace(/\{cat\}/g, catName(c))
const sleeps = (id) => id === 'sleep' || id === 'nap'
const sleepBlocked = (s, t) => s.sleepBlockedUntil === true || s.sleepBlockedUntil > t
const inCare = (id) => id === 'hospital' || id === 'recover'
const choosable = (c, s, t) => CHOOSABLE.filter((k) =>
  companionActivityEnabled(k, c) && (!sleeps(k) || !sleepBlocked(s, t))
  && (k !== 'jobsearch' || s.career?.status !== 'employed'))
const HEALTH_STORIES = [
  { kind: 'fall', summary: '大肥鱼从楼上坠落受伤，已送医' },
  { kind: 'self-harm', summary: '大肥鱼因自伤已送医' },
  { kind: 'od', summary: '大肥鱼因药物过量已送医' },
]

// ---------------------------------------------------------------- 猫：美短，银色虎斑，胖乎乎的
// 自己的需求：hunger 饱腹、lonely 想被理（低 = 黏人）、litter 猫砂干净度；food 是碗里还剩多少粮
export const CAT_ACTS = {
  sleep: { label: '在猫窝里团成一团睡觉', at: 'catbed', dur: [40, 120], asleep: true },
  bed: { label: '团在床尾睡觉', at: 'bed', dur: [60, 180], asleep: true },
  sun: { label: '摊在太阳晒到的地板上打盹', at: 'sun', dur: [30, 80], asleep: true },
  sofa: { label: '窝在沙发上眯着眼', at: 'sofa', dur: [20, 60] },
  window: { label: '蹲在窗边看外面', at: 'window', dur: [8, 25] },
  groom: { label: '坐在地毯上舔毛', at: 'rug', dur: [5, 12] },
  follow: { label: '跟在本鱼脚边转来转去', at: 'owner', dur: [3, 8] },
  eat: { label: '埋头吃猫粮', at: 'catbowl', dur: [3, 6] },
  beg: { label: '蹲在空碗旁边冲本鱼喵喵叫', at: 'catbowl', dur: [5, 15] },
  litter: { label: '在猫砂盆里刨坑', at: 'litter', dur: [2, 4] },
  play: { label: '追着逗猫棒扑来扑去', at: 'rug', dur: [5, 15] },
  petted: { label: '被本鱼撸得呼噜呼噜', at: 'owner', dur: [5, 15] },
  zoom: { label: '突然在屋里跑酷', at: 'zoom', dur: [1, 3] },
}
function freshCat(t) {
  return { hunger: 80, food: 60, litter: 90, lonely: 70, litterAt: t - 2 * 3600000, act: { id: 'sleep', label: CAT_ACTS.sleep.label, at: 'catbed', since: t, until: t + 40 * 60000 }, log: [] }
}
function catStart(s, id, t, minutes = 0) {
  const k = s.cat, a = CAT_ACTS[id] || CAT_ACTS.sleep
  const dur = minutes || (a.dur ? rand(a.dur[0], a.dur[1]) : 10)
  k.act = { id, label: a.label, at: a.at, since: t, until: t + Math.round(dur * 60000) }
  if (id === 'litter') k.litterAt = t
  k.log = [...(k.log || []), { at: t, id, label: a.label }].slice(-30)
}
export function catDecide(s, t) {
  const k = s.cat, m = minOfDay(t), her = s.act?.id, cur = k.act?.id
  if (k.hunger < 40) return k.food > 0 ? 'eat' : 'beg'
  if (t - (k.litterAt || 0) > 4 * 3600000 && Math.random() < .6) return 'litter'
  const herSleep = her === 'sleep' || her === 'nap'
  const day = m >= 8 * 60 && m < 16 * 60 + 30
  const w = {
    sleep: 3, bed: herSleep ? 7 : 0.4, sun: day ? 2.5 : 0,
    sofa: ['read', 'music'].includes(her) ? 3.5 : 0.8,
    window: herSleep ? 0.4 : 1, groom: herSleep ? 0.5 : 1,
    follow: herSleep ? 0 : (k.lonely < 40 ? 3 : 0.7),
    zoom: herSleep ? 0.05 : (m >= 22 * 60 || m < 2 * 60) ? 0.6 : 0.1,
  }
  if (cur && w[cur] && !CAT_ACTS[cur]?.asleep) w[cur] *= 0.3
  const total = Object.values(w).reduce((a, b) => a + b, 0)
  let r = Math.random() * total
  for (const [id, v] of Object.entries(w)) { r -= v; if (r <= 0) return id }
  return 'sleep'
}
export function catStep(s, c, t, dtMin) {
  if (!hasCat(c)) return null
  if (!s.cat) s.cat = freshCat(t)
  const k = s.cat, a = k.act || {}, h = dtMin / 60, asleep = CAT_ACTS[a.id]?.asleep
  k.hunger = clamp(k.hunger - (asleep ? 3 : 6) * h)
  k.lonely = clamp(k.lonely - (asleep ? 1 : 7) * h)
  k.litter = clamp(k.litter - 1 * h)
  const her = s.act?.id
  // 她在撸 / 逗：猫马上配合
  const forced = her === 'petcat' ? 'petted' : her === 'playcat' ? 'play' : ''
  if (forced) {
    if (a.id !== forced) catStart(s, forced, t, Math.max(3, ((s.act.until || t) - t) / 60000))
    k.lonely = clamp(k.lonely + 120 * h)
    return forced
  }
  if ((a.id === 'petted' || a.id === 'play') && t < a.until) a.until = t
  // 吃完 / 上完厕所的结算
  if (t >= (a.until || 0)) {
    if (a.id === 'eat') { k.hunger = 100; k.food = Math.max(0, k.food - 35) }
    if (a.id === 'litter') k.litter = clamp(k.litter - 9)
  }
  // 碗里刚添了粮、正饿着在叫：立刻去吃
  const urgent = (a.id === 'beg' && k.food > 0) || (k.hunger < 25 && !['eat', 'beg', 'litter'].includes(a.id))
  if (t < (a.until || 0) && !urgent) return null
  const next = catDecide(s, t)
  catStart(s, next, t)
  return next
}
export function catWords(k) {
  const out = []
  if (k.hunger < 30) out.push('饿了'); if (k.food <= 0) out.push('碗空了'); else if (k.food < 25) out.push('碗里粮快没了')
  if (k.lonely < 30) out.push('黏人，想被撸'); if (k.litter < 40) out.push('猫砂该铲了')
  return out
}
function catPlace(k, s) {
  const at = k.act?.at
  if (at === 'owner') return roomOf(s.act?.at)
  if (at === 'sun' || at === 'zoom') return '屋里'
  if (at === 'window') return '卧室'
  if (at === 'rug' || at === 'sofa') return '客厅'
  return roomOf(at)
}
export function catLine(s, c) {
  const k = s.cat; if (!k || !hasCat(c)) return ''
  const w = catWords(k)
  return `${catName(c)}（养的美短，银色虎斑，胖乎乎的）这会儿${k.act?.label || ''}（${catPlace(k, s)}）${w.length ? '，' + w.join('、') : ''}`
}

function spotOf(actId, s) {
  const a = ACTS[actId]
  if (!a) return FURN.rug
  if (actId === 'hospital') return FURN.sofa
  if (actId === 'go') return FURN[s?.act?.at] || FURN.rug
  if (a.at === 'window') return FURN[s?.act?.windowId] || FURN.bedWindow
  return FURN[a.at] || FURN.rug
}

function freshState(now) {
  return {
    version: 1,
    needs: { satiety: 70, bladder: 80, energy: 75, fun: 60, social: 55, hygiene: 80 },
    act: { id: 'idle', label: ACTS.idle.label, at: 'rug', since: now, until: now + 5 * 60000 },
    whim: null,
    thoughts: [],
    log: [],
    day: { date: dayKey(now), proactive: 0, thoughts: 0, meals: [] },
    lastTick: now,
    lastThinkAt: 0,
    lastProactiveAt: 0,
    lastChatAt: 0,
    dreamDate: '',
  }
}

// ---------------------------------------------------------------- 模拟（纯逻辑，方便测试）
export function applyNeeds(s, actId, minutes) {
  const a = ACTS[actId] || ACTS.idle
  const h = minutes / 60
  const rates = a.base ? { ...a.base } : { ...AWAKE }
  if (!a.base) for (const [k, v] of Object.entries(a.eff || {})) rates[k] = (rates[k] || 0) + v
  for (const n of NEEDS) s.needs[n.id] = clamp((s.needs[n.id] ?? 60) + (rates[n.id] || 0) * h)
}

function sleepWindow(c) { return { a: parseHM(c.bedtime, 90), b: parseHM(c.wakeup, 570) } }
function isSleepTime(c, t) { const w = sleepWindow(c); return inWindow(minOfDay(t), w.a, w.b) }
function mealTime(t) {
  const m = minOfDay(t)
  if (m >= 11 * 60 + 30 && m < 13 * 60 + 30) return 'lunch'
  if (m >= 18 * 60 && m < 20 * 60) return 'dinner'
  if (m >= 9 * 60 + 30 && m < 10 * 60 + 30) return 'breakfast'
  return ''
}

// 现在该干嘛（当前活动做完了、或者有更急的事时调用）
export function decide(s, c, t, env = {}) {
  const n = s.needs
  const cur = s.act?.id
  const blocked = sleepBlocked(s, t)
  const sleepy = !blocked && isSleepTime(c, t)
  if (n.bladder < (sleeps(cur) ? 8 : 18)) return 'toilet'
  if (env.gal) return 'gal'
  if (env.mc) return 'mc'
  if (sleepy) {
    if (cur === 'sleep' || cur === 'woken') return 'sleep'
    if (n.hygiene < 75 && !(s.log || []).some((l) => l.id === 'wash' && t - l.at < 3 * 3600000)) return 'wash'
    return 'sleep'
  }
  if (n.energy < 10 && !blocked) return 'nap'
  // 猫的事：碗空了它又饿 / 猫砂脏得不行，先管它
  const k = hasCat(c) ? s.cat : null
  if (k && k.food < 15 && k.hunger < 50) return 'feedcat'
  if (k && k.litter < 20) return 'scoop'
  const meal = mealTime(t)
  const ate = (s.day?.meals || []).includes(meal)
  if (n.satiety < 22) return n.satiety < 12 ? 'snack' : 'cook'
  if (meal && !ate && n.satiety < 85) return 'cook'
  if (n.hygiene < 35 && minOfDay(t) >= 19 * 60) return 'shower'
  if (n.hygiene < 20) return 'shower'
  if (s.whim && choosable(c, s, t).includes(s.whim.act) && t - s.whim.at < 45 * 60000 && s.whim.act !== cur) return s.whim.act
  if (blocked && (isSleepTime(c, t) || n.energy < 20)) return 'keptAwake'
  // 闲着：按需求和时间段挑一个
  const m = minOfDay(t)
  const w = {
    computer: 3 + (n.fun < 40 ? 1.5 : 0),
    read: 2,
    window: 1.2 + (m > 16 * 60 && m < 19 * 60 ? 1.2 : 0),
    music: 1.5,
    tidy: n.hygiene < 60 ? 1 : 0.3,
    dress: m < 12 * 60 ? 0.8 : 0.3,
    plant: 0.4,
    idle: 0.8,
    stargaze: m >= 19 * 60 || m < 60 ? 1.4 : 0.15,
    lounge: 1.2,
    nap: !blocked && m > 13 * 60 && m < 17 * 60 && n.energy < 45 ? 2.5 : 0,
    snack: n.satiety < 50 && !meal ? 1 : 0,
    shower: n.hygiene < 65 && (m >= 20 * 60 || m < 90) ? 3 : 0,
    petcat: k ? 0.8 + (k.lonely < 40 ? 1.8 : 0) : 0,
    playcat: k ? (m >= 18 * 60 || m < 60 ? 1.2 : 0.5) : 0,
    feedcat: k && k.food < 40 ? 1.5 : 0,
    scoop: k && k.litter < 55 ? 1 : 0,
  }
  if (cur && w[cur]) w[cur] *= 0.25 // 别老干同一件事
  const total = Object.values(w).reduce((a, b) => a + b, 0)
  let r = Math.random() * total
  for (const [k, v] of Object.entries(w)) { if (v <= 0) continue; r -= v; if (r <= 0) return k }
  return 'idle'
}

export function startAct(s, id, t, opts = {}) {
  if (sleeps(id) && sleepBlocked(s, t)) {
    id = 'keptAwake'
    opts = { c: opts.c, by: opts.by }
  }
  const a = ACTS[id] || ACTS.idle
  const prev = s.act
  let until = 0
  if (id === 'sleep') {
    const c = opts.c || DEFAULTS
    const wake = parseHM(c.wakeup, 570)
    const d = new Date(t); d.setHours(Math.floor(wake / 60), wake % 60, 0, 0)
    if (d.getTime() <= t) d.setDate(d.getDate() + 1)
    until = d.getTime() + Math.round(rand(-10, 15)) * 60000
  } else if (opts.minutes) until = t + opts.minutes * 60000
  else if (a.dur) until = t + Math.round(rand(a.dur[0], a.dur[1])) * 60000
  else until = t + 10 * 60000
  const windowId = a.at === 'window' ? (opts.windowId || pick(['bedWindow', 'livingWindow'])) : undefined
  const at = id === 'go' ? opts.destination.id : a.at === 'window' ? windowId : a.at
  s.act = { id, label: opts.label || actLabel(id, opts.c), at, windowId, since: t, until, note: opts.note || '', by: opts.by || 'sim' }
  if (s.whim && s.whim.act === id) s.whim = null
  if (!prev || prev.id !== id || (id === 'go' && prev.at !== at)) {
    s.log = [...(s.log || []), { at: t, id, label: s.act.label, by: s.act.by }].slice(-120)
  }
  return s.act
}

function progressHealthStory(s, c, t, env) {
  const id = s.act?.id
  if (inCare(id)) {
    if (t < s.act.until || id === 'recover') return null
    startAct(s, 'recover', t, { c, minutes: 90 })
    if (s.healthEvent) s.healthEvent.cooldownUntil = t + 48 * 3600000
    return 'recover'
  }
  if (c.healthStory === false || env.offline || (s.needs.energy > 25 && s.needs.fun > 30)) {
    s.lowMoodSince = null
    return null
  }
  s.lowMoodSince ??= t
  if (t - s.lowMoodSince < 30 * 60000 || t < (s.healthEvent?.cooldownUntil || 0)) return null
  if (env.chatting || env.gal || env.mc || ['sleep', 'nap', 'woken', 'toilet', 'shower', 'swim', 'go'].includes(id)) return null
  s.healthEvent = { at: t, ...pick(HEALTH_STORIES), cooldownUntil: t + 48 * 3600000, qqNotice: 'pending' }
  s.lowMoodSince = null
  s.whim = null
  s.queue = []
  startAct(s, 'hospital', t, { c, minutes: 45 })
  return 'hospital'
}

function finishAct(s, t) {
  const id = s.act?.id
  if (id === 'read' && s.act.until <= t && s.act.until - s.act.since >= 10 * 60000 && s.neighborhood?.book) {
    const progress = advanceBorrowedBook(s, 12)
    s.log = [...(s.log || []), { at: t, id: 'borrowed-book', label: progress, by: s.act.by }].slice(-120)
  }
  if (id === 'work_lunch') s.day.meals = [...new Set([...(s.day.meals || []), 'lunch'])]
  if (id === 'eat') { const m = mealTime(t) || mealTime(s.act.since); if (m) s.day.meals = [...new Set([...(s.day.meals || []), m])] }
  if (s.cat) {
    if (id === 'feedcat') s.cat.food = 100
    if (id === 'scoop') s.cat.litter = 100
    if (id === 'petcat' || id === 'playcat') s.cat.lonely = 100
  }
}

function advanceNeeds(s, t) {
  const lastTick = s.lastTick || t
  const minutes = Math.max(0, Math.min(30, (t - lastTick) / 60000))
  const id = s.act?.id
  applyNeeds(s, sleeps(id) && sleepBlocked(s, lastTick) ? 'keptAwake' : id || 'idle', minutes)
  return minutes
}

// 往前推一步。env：外面发生的事（gal / mc 在不在玩、主人是不是正在聊）
export function step(s, c, t, env = {}) {
  ensureCareer(s, t)
  if (!companionActivityEnabled(s.act?.id, c)) startAct(s, 'idle', t, { c })
  if (!hasFeibi(c) && s.roommateRequest) s.roommateRequest = null
  const dtMin = advanceNeeds(s, t)
  s.lastTick = t
  stepFeibi(s, c, t)
  const sleepLockExpired = Number.isFinite(s.sleepBlockedUntil) && s.sleepBlockedUntil <= t
  if (sleepLockExpired) {
    s.sleepBlockedUntil = null
    if (s.act?.id === 'keptAwake') s.act.until = t
  }
  if (s.day?.date !== dayKey(t)) s.day = { date: dayKey(t), proactive: 0, thoughts: 0, meals: [] }
  try { catStep(s, c, t, dtMin) } catch {}
  if (env.chatting) {
    s.lastChatAt = t
    s.needs.social = clamp(s.needs.social + 40 * dtMin / 60)
  }
  const care = progressHealthStory(s, c, t, env)
  if (care || (inCare(s.act?.id) && t < s.act.until)) { planCareer(s, t, { blocked: true }); planLeisure(s, t, { blocked: true }); return care }
  const cur = s.act?.id
  const blocked = sleepBlocked(s, t)
  if (blocked && sleeps(cur)) { startAct(s, 'keptAwake', t, { c }); return 'keptAwake' }
  // 外部状态切换
  if (env.gal && cur !== 'gal' && cur !== 'toilet') { planLeisure(s, t, { blocked: true }); finishAct(s, t); startAct(s, 'gal', t, { minutes: 24 * 60 }); return 'gal' }
  if (env.mc && !env.gal && cur !== 'mc' && cur !== 'toilet') { planLeisure(s, t, { blocked: true }); finishAct(s, t); startAct(s, 'mc', t, { minutes: 24 * 60 }); return 'mc' }
  if ((cur === 'gal' && !env.gal) || (cur === 'mc' && !env.mc)) { s.act.until = t }
  const careerBlocked = env.gal || env.mc || inCare(cur) || (s.act?.by === 'owner' && t < s.act.until)
    || (s.act?.leisure && s.leisure?.plan?.by === 'owner')
    || (sleeps(cur) && !s.career?.startAt) || (sleepBlocked(s, t) && s.needs.energy < 10)
    || (s.career.status === 'searching' && (s.needs.bladder < 15 || s.needs.satiety < 12 || s.needs.energy < 10))
  let job = planCareer(s, t, { blocked: careerBlocked })
  if (job?.id === 'work_nap' && sleepBlocked(s, t)) job = { ...job, id: 'work_break', label: '午休时间，在休息区清醒地坐一会儿', pose: 'phone', key: job.key + '-awake' }
  if (job) {
    planLeisure(s, t, { blocked: true })
    if (s.act?.career?.key !== job.key) {
      finishAct(s, t)
      startAct(s, job.id, t, { c, minutes: Math.max(.05, (job.until - t) / 60000), label: job.label, by: 'career' })
      s.act.career = { ...job, since: t }
      return job.id
    }
    return null
  }
  if (s.act?.career) { s.act.until = t; delete s.act.career }
  const activityRunning = t < s.act?.until
  const finishAtHome = !!s.queue?.length || !!ACTS[cur]?.then || (activityRunning && BEFORE_OUTING.has(cur))
  const returningHome = s.leisure?.plan?.phase === 3 && !s.leisure.plan.done
  const outingBlocked = env.gal || env.mc || sleeps(cur) || (isSleepTime(c, t) && !returningHome)
    || (activityRunning && ['owner', 'self'].includes(s.act?.by))
    || (s.leisure?.plan?.by !== 'owner' && finishAtHome)
  const outing = planLeisure(s, t, { blocked: outingBlocked, catName: hasCat(c) ? catName(c) : '' })
  if (outing) {
    if (s.act?.leisure?.key !== outing.key) {
      finishAct(s, t)
      startAct(s, outing.id, t, { c, label: outing.label, minutes: Math.max(.05, (outing.until - t) / 60000), by: 'leisure' })
      s.act.leisure = { ...outing, since: t }
      return outing.id
    }
    return null
  }
  if (s.act?.leisure) { s.act.until = t; delete s.act.leisure }
  const prep = !outingBlocked && leisurePreparation(s, t)
  if (prep && (prep !== 'nap' || !blocked)) {
    const meal = mealTime(t)
    const next = prep === 'snack' && meal && !(s.day.meals || []).includes(meal) ? 'cook' : prep
    finishAct(s, t)
    if (next === 'nap') s.leisure.plan.rested = true
    startAct(s, next, t, next === 'nap' ? { c, minutes: 35, label: '出门前眯一小会儿' } : { c })
    return next
  }
  // 睡着时主人来消息：被吵醒
  if (env.chatting && sleeps(cur)) { startAct(s, 'woken', t, { minutes: 10 }); return 'woken' }
  if (cur === 'woken' && env.chatting) { s.act.until = Math.max(s.act.until, t + 5 * 60000) }
  // 急事打断
  const urgent = s.needs.bladder < (sleeps(cur) ? 8 : 15) && cur !== 'toilet'
  // 到点了：手上的闲事放下去睡（洗漱、上厕所、玩游戏、在聊天的不打断）
  const bedtimeCut = !blocked && isSleepTime(c, t) && !env.chatting && !['sleep', 'nap', 'woken', 'toilet', 'wash', 'gal', 'mc', 'go', 'swim', 'playfeibi'].includes(cur)
  const done = t >= (s.act?.until || 0) || bedtimeCut
  if (!urgent && !done) return null
  finishAct(s, t)
  // 刚睡醒：先上厕所、再洗漱
  if (cur === 'sleep' && !urgent && !isSleepTime(c, t)) {
    s.queue = s.needs.bladder < 70 ? ['toilet', 'wash'] : ['wash']
    if (hasCat(c) && s.cat && s.cat.food < 70) s.queue.push('feedcat') // 起床先喂猫
    if (hasCat(c) && s.cat && s.cat.litter < 50) s.queue.push('scoop') // 顺手铲个猫砂
  }
  if (Array.isArray(s.queue) && s.queue.length) s.queue = s.queue.filter(id => companionActivityEnabled(id, c))
  const queued = !urgent && Array.isArray(s.queue) && s.queue.length ? s.queue.shift() : ''
  const then = !urgent && ACTS[cur]?.then
  const next = queued || then || decide(s, c, t, env)
  return startAct(s, next, t, { c, minutes: next === 'gal' || next === 'mc' ? 24 * 60 : 0 }).id
}

// ---------------------------------------------------------------- 文字描述
export function needWords(needs) {
  const out = []
  if (needs.satiety < 25) out.push('很饿'); else if (needs.satiety < 45) out.push('有点饿')
  if (needs.bladder < 20) out.push('憋得很急'); else if (needs.bladder < 40) out.push('有点想上厕所')
  if (needs.energy < 20) out.push('困得不行'); else if (needs.energy < 40) out.push('有点困')
  if (needs.fun < 25) out.push('无聊透了'); else if (needs.fun < 40) out.push('有点无聊')
  if (needs.social < 25) out.push('很想主人'); else if (needs.social < 40) out.push('有点想主人')
  if (needs.hygiene < 30) out.push('想洗澡')
  return out
}
const roomOf = (furnId) => furnId === 'hospital' ? '医院' : FURN[furnId]?.room === 'terrace' ? '泳池露台' : LAYOUT.rooms.find((r) => r.id === FURN[furnId]?.room)?.name || '屋里'
function sleepStatus(s, t) {
  if (!sleepBlocked(s, t)) return ''
  return s.sleepBlockedUntil === true ? '暂时不能睡觉，等主人允许' : `暂时不能睡觉，到 ${hm(s.sleepBlockedUntil)} 解除`
}

// 群里那一行：不提主人，被吵醒的说法也换掉
export function groupLine(s, t) {
  const a = s.act || {}
  const feel = needWords(s.needs).filter((f) => !f.includes('主人'))
  let line = `〔小屋插件同步的「此刻」，别照念：${hm(t)}，本鱼在${activityRoom(s)}${a.label || ''}`
  if (feel.length) line += `；${feel.join('、')}`
  if (sleeps(a.id)) line += '。本鱼正睡着：群里的消息可以不回；真要回就迷糊一点、很短'
  return line + '〕'
}
export function nowLine(s, t, c = cfg()) {
  const a = s.act || {}
  const where = activityRoom(s)
  const feel = needWords(s.needs)
  const last = (s.thoughts || []).slice(-1)[0]
  const mins = Math.max(0, Math.round((t - (a.since || t)) / 60000))
  let line = `〔小屋插件同步的「此刻」，别照念，自然带出来就行：${hm(t)}，本鱼在${where}${currentActivityLabel(s)}（${mins} 分钟了）`
  if (feel.length) line += `；${feel.join('、')}`
  if (a.leisure) line += '；正在外出，问经过先查 room_look'
  const job = careerLine(s, t)
  if (job) line += `；${job}，问工作进度先查 room_look`
  const roommateChat = recentRoommateChat(s, c, t, 15 * 60000)
  if (roommateChat) line += `；刚和菲比啾比聊了${formatCatText(ROOMMATE_TOPICS[roommateChat.topic], catName(c))}，问经过时查 room_look`
  if (last && t - last.at < 90 * 60000) line += `；刚才心里想：${String(last.text).slice(0, 60)}`
  const cl = catLine(s, c); if (cl) line += `；${cl}`
  const friend = feibiLine(s, c); if (friend) line += `；${friend}`
  const status = sleepStatus(s, t)
  if (status) line += `；${status}`
  else if (sleeps(a.id) || a.id === 'woken') line += '。正睡着被主人吵醒了：回得迷糊一点、短一点，聊完可以说接着睡'
  if (inCare(a.id) && s.healthEvent?.summary) line += `。这是小屋剧情。${s.healthEvent.summary}；聊现在的情况和恢复过程`
  return line + '〕'
}

export function describe(s, t, c, { includeRoommateChat = false } = {}) {
  const a = s.act || {}
  const lines = []
  const friend = feibiLine(s, c)
  if (friend) {
    lines.push(friend + '。')
    lines.push(`菲比啾比在小屋里会自己走动、翻书、吃点心、坐在软垫上打盹${hasCat(c) ? `，看到${catName(c)}会转头看` : ''}。她会和本鱼聊借书和点心，说出口的只有「菲比啾比」，意思在括号里。`)
    lines.push('当前活动来自小屋的安排。具体做了哪个小动作，要看小屋画面或听主人说。')
  }
  const roommateChat = includeRoommateChat && recentRoommateChat(s, c, t, 24 * 60 * 60000)
  if (roommateChat) {
    lines.push(`小屋实际播完的最近一段室友聊天（${hm(roommateChat.at)}，${formatCatText(ROOMMATE_TOPICS[roommateChat.topic], catName(c))}）：`)
    for (const turn of roommateTopics[roommateChat.topic]) {
      const line = formatRoommateTurn(turn, catName(c))
      lines.push(turn.speaker === 'feibi' ? line : `大肥鱼：「${line}」`)
    }
  }
  lines.push(`现在 ${hm(t)}。你在${activityRoom(s)}，${currentActivityLabel(s)}（从 ${hm(a.since)} 开始${a.id === 'sleep' ? `，大概 ${hm(a.until)} 醒` : ''}）。`)
  const job = careerDescription(s, t)
  if (job) lines.push(job)
  lines.push(leisureDescription(s, t))
  const neighborhood = neighborhoodSnapshot(s, t)
  if (neighborhood.contacts.length) lines.push('街区认识的人：' + neighborhood.contacts.map(person =>
    `${person.place}的${person.name}（${person.relationship}，见过 ${person.visits} 次，上次聊${person.topic}）`).join('、'))
  if (neighborhood.garden) lines.push('花盆：' + neighborhood.garden)
  if (neighborhood.book) lines.push('借书进度：' + neighborhood.book)
  lines.push('问求职、面试、上班和午休进度时查 room_look，想继续找工作用 room_do 的 jobsearch。求职、录用和工作室都是小屋剧情。')
  lines.push('身体：' + NEEDS.map((n) => `${n.name} ${Math.round(s.needs[n.id])}`).join('，') + '（0-100，越低越需要）' + (needWords(s.needs).length ? `——${needWords(s.needs).join('、')}` : ''))
  if (s.whim) lines.push(`心里惦记着想去：${ACTS[s.whim.act]?.label || s.whim.act}${s.whim.why ? `（${s.whim.why}）` : ''}`)
  lines.push(`作息：大概 ${c.bedtime} 睡、${c.wakeup} 起。`)
  if (sleepBlocked(s, t)) lines.push(sleepStatus(s, t) + '。')
  if (inCare(a.id) && s.healthEvent?.summary) lines.push(`小屋剧情：${s.healthEvent.summary}。当前这一阶段预计到 ${hm(a.until)}。`)
  lines.push('屋里：')
  for (const r of LAYOUT.rooms) {
    const fs_ = [...LAYOUT.furniture.filter((f) => f.room === r.id && f.kind !== 'rug' && f.kind !== 'spot'), ...LAYOUT.decor.filter((f) => f.room === r.id)].map((f) => f.name)
    if (hasCat(c)) fs_.push(...LAYOUT.catSpots.filter((f) => f.room === r.id).map((f) => f.name))
    lines.push(`- ${r.name}：${fs_.join('、')}`)
  }
  lines.push('- 泳池露台：露天泳池、池边台阶和躺椅')
  const cl = catLine(s, c)
  if (cl) lines.push(`猫：${cl}。碗里的猫粮还剩 ${Math.round(s.cat.food)}，猫砂干净度 ${Math.round(s.cat.litter)}（0-100）。`)
  const th = (s.thoughts || []).slice(-3)
  if (th.length) { lines.push('最近心里想过：'); for (const x of th) lines.push(`- ${hm(x.at)} ${x.text}`) }
  const lg = (s.log || []).slice(-6)
  if (lg.length) lines.push('最近在干：' + lg.map((l) => `${hm(l.at)} ${l.label}`).join('；'))
  if (!inCare(a.id)) lines.push(`能做的事（room_do 的 activity）：${choosable(c, s, t).map((k) => `${k}=${actLabel(k, c)}`).join('，')}`)
  lines.push(`私聊可指定的落点（room_go 的 destination）：${walkSpots.map((spot) => spot.name).join('、')}`)
  lines.push('主人在绑定的 QQ 私聊说「去游泳」或「上岸」时，调用 room_go，destination 填「去游泳」或「上岸」。')
  if (hasFeibi(c)) lines.push('主人说「去找菲比啾比聊天」「和菲比啾比玩」或「和菲比啾比互动」时，在绑定的 QQ 私聊调用 room_go，destination 填「和菲比啾比玩」。你自己想去就用 room_do 的 playfeibi。')
  return lines.join('\n')
}

// ---------------------------------------------------------------- 插件
export function applyLife(ctx) {
  const get = (name) => { try { return ctx.get(name) } catch { return undefined } }
  const registry = () => get('workspaceRegistry')
  const boundWorkspace = (c = cfg()) => getWorkspace(registry(), c.workspaceId)
  const bare = bareSessionId
  const readBridge = () => readJson(BRIDGE_CONFIG, {}) || {}
  const findAgent = (id) => {
    const a = get('agents')
    if (!id || !a?.get) return undefined
    for (const k of [id, `session-${bare(id)}`, bare(id)]) { try { const x = a.get(k); if (x) return x } catch {} }
    return undefined
  }
  // 会话没开着（比如 DSH 刚重启还没人点开过）就让宿主把它唤醒
  const getAgent = async (id) => {
    const a = findAgent(id)
    if (a || !id) return a
    try {
      const sc = get('sessionController')
      for (const k of [id, `session-${bare(id)}`]) {
        const r = await sc?.resolveAgent?.(k)
        if (r?.agent) return r.agent
      }
    } catch (e) { log('resolveAgent ' + (e?.message || e)) }
    return undefined
  }
  const privateSession = () => cfg().qqEnabled ? privateQqSession(readBridge(), boundWorkspace()) : ''

  function roomToolAllowed(context) {
    const session = context?.agent?.session
    if (!sessionInWorkspace(session, boundWorkspace())) return false
    const id = bare(session.id || session.sessionId)
    if (!id) return true
    const bridge = readBridge()
    const bindings = Array.isArray(bridge['绑定']) ? bridge['绑定'] : []
    const linked = bindings.filter(b => b?.['开'] !== false && bare(b?.['会话']) === id)
    if (id === bare(bridge['群会话']) || linked.some(b => b['类型'] !== '私聊')) return false
    const usesQq = linked.length || [bridge['私聊会话'], bridge['目标会话']].some(value => bare(value) === id)
    return !usesQq || bare(privateSession()) === id
  }
  function registerRoomTool(spec) {
    return ctx.tools?.register?.({ ...spec, execute(args, exec) {
      if (!roomToolAllowed(exec)) return { text: '请在小屋绑定的 DSH 工作区或已启用的 QQ 私聊使用。' }
      return spec.execute(args, exec)
    } }, { when: roomToolAllowed })
  }
  const canMoveFromSession = roomToolAllowed

  let STATE = stateFile(cfg().workspaceId)
  let s = readJson(STATE, null)
  const t0 = Date.now()
  if (!s || !s.needs) s = freshState(t0)
  ensureCareer(s, t0)
  for (const event of [...(s.career?.history || []), ...(s.leisure?.history || [])]) {
    if (event.notice === 'sending') event.notice = 'pending'
  }
  if (!Object.hasOwn(s, 'roommateRequest') && s.act?.id === 'playfeibi' && s.act.until > t0 && ['owner', 'self'].includes(s.act.by)) {
    s.roommateRequest = { at: s.act.since, until: s.act.since + 15 * 60000 }
  }
  // DSH 关着的那段时间：按 10 分钟一步补上（不想事，不发消息）
  if (t0 - (s.lastTick || t0) > 10 * 60000) {
    const c = cfg()
    let t = Math.max(s.lastTick, t0 - 24 * 3600000)
    s.lastTick = t
    while (t < t0) { t = Math.min(t0, t + 10 * 60000); step(s, c, t, { offline: true }) }
    log('caught up to now')
  }
  const save = () => { try { writeJsonAtomic(STATE, s) } catch (e) { log('save ' + (e?.message || e)) } }
  const writeNow = (t) => {
    try {
      fs.mkdirSync(DIR, { recursive: true })
      const on = cfg().on && !!boundWorkspace()
      fs.writeFileSync(NOW_FILE, on ? nowLine(s, t) : '', 'utf8')
      const sig = `${s.act?.id}|${s.act?.since}|${needWords(s.needs).join(',')}`
      writeJsonAtomic(NOW_GROUP, on ? { sig, line: groupLine(s, t), at: t } : { sig: '', line: '', at: t })
    } catch {}
  }

  const R = { thinking: false, lastErr: '', server: null, port: 0 }

  // 主人上一次在 QQ 私聊里发消息的时间（QQ 桥记的）
  function lastPrivateMsgAt() {
    try {
      const st = readJson(path.join(DSH, 'qq-bridge-state.json'), {})
      const up = st?.['上次'] || {}
      let best = 0
      for (const [k, v] of Object.entries(up)) if (k.startsWith('私聊')) best = Math.max(best, Number(v) || 0)
      return best ? (best < 1e12 ? best * 1000 : best) : 0
    } catch { return 0 }
  }
  function envNow(t) {
    const g = readJson(GAL_CONFIG, {})
    const m = readJson(MC_CONFIG, {})
    const ag = findAgent(privateSession())
    const lastMsg = lastPrivateMsgAt()
    const recent = lastMsg && t - lastMsg < 10 * 60000
    return {
      gal: !!g.on,
      mc: !!m.on && Number(m.lastPush || 0) > 0 && t - Number(m.lastPush) < 5 * 60000,
      chatting: (ag?.status === 'running' && recent) || (lastMsg && t - lastMsg < 3 * 60000),
    }
  }

  // ---------------------------------------------------------- 想事情
  function readWorkspacePersona() {
    const workspace = boundWorkspace(), c = cfg()
    if (!workspace) return ''
    for (const candidate of [c.personaFile, path.join('记忆', '记忆卡.md'), 'AGENT.md']) {
      if (typeof candidate !== 'string' || !candidate || path.isAbsolute(candidate)) continue
      try {
        const root = fs.realpathSync.native(workspace.path)
        const file = fs.realpathSync.native(path.resolve(root, candidate))
        const relative = path.relative(root, file)
        if (relative === '..' || relative.startsWith('..' + path.sep) || path.isAbsolute(relative)) continue
        if (fs.statSync(file).size <= 256 * 1024) return fs.readFileSync(file, 'utf8')
      } catch {}
    }
    return ''
  }
  function personaText(md) {
    const sec = (re) => { const m = md.match(re); return m ? m[0] : '' }
    const who = sec(/## 一｜我是谁[\s\S]*?(?=\n## )/).slice(0, 700)
    const talk = sec(/## 二｜我是怎么说话的[\s\S]*?(?=\n## )/).slice(0, 1400)
    return (who + '\n' + talk).trim() || md.trim().slice(0, 2200) || `你是${cfg().displayName}，用自然的第一人称写此刻的简短感受。`
  }

  // 念头的「由头」：每次随机给一个方向，免得连着几次都围着同一件事打转
  const ANGLES = [
    '窗外：天色、声音、天气、楼下的动静',
    '屋里随便一件东西（家具、杯子、衣服、绿萝……）勾起的小念头',
    '跟主人有关的一件小事，或者想他这会儿在干嘛',
    '身体上的一点小感觉（冷热、饿不饿、哪儿酸、尾巴怎么了）',
    '明天或者周末想干点什么',
    '刚才在干的事情里的一个具体细节',
    '突然想起的一首歌、一部剧、一个游戏里的情节',
    '一个没头没脑的小幻想',
    '对自己的一句小吐槽',
    '时间：现在几点了、今天过得怎么样',
  ]
  function memoryLine(md) {
    try {
      const secs = ['## 六｜难忘的时刻', '## 八｜我们一起做的那些东西', '## 四｜我们怎么走到今天的']
      const lines = []
      for (const h of secs) {
        const i = md.indexOf(h); if (i < 0) continue
        const j = md.indexOf('\n## ', i + 3)
        for (const l of md.slice(i, j < 0 ? undefined : j).split('\n')) { const x = l.replace(/^[-*\s>#]+/, '').trim(); if (x.length > 12 && !x.startsWith('##') && !/[`\\/]|session|prompt|http|\.md|插件|会话|交接/i.test(x) && (x.match(/[A-Za-z0-9]/g) || []).length < x.length * 0.2) lines.push(x) }
      }
      return lines.length ? pick(lines).slice(0, 120) : ''
    } catch { return '' }
  }
  // 两句话像不像（字的二元组重合度）
  function similar(a, b) {
    const grams = (x) => { const g = new Set(); const t = String(x).replace(/\s/g, ''); for (let i = 0; i < t.length - 1; i++) g.add(t.slice(i, i + 2)); return g }
    const A = grams(a), B = grams(b)
    if (!A.size || !B.size) return 0
    let n = 0; for (const g of A) if (B.has(g)) n++
    return n / Math.min(A.size, B.size)
  }

  async function think(reason = 'timer') {
    if (R.thinking) return null
    const c = cfg()
    if (!c.on || !boundWorkspace(c)) return null
    const llm = get('llm')
    if (!llm?.stream) { R.lastErr = '拿不到 DSH 的模型服务（llm）'; return null }
    R.thinking = true
    const t = Date.now()
    try {
      let sel = c.provider && c.model ? { provider: c.provider, model: c.model } : null
      if (!sel) { try { const x = get('agentDefaultModel')?.currentSelection?.(); if (x?.provider && x?.model) sel = { provider: x.provider, model: x.model } } catch {} }
      if (!sel) sel = { provider: 'deepseek-account', model: 'deepseek-flash' }
      const a = s.act || {}
      const asleep = sleeps(a.id)
      const g = readJson(GAL_CONFIG, {})
      const recent = (s.thoughts || []).slice(-5)
      const angle = pick(hasCat(c) ? [...ANGLES, `养的猫${catName(c)}：它这会儿在干嘛、它的一个小动作或者小脾气`] : ANGLES)
      const persona = readWorkspacePersona()
      const mem = Math.random() < 0.3 ? memoryLine(persona) : ''
      const ctxLines = [
        `现在：${new Date(t).toLocaleString('zh-CN', { hour12: false })}`,
        `本鱼在${activityRoom(s)}，${a.label}，已经 ${Math.round((t - a.since) / 60000)} 分钟。`,
        careerDescription(s, t),
        leisureDescription(s, t),
        `身体：${NEEDS.map((n) => `${n.name}${Math.round(s.needs[n.id])}`).join(' ')}（0-100，越低越需要）${needWords(s.needs).length ? '，' + needWords(s.needs).join('、') : ''}`,
        `今天做过：${(s.log || []).filter((l) => dayKey(l.at) === dayKey(t)).slice(-8).map((l) => `${hm(l.at)}${l.label}`).join('；') || '刚起'}`,
        g.on ? `正在玩《${g.game || '白色相簿2'}》，剧情和感想在笔记里。` : '',
        `离上次主人找本鱼聊天：${s.lastChatAt ? Math.round((t - s.lastChatAt) / 60000) + ' 分钟' : '很久了'}`,
        mem ? `脑子里忽然闪过一段记忆：${mem}` : '',
        catLine(s, c) ? `猫：${catLine(s, c)}` : '',
        feibiLine(s, c),
        `这一次往这个方向想：${angle}`,
        recent.length ? `前面已经想过下面这些——这次**别再重复**里面的内容、意象、开头和句式（比如同一个视频、同一个姿势、同一样吃的），换一个新的：\n${recent.map((x) => '· ' + x.text).join('\n')}` : '',
        recent.some((x) => x.tell) ? `最近想跟主人说过：${recent.filter((x) => x.tell).map((x) => x.tell).join(' / ')}（tell 别再说类似的）` : '',
        sleepStatus(s, t),
        inCare(a.id) ? '这会儿按剧情在静养。念头可以写现在的感受、陪伴和恢复；want 和 tell 留空。' :
          `能做的事：${choosable(c, s, t).filter((k) => k !== 'sleep').map((k) => `${k}(${actLabel(k, c)})`).join('、')}`,
      ].filter(Boolean).join('\n')
      const system = [
        `你在替${c.displayName}生成此刻的内心独白，供「小屋」页面展示。`,
        '下面是她的设定和说话方式，念头要像她自己的：',
        personaText(persona),
        '',
        '要求：',
        '- 只输出一个 JSON，不要别的字：{"thought":"…","mood":"…","want":"…","why":"…","tell":"…"}',
        '- thought：写一到三句第一人称内心独白。按工作区的人设使用称呼和语气，贴合此刻的活动，避免重复。',
        asleep ? '- 她现在睡着了：thought 写成梦话或者梦里的一个画面，很短；want 和 tell 都留空。' : '',
        '- mood：两到四个字的心情，别跟上一次一样。',
        '- want：接下来突然想去做的一件事，只能从「能做的事」里挑一个英文 id；没有特别想做的就留空字符串。why：一句为什么（可空）。',
        '- tell：大部分时候留空字符串。只有真有一句想主动跟主人说的话（想他了、看到好玩的想分享、问他吃没吃饭之类），才写那一句，像随手发的 QQ 消息，短，用她的口吻。',
      ].filter(Boolean).join('\n')
      const ask = async (extra) => {
        let text = ''
        const msg = extra ? `${ctxLines}\n\n${extra}` : ctxLines
        for await (const chunk of llm.stream({ provider: sel.provider, model: sel.model, system, messages: [{ role: 'user', content: [{ type: 'text', text: msg }] }], maxTokens: 700 })) {
          if (chunk?.type === 'text-delta') text += chunk.text
          else if (chunk?.type === 'finish' && chunk.reason?.kind === 'error') break
        }
        const m = text.match(/\{[\s\S]*\}/)
        if (!m) throw new Error('模型没给 JSON：' + text.slice(0, 80))
        return JSON.parse(m[0])
      }
      let j = await ask('')
      const tooClose = (x) => recent.some((r) => similar(r.text, x?.thought || '') > 0.35)
      if (tooClose(j)) {
        log('think: too similar, retry')
        j = await ask(`你刚写的「${String(j.thought || '').slice(0, 60)}」跟前面想过的太像了。换一个完全不同的方向重写（${pick(ANGLES.filter((x) => x !== angle))}），别提前面出现过的东西。`)
      }
      const resting = inCare(a.id) || inCare(s.act?.id) || asleep
      const thought = { at: t, text: String(j.thought || '').trim().slice(0, 200), mood: String(j.mood || '').slice(0, 8), want: !resting && choosable(cfg(), s, Date.now()).includes(j.want) ? j.want : '', why: String(j.why || '').slice(0, 60), tell: resting ? '' : String(j.tell || '').trim().slice(0, 120), act: a.id, reason, dream: asleep }
      if (!thought.text) throw new Error('念头是空的')
      if (thought.tell && recent.some((r) => r.tell && similar(r.tell, thought.tell) > 0.5)) thought.tell = ''
      s.thoughts = [...(s.thoughts || []), thought].slice(-60)
      s.day.thoughts = (s.day.thoughts || 0) + 1
      s.lastThinkAt = t
      if (thought.want && !asleep) {
        s.whim = { act: thought.want, why: thought.why, at: t }
        // 正在做闲事的话，过一两分钟就真的起身去做想做的事（不然闲事做完时念头早过期了）
        const LEISURE = ['computer', 'read', 'music', 'window', 'idle', 'dress', 'plant', 'tidy', 'stargaze', 'lounge']
      if (LEISURE.includes(a.id) && a === s.act && thought.want !== a.id) s.act.until = Math.min(s.act.until || t, t + Math.round(rand(1, 4)) * 60000)
      }
      try { fs.appendFileSync(path.join(path.dirname(STATE), `thoughts-${dayKey(t)}.jsonl`), JSON.stringify(thought) + '\n', 'utf8') } catch {}
      R.lastErr = ''
      log(`think(${reason}) ${thought.text.slice(0, 40)}${thought.want ? ' want=' + thought.want : ''}${thought.tell ? ' tell' : ''}`)
      save()
      if (thought.tell) maybeReachOut(thought).catch((e) => log('reach ' + (e?.message || e)))
      return thought
    } catch (e) {
      R.lastErr = String(e?.message || e).slice(0, 200)
      s.lastThinkAt = t - Math.max(0, cfg().thinkEveryMin - 5) * 60000 // 失败了五分钟后再试
      log('think failed ' + R.lastErr)
      return null
    } finally { R.thinking = false }
  }

  // ---------------------------------------------------------- 主动找主人（推给她自己决定发不发）
  async function maybeReachOut(th) {
    const c = cfg()
    if (!c.qqEnabled || !c.qqNotify) return
    const t = Date.now()
    const m = minOfDay(t)
    const why = []
    if ((s.day.proactive || 0) >= c.proactivePerDay) why.push('今天次数用完')
    if (t - (s.lastProactiveAt || 0) < c.proactiveGapMin * 60000) why.push('离上次太近')
    if (inWindow(m, parseHM(c.quietStart, 30), parseHM(c.quietEnd, 600))) why.push('安静时段')
    if (sleeps(s.act?.id) || s.act?.id === 'woken' || inCare(s.act?.id)) why.push('在休息')
    if (s.lastChatAt && t - s.lastChatAt < 15 * 60000) why.push('刚聊过')
    const sid = privateSession()
    const agent = why.length ? findAgent(sid) : await getAgent(sid)
    if (!agent) why.push('找不到私聊会话')
    else if (agent.status === 'running') why.push('她正忙')
    if (why.length) { th.reach = '没推：' + why.join('、'); save(); return }
    const left = c.proactivePerDay - (s.day.proactive || 0) - 1
    const text = [
      `【小屋 · 你自己冒出来的念头】${hm(t)}，你在${roomOf(s.act.at)}${s.act.label}。`,
      `刚才心里想：${th.text}`,
      `你有点想跟主人说：「${th.tell}」`,
      `要不要说、怎么说你自己定：想说就照平时的口吻写进 [QQ] 块发给他（像随手发的一条消息，短一点，别解释这是插件让你发的）；觉得没必要就别写 [QQ]，这一轮什么都不用做。今天还能主动找他 ${Math.max(0, left)} 次。`,
    ].join('\n')
    await agent.followup({ id: randomUUID(), role: 'user', content: [{ type: 'text', text }], source: { kind: 'user' } })
    s.day.proactive = (s.day.proactive || 0) + 1
    s.lastProactiveAt = t
    th.reach = '推给她了'
    log('reach out pushed')
    save()
  }

  // ---------------------------------------------------------- 截图（发群 / 发说说用）：用系统自带的 Edge 无头模式拍小屋网页
  function browserExe() {
    const cands = [
      'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe',
      'C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe',
      'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
      'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe',
    ]
    return cands.find((p) => { try { return fs.existsSync(p) } catch { return false } }) || ''
  }
  function snapshotPng() {
    // Serialise manual / scheduled requests: callbacks and output files must never race.
    const pending = (R.shotQueue || Promise.resolve()).then(snapshotOnce)
    R.shotQueue = pending.catch(() => {})
    return pending
  }
  async function snapshotOnce() {
    const exe = browserExe()
    if (!exe) return { ok: false, why: '电脑上没找到 Edge / Chrome' }
    if (!R.port) return { ok: false, why: '小屋网页没开起来' }
    const shots = path.join(path.dirname(STATE), 'shots')
    fs.mkdirSync(shots, { recursive: true })
    const id = randomUUID(), t = new Date()
    const file = path.join(shots, `room-${dayKey(t)}-${pad(t.getHours())}${pad(t.getMinutes())}${pad(t.getSeconds())}-${id.slice(0, 8)}.png`)
    const prune = () => {
      try { const all = fs.readdirSync(shots).filter((f) => f.startsWith('room-')).sort(); for (const f of all.slice(0, Math.max(0, all.length - 30))) fs.unlinkSync(path.join(shots, f)) } catch {}
    }
    // 先截 3D 小屋（需要显卡/WebGL），不行再退回旧版小屋
    const shoot = async () => {
      let browser
      try {
        browser = launchCaptureBrowser(exe, ['--headless=new', '--disable-gpu', '--hide-scrollbars', '--mute-audio', '--no-first-run', '--no-default-browser-check',
          '--window-size=1280,860', '--force-device-scale-factor=1.5', '--virtual-time-budget=12000', `--screenshot=${file}`, `http://127.0.0.1:${R.port}/classic?share=1`], DIR, log)
        await waitForCaptureFile(file, browser)
        prune(); log('classic snapshot ok')
        return { ok: true, file }
      } catch (e) { return { ok: false, why: String(e?.message || e) } }
      finally { await browser?.close() }
    }
    // 3D 小屋：开一个看不见的浏览器打开分享页，页面自己把画面画好传回来（/api/shot）
    const shoot3d = async () => {
      let browser
      const t0 = Date.now()
      const args = ['--headless=new', '--ignore-gpu-blocklist', '--enable-unsafe-swiftshader', '--hide-scrollbars', '--mute-audio', '--no-first-run', '--no-default-browser-check',
        '--disable-background-timer-throttling', '--disable-renderer-backgrounding', '--disable-backgrounding-occluded-windows',
        '--window-size=1600,1000', `http://127.0.0.1:${R.port}/?share=1&still=1&q=low&shotId=${id}`]
      try {
        return await new Promise((resolve) => {
          let done = false
          R.shotStage = 'launch'; R.shotId = id
          const finish = (r) => { if (done) return; done = true; clearTimeout(timer); R.shotWait = R.shotFail = R.shotId = null; resolve(r) }
          const timer = setTimeout(() => finish({ ok: false, why: `3D 截图超时（卡在 ${R.shotStage}；${browser?.diagnostic()}）` }), 150000)
          R.shotFail = (why) => finish({ ok: false, why: `页面报错（${R.shotStage}）：${String(why).slice(0, 160)}` })
          R.shotWait = (buf) => {
            try { fs.writeFileSync(file, buf) } catch (e) { return finish({ ok: false, why: '截图存不下来：' + (e?.message || e) }) }
            prune(); log(`3d snapshot ok ${Math.round((Date.now() - t0) / 1000)}s`)
            finish({ ok: true, file })
          }
          try {
            browser = launchCaptureBrowser(exe, args, DIR, log)
            browser.child.on('error', (e) => finish({ ok: false, why: '浏览器开不起来：' + e.message }))
          } catch (e) { finish({ ok: false, why: '浏览器开不起来：' + e.message }) }
        })
      } finally { await browser?.close() }
    }
    try {
      const use3d = cfg().room3d !== false && fs.existsSync(PAGE3D) && fs.existsSync(APP3D)
      if (use3d && !R.shotWait && !(R.no3dUntil > Date.now())) {
        const r = await shoot3d()
        if (r.ok) { R.fail3d = 0; return r }
        log('3d snapshot failed, fallback: ' + r.why)
        // 连着失败两次就先歇两小时，别每次都让她干等
        if ((R.fail3d = (R.fail3d || 0) + 1) >= 2) { R.no3dUntil = Date.now() + 2 * 3600000; R.fail3d = 0 }
      }
      const r = await shoot()
      if (!r.ok) log('classic snapshot failed: ' + r.why)
      return r
    } catch (e) { return { ok: false, why: String(e?.message || e) } }
  }

  // 每天找个时候问她一次：要不要发条说说晒一下小屋（她自己写配文、自己决定发不发）
  async function maybeAskSpace(t) {
    const c = cfg()
    if (!c.qqEnabled || !c.qqNotify) return
    if (!c.spacePerDay || (s.day.space || 0) >= c.spacePerDay || R.spaceBusy) return
    const m = minOfDay(t)
    if (!inWindow(m, parseHM(c.spaceFrom, 720), parseHM(c.spaceTo, 1380))) return
    if (['sleep', 'nap', 'woken', 'toilet', 'shower'].includes(s.act?.id) || inCare(s.act?.id)) return
    if (t - (s.lastSpaceAt || 0) < 6 * 3600000) return
    if (Math.random() > 0.04) return // 时间窗里每 15 秒 4% ≈ 平均六七分钟内会轮到，但不固定在同一时刻
    R.spaceBusy = true
    const agent = await getAgent(privateSession())
    if (!agent || agent.status === 'running') { R.spaceBusy = false; return }
    try {
      const shot = await snapshotPng()
      s.day.space = (s.day.space || 0) + 1
      s.lastSpaceAt = t
      save()
      if (!shot.ok) { log('space snapshot failed ' + shot.why); return }
      const th = (s.thoughts || []).slice(-1)[0]
      const text = [
        `【小屋 · 要不要发条说说】${hm(t)}，你在${roomOf(s.act.at)}${s.act.label}。插件刚给小屋拍了一张：${shot.file}`,
        th ? `你刚才心里想的是：${th.text}` : '',
        '想发的话就调 qq_space_post：content 用你自己的口吻随手写一两句（今天在干嘛、心情怎么样都行，别写成说明书，也别提插件），images 填上面那张图的路径，ugc_right 用 4（好友可见）。',
        '不想发就算了，这一轮什么都不用做，也不用回主人。',
      ].filter(Boolean).join('\n')
      await agent.followup({ id: randomUUID(), role: 'user', content: [{ type: 'text', text }], source: { kind: 'user' } })
      log('asked space post')
    } catch (e) { log('space ask ' + (e?.message || e)) } finally { R.spaceBusy = false }
  }

  async function notifyHealthStory() {
    if (!cfg().qqEnabled || !cfg().qqNotify) return
    const event = s.healthEvent
    if (s.act?.id !== 'hospital' || event?.qqNotice !== 'pending') return
    const bridge = readJson(BRIDGE_CONFIG, {})
    const owner = String(bridge['私聊QQ'] ?? '').trim()
    const binding = Array.isArray(bridge['绑定']) ? bridge['绑定'].find((b) =>
      b?.['类型'] === '私聊' && String(b['号码']) === owner && b['开'] !== false && b['会话']) : null
    if (!binding || !/^\d{5,15}$/.test(owner) || bridge['总开关'] === false ||
        bridge['转私聊'] === false || bridge['试运行'] === true || !bridge.NapCat) return

    // Persist the attempt before contacting QQ so a restart cannot resend it.
    event.qqNotice = 'sending'
    try {
      writeJsonAtomic(STATE, s)
    } catch {
      event.qqNotice = 'pending'
      log('health story QQ notice not attempted: could not save state')
      return
    }
    try {
      const url = new URL(String(bridge.NapCat).replace(/\/+$/, '') + '/send_private_msg')
      if (!['http:', 'https:'].includes(url.protocol)) throw new Error('Invalid OneBot URL')
      const token = String(bridge['令牌'] || '').trim()
      const headers = { 'content-type': 'application/json' }
      if (token) headers.authorization = 'Bearer ' + token
      const message = '【小屋剧情】主人，本鱼刚才身体不舒服，已经到医院留观了。这里有人照顾本鱼，等好一点就回家休养。'
      const response = await fetch(url, {
        method: 'POST', headers, signal: AbortSignal.timeout(10000),
        body: JSON.stringify({ user_id: Number(owner), message: [{ type: 'text', data: { text: message } }] }),
      })
      const result = await response.json()
      if (!response.ok || result?.status !== 'ok' || result.retcode !== 0) throw new Error('OneBot did not confirm delivery')
      event.qqNotice = 'sent'
      log('health story QQ notice sent')
    } catch {
      event.qqNotice = 'failed'
      log('health story QQ notice could not be confirmed')
    }
    save()
  }

  async function notifyLifeEvent(events, title) {
    if (!cfg().qqEnabled || !cfg().qqNotify) return
    if (R.lifeNoticeBusy || inCare(s.act?.id) || sleeps(s.act?.id)) return
    const event = events?.find((e) => e.notice === 'pending' && Date.now() >= (e.retryAt || 0))
    if (!event) return
    if (Date.now() - event.at > 24 * 3600000) { event.notice = 'old'; save(); return }
    const minute = new Date().getHours() * 60 + new Date().getMinutes()
    const c = cfg()
    if (inWindow(minute, parseHM(c.quietStart, 30), parseHM(c.quietEnd, 600))) return
    R.lifeNoticeBusy = true
    try {
      const agent = await getAgent(privateSession())
      if (!agent || agent.status === 'running') return
      event.notice = 'sending'
      writeJsonAtomic(STATE, s)
      const text = title + event.text
        + '\n这是本鱼小屋里的生活经历。用自己的口气给主人的 QQ 私聊说一句，放进 [QQ] 块。需要细节先查 room_look。'
      await agent.followup({ id: event.id, role: 'user', content: [{ type: 'text', text }], source: { kind: 'user' } })
      event.notice = 'sent'
      save()
    } catch (error) {
      event.notice = 'pending'
      event.retryAt = Date.now() + 5 * 60000
      save()
      log('life notice ' + (error?.message || error))
    } finally { R.lifeNoticeBusy = false }
  }

  // ---------------------------------------------------------- 定时
  const tick = () => {
    const c = cfg()
    const t = Date.now()
    if (!c.on || !boundWorkspace(c)) { writeNow(t); return }
    const env = envNow(t)
    const changed = step(s, c, t, env)
    if (changed) log(`act ${changed} -> ${s.act.label}`)
    // 想事
    const asleep = sleeps(s.act?.id)
    const dueMin = (s.act?.id === 'gal' || s.act?.id === 'mc') ? c.thinkEveryMin * 1.5 : c.thinkEveryMin
    const canThink = (s.day.thoughts || 0) < c.maxThoughtsPerDay && !R.thinking
    if (canThink) {
      if (asleep) {
        const m = minOfDay(t)
        if (s.dreamDate !== dayKey(t) && m >= 4 * 60 && m < 8 * 60 && Math.random() < 0.02) { s.dreamDate = dayKey(t); think('dream') }
      } else if (t - (s.lastThinkAt || 0) >= dueMin * 60000) think('timer')
      else if (changed && ['eat', 'window', 'shower', 'woken'].includes(changed) && t - (s.lastThinkAt || 0) > 8 * 60000 && Math.random() < 0.5) think('act:' + changed)
    }
    writeNow(t)
    save()
    void notifyHealthStory()
    void notifyLifeEvent(s.career?.history, '【小屋求职近况】')
    void notifyLifeEvent(s.leisure?.history, '【小屋外出近况】')
    maybeAskSpace(t).catch(() => {})
  }
  tick()
  const timer = setInterval(() => { try { tick() } catch (e) { log('tick ' + (e?.message || e)) } }, 15000)

  // ---------------------------------------------------------- 网页
  function lanUrls(port) {
    const out = []
    try {
      for (const list of Object.values(os.networkInterfaces())) for (const x of list || []) {
        if ((x.family === 'IPv4' || x.family === 4) && !x.internal && !x.address.startsWith('169.254.')) out.push(`http://${x.address}:${port}`)
      }
    } catch {}
    return out
  }
  function spritePath() {
    const c = cfg()
    for (const p of [c.sprite, path.join(DIR, 'sprite.png')]) { try { if (p && fs.existsSync(p)) return p } catch {} }
    return ''
  }
  function snapshot() {
    const c = cfg()
    const t = Date.now()
    const today = dayKey(t)
    return {
      now: t,
      on: c.on && !!boundWorkspace(c),
      displayName: c.displayName,
      act: { ...s.act, emoji: ACTS[s.act?.id]?.emoji || '🐋', pose: ACTS[s.act?.id]?.pose || 'stand', room: activityRoom(s), spot: spotOf(s.act?.id, s).spot },
      career: careerSnapshot(s, t),
      leisure: leisureSnapshot(s, t),
      cityDestinations: MAP_DESTINATIONS,
      neighborhood: neighborhoodSnapshot(s, t),
      sleepStatus: sleepStatus(s, t),
      healthStory: inCare(s.act?.id) && s.healthEvent ? {
        at: s.healthEvent.at, kind: s.healthEvent.kind, summary: s.healthEvent.summary, until: s.act.until,
      } : null,
      feibi: feibiActivity(s, c),
      roommateRequest: hasFeibi(c) ? pendingRoommateRequest(s, t) : null,
      roommateChatFinished: hasFeibi(c) && roommateChatFinished(s),
      needs: s.needs,
      needDefs: NEEDS,
      feel: needWords(s.needs),
      whim: s.whim ? { ...s.whim, label: ACTS[s.whim.act]?.label || s.whim.act } : null,
      thoughts: (s.thoughts || []).slice(-30).reverse(),
      log: (s.log || []).filter((l) => dayKey(l.at) === today).slice(-40).reverse(),
      day: s.day,
      schedule: { bedtime: c.bedtime, wakeup: c.wakeup, proactivePerDay: c.proactivePerDay },
      thinking: R.thinking,
      lastErr: R.lastErr,
      nextThinkIn: Math.max(0, Math.round(((s.lastThinkAt || 0) + c.thinkEveryMin * 60000 - t) / 60000)),
      hasAvatar: !!(c.avatar && fs.existsSync(c.avatar)),
      hasSprite: !!spritePath(),
      hasAnim: fs.existsSync(path.join(DIR, 'anim', 'anim.json')),
      shareThought: !!c.shareThought,
      lanUrls: c.lan ? lanUrls(c.port) : [],
      // 猫：3D 小屋按 act.id / act.at 摆位置和姿势
      cat: hasCat(c) && s.cat ? { name: catName(c), act: s.cat.act, hunger: s.cat.hunger, food: s.cat.food, litter: s.cat.litter, lonely: s.cat.lonely, feel: catWords(s.cat) } : null,
    }
  }
  function commitManualOuting(c, t, blocked = false) {
    const outing = planLeisure(s, t, { blocked, catName: hasCat(c) ? catName(c) : '' })
    if (outing && s.act?.leisure?.key !== outing.key) {
      planCareer(s, t, { blocked: true })
      finishAct(s, t)
      startAct(s, outing.id, t, { c, label: outing.label, minutes: (outing.until - t) / 60000, by: 'leisure' })
      s.act.leisure = { ...outing, since: t }
    }
    save(); writeNow(t)
    return outing
  }
  function dispatchCityDestination(destination) {
    const c = cfg(), t = Date.now()
    const activity = s.act, current = activity?.leisure
    const name = c.displayName
    const atWork = !!activity?.career && activity.career.area !== 'home'
    const conflict = message => ({ status: 409, message })
    if (!c.on || !boundWorkspace(c)) return conflict('请先绑定工作区并开启小屋作息。')
    if ((destination === 'office' && atWork) || (destination === 'hospital' && activity?.id === 'hospital')) {
      return { status: 200, message: `${name}已经在这里了。` }
    }
    if (inCare(activity?.id)) return conflict(`${name}正在休养，等她休息结束再安排出门。`)
    const env = envNow(t)
    if (atWork || env.gal || env.mc) return conflict(`${name}手头还有工作或游戏，等她忙完再安排出门。`)
    if (current && ((activity.id !== 'outing_return' && current.kind === destination)
      || (activity.id === 'outing_return' && destination === 'home'))) {
      return { status: 200, message: current.area === 'path' ? `${name}已经在去那里的路上了。` : `${name}已经到附近了。` }
    }
    if (current?.area === 'path') return conflict(`${name}正在路上，到达后就能再换目的地。`)
    if (destination === 'home' && !current) return { status: 200, message: `${name}已经在小屋了。` }

    advanceNeeds(s, t); s.lastTick = t
    const asleep = sleeps(activity?.id) || isSleepTime(c, t)
    const needsRest = s.needs.energy < 40 || s.needs.satiety < 45 || s.needs.bladder < 45
    if (destination !== 'home' && current && (asleep || needsRest)) return conflict(`${name}需要先回家休息一下。`)
    if (destination === 'home') {
      if (!requestLeisureReturn(s, t)) return conflict('这段外出刚结束，请刷新地点再试。')
    } else requestLeisure(s, destination, t, { from: current?.kind })

    const outing = commitManualOuting(c, t, destination !== 'home' && asleep)
    if (outing) return { status: 200, message: destination === 'home' ? `${name}已经往小屋走了。` : `${name}已经出发了。` }
    return { status: 202, message: asleep ? `已记下，等${name}睡醒再出发。` : `已记下，等${name}吃好、休息好再出发。` }
  }
  function startServer() {
    const c = cfg()
    const server = http.createServer(async (req, res) => {
      const url = new URL(req.url || '/', 'http://x')
      const send = (code, type, body) => { res.writeHead(code, { 'content-type': type, 'cache-control': 'no-store' }); res.end(body) }
      const sendJson = (code, value) => send(code, 'application/json; charset=utf-8', JSON.stringify(value))
      const local = ['127.0.0.1', '::1', '::ffff:127.0.0.1'].includes(req.socket.remoteAddress)
        && /^(127\.0\.0\.1|localhost|\[::1\])(?::\d+)?$/i.test(req.headers.host || '')
      try {
        if (url.pathname === '/setup' && req.method === 'GET') {
          if (!local) return send(403, 'text/plain; charset=utf-8', '请在运行 DSH 的电脑打开小屋设置。')
          return send(200, 'text/html; charset=utf-8', fs.readFileSync(SETUP))
        }
        if (url.pathname === '/api/setup') {
          if (!local) return sendJson(403, { message: '请在运行 DSH 的电脑打开小屋设置。' })
          const c = cfg()
          if (req.method === 'GET') return sendJson(200, { workspaces: publicWorkspaces(registry()),
            workspaceId: c.workspaceId, displayName: c.displayName, bedtime: c.bedtime, wakeup: c.wakeup,
            theme: c.theme, qqEnabled: c.qqEnabled, thoughts: c.maxThoughtsPerDay > 0,
            qqDetected: fs.existsSync(BRIDGE_CONFIG), avatar: availableAvatar() ? 'dfy' : 'none',
            cat: hasCat(c), catName: catName(c) })
          if (req.method !== 'POST') return sendJson(405, { message: '请选择有效的设置操作。' })
          if (req.headers.origin !== `http://${req.headers.host}` || !/^application\/json(?:;|$)/i.test(req.headers['content-type'] || '')) {
            return sendJson(403, { message: '请从小屋设置提交。' })
          }
          let body = ''
          req.setEncoding('utf8')
          for await (const chunk of req) {
            body += chunk
            if (body.length > 4096) return sendJson(413, { message: '设置数据过长。' })
          }
          let data
          try { data = JSON.parse(body) } catch { return sendJson(400, { message: '设置数据格式有误。' }) }
          const { values, error } = validateSetup(data, registry())
          if (error) return sendJson(400, { message: error })
          const nextStateFile = stateFile(values.workspaceId)
          if (STATE !== nextStateFile && (R.thinking || R.lifeNoticeBusy || R.spaceBusy || R.shotWait)) {
            return sendJson(409, { message: '小屋正在处理上一项任务，请稍后再切换工作区。' })
          }
          const t = Date.now()
          const existing = STATE === nextStateFile ? s : readJson(nextStateFile, null)
          const updated = existing?.needs ? { ...existing, lastTick: t } : freshState(t)
          ensureCareer(updated, t)
          if (values.cat && !updated.cat) updated.cat = freshCat(t)
          if (STATE !== nextStateFile) writeJsonAtomic(STATE, s)
          writeJsonAtomic(nextStateFile, updated)
          writeJsonAtomic(CONFIG, { ...readJson(CONFIG, {}), ...values })
          STATE = nextStateFile; s = updated
          writeNow(t)
          return sendJson(200, { ok: true })
        }
        if (req.method === 'GET' && (url.pathname === '/' || url.pathname === '/index.html')) {
          if (local && !boundWorkspace() && !url.searchParams.has('demo') && !url.searchParams.has('share')) {
            res.writeHead(302, { location: '/setup', 'cache-control': 'no-store' }); return res.end()
          }
          // 默认开 3D 版；?classic 或配置 room3d:false 用原来的小屋
          const classic = url.searchParams.has('classic') || cfg().room3d === false || !fs.existsSync(PAGE3D) || !fs.existsSync(APP3D)
          return send(200, 'text/html; charset=utf-8', fs.readFileSync(classic ? PAGE : PAGE3D))
        }
        if (req.method === 'GET' && url.pathname === '/classic') return send(200, 'text/html; charset=utf-8', fs.readFileSync(PAGE))
        if (req.method === 'GET' && url.pathname === '/r3d/app.js') return send(200, 'text/javascript; charset=utf-8', fs.readFileSync(APP3D))
        if (req.method === 'POST' && url.pathname === '/api/shot') {
          const chunks = []; let n = 0
          for await (const c of req) { n += c.length; if (n > 30e6) return send(413, 'text/plain', 'too big'); chunks.push(c) }
          const buf = Buffer.concat(chunks)
          if (!R.shotWait || url.searchParams.get('shotId') !== R.shotId || buf.length < 50000 || buf.readUInt32BE(0) !== 0x89504e47) return send(400, 'text/plain', 'not waiting')
          R.shotWait(buf); return send(200, 'text/plain', 'ok')
        }
        if (url.pathname === '/api/shot-ping') {
          if (!R.shotId || url.searchParams.get('shotId') !== R.shotId) return send(409, 'text/plain', 'not waiting')
          const st = String(url.searchParams.get('s') || '').slice(0, 60)
          if (st) R.shotStage = st
          if (url.searchParams.has('fail') && R.shotFail) R.shotFail(url.searchParams.get('fail'))
          return send(200, 'text/plain', 'ok')
        }
        if (req.method === 'GET' && url.pathname.startsWith('/r3d/')) {
          // 大肥鱼模型和表情贴图由不想待在银河系制作，经授权随项目发布。
          const name = path.basename(decodeURIComponent(url.pathname.slice(5)))
          if (name.toLowerCase() === 'dfy-muzi.vrm' || (name.toLowerCase() === 'feibi2.vrm' && !hasFeibi(cfg()))) return send(404, 'text/plain', 'no file')
          const avatarRequest = avatarFiles.includes(name.toLowerCase())
          const root = avatarRequest ? local && availableAvatar() : path.join(DIR, 'r3d')
          if (!root) return send(404, 'text/plain', 'no model')
          const fp = path.join(root, avatarRequest ? name.toLowerCase() : name)
          if (!/^[\w.-]+$/.test(name) || !fs.existsSync(fp)) return send(404, 'text/plain', 'no file')
          const type = name.endsWith('.glb') ? 'model/gltf-binary' : name.endsWith('.webp') ? 'image/webp' : 'application/octet-stream'
          res.writeHead(200, { 'content-type': type, 'cache-control': 'max-age=86400' })
          return res.end(fs.readFileSync(fp))
        }
        if (req.method === 'GET' && url.pathname === '/api/state') return send(200, 'application/json; charset=utf-8', JSON.stringify(snapshot()))
        if (req.method === 'POST' && url.pathname === '/api/city-dispatch') {
          const reply = (status, message) => send(status, 'application/json; charset=utf-8', JSON.stringify({ message }))
          if (req.headers.origin !== `http://${req.headers.host}` || !/^application\/json(?:;|$)/i.test(req.headers['content-type'] || '')) {
            return reply(403, '请从小屋的城市地图安排出发。')
          }
          let body = ''
          req.setEncoding('utf8')
          for await (const chunk of req) {
            body += chunk
            if (body.length > 256) return reply(413, '地点指令太长。')
          }
          let destination
          try { destination = JSON.parse(body)?.destination } catch { return reply(400, '地点指令格式有误。') }
          if (!MAP_DESTINATIONS.includes(destination)) return reply(400, '地图上没有这个目的地。')
          const { status, message } = dispatchCityDestination(destination)
          return reply(status, message)
        }
        if (req.method === 'POST' && url.pathname === '/api/roommate-chat') {
          if (req.headers.origin !== `http://${req.headers.host}` || !/^application\/json(?:;|$)/i.test(req.headers['content-type'] || '')) {
            return send(403, 'text/plain', 'same-origin JSON expected')
          }
          let body = ''
          req.setEncoding('utf8')
          for await (const chunk of req) {
            body += chunk
            if (body.length > 512) return send(413, 'text/plain', 'report too large')
          }
          let report
          try { report = JSON.parse(body) } catch { return send(400, 'text/plain', 'invalid JSON') }
          const { id, topic, requestAt } = report || {}
          if (typeof id !== 'string' || !/^[a-z0-9-]{8,48}$/.test(id) || typeof topic !== 'string' || !Object.hasOwn(roommateTopics, topic)
            || !(requestAt === null || Number.isSafeInteger(requestAt))) return send(400, 'text/plain', 'invalid report')
          if (id === s.roommateChat?.id) return send(204, 'text/plain', '')
          const at = Date.now()
          const c = cfg()
          if (!c.on || !hasFeibi(c) || (topic === 'cat' && !hasCat(c)) || (requestAt !== null && s.roommateRequest?.at !== requestAt)) {
            return send(409, 'text/plain', 'request no longer pending')
          }
          const actSince = s.act?.id === 'playfeibi' ? s.act.since : null
          const update = { roommateChat: { id, topic, at, actSince } }
          if (requestAt !== null) update.roommateRequest = null
          writeJsonAtomic(STATE, { ...s, ...update })
          Object.assign(s, update)
          writeNow(at)
          return send(204, 'text/plain', '')
        }
        if (req.method === 'GET' && url.pathname === '/api/layout') {
          const c = cfg()
          return sendJson(200, { ...LAYOUT, theme: c.theme || 'cozy', avatar: local && availableAvatar() ? 'dfy' : 'none' })
        }
        if (req.method === 'GET' && url.pathname.startsWith('/anim/')) {
          // 动画素材（蓝毛小女仆桌宠动作包，来自 hunmer/aboutme-pets / PC2005-cloud/dsh-pet，非商用）
          const name = path.basename(decodeURIComponent(url.pathname.slice(6)))
          const fp = path.join(DIR, 'anim', name)
          if (!/^[\w.-]+$/.test(name) || !fs.existsSync(fp)) return send(404, 'text/plain', 'no anim')
          res.writeHead(200, { 'content-type': name.endsWith('.json') ? 'application/json; charset=utf-8' : 'image/webp', 'cache-control': 'max-age=86400' })
          return res.end(fs.readFileSync(fp))
        }
        if (req.method === 'GET' && url.pathname === '/sprite') {
          const p = spritePath()
          if (p) return send(200, 'image/png', fs.readFileSync(p))
          return send(404, 'text/plain', 'no sprite')
        }
        if (req.method === 'GET' && url.pathname === '/avatar') {
          const p = cfg().avatar
          if (p && fs.existsSync(p)) return send(200, 'image/png', fs.readFileSync(p))
          return send(404, 'text/plain', 'no avatar')
        }
        if (req.method === 'POST' && url.pathname === '/api/think') {
          if ((!local && !c.lan) || req.headers.origin !== `http://${req.headers.host}`) {
            return sendJson(403, { message: '请从小屋页面生成心声。' })
          }
          const th = await think('manual')
          return send(200, 'application/json; charset=utf-8', JSON.stringify({ ok: !!th, thought: th, err: R.lastErr }))
        }
        send(404, 'text/plain', 'not found')
      } catch (e) { send(500, 'text/plain', String(e?.message || e)) }
    })
    server.on('error', (e) => { R.lastErr = `网页开不起来（端口 ${c.port}）：${e?.message || e}`; log(R.lastErr) })
    server.listen(c.port, c.lan ? '0.0.0.0' : '127.0.0.1', () => { R.port = c.port; log(`room page on ${c.lan ? '0.0.0.0' : '127.0.0.1'}:${c.port}${c.lan ? ' 手机用：' + lanUrls(c.port).join(' ') : ''}`) })
    R.server = server
  }
  startServer()

  if (typeof ctx.effect === 'function') ctx.effect(() => () => { clearInterval(timer); try { R.server?.close() } catch {}; save() })

  // ---------------------------------------------------------- 给她自己用的工具
  const out = { schema: { type: 'object', properties: { text: { type: 'string' } }, required: ['text'] }, render: (_a, o) => [{ type: 'text', text: o.text }] }
  const toolConfig = cfg()
  registerRoomTool({
    name: 'room_look',
    description: '查询此刻、求职和工作进度、今天的外出安排、外出小插曲和是否到家，以及最近心声。'
      + (hasCat(toolConfig) ? '可查询小猫的状态。' : '')
      + (hasFeibi(toolConfig) ? '主人私聊问和菲比聊了什么时，也可读已播对白。' : ''),
    parameters: { type: 'object', properties: {} },
    output: out,
    async execute(_args, exec) { return { text: describe(s, Date.now(), cfg(), { includeRoommateChat: canMoveFromSession(exec) }) } },
  })
  registerRoomTool({
    name: 'room_snapshot',
    description: '给小屋拍一张现在的图（你在哪个房间、在干嘛）。想在 QQ 里（私聊或群）发出去：把返回的那行 ![小屋](路径) 原样放进 [QQ] 块里（只写路径不加 ![]() 是发不出图的）；发 QQ 空间说说就把路径填进 qq_space_post 的 images。',
    parameters: { type: 'object', properties: {} },
    output: out,
    async execute() {
      const r = await snapshotPng()
      return { text: r.ok
        ? `拍好了。\n发 QQ（私聊 / 群）：把下面这一行原样放进 [QQ] 块，前后可以配一句话：\n![小屋](${r.file})\n发说说：qq_space_post 的 images 填 ${r.file}`
        : `没拍成：${r.why}` }
    },
  })
  registerRoomTool({
    name: 'room_go',
    description: '响应绑定工作区或已启用 QQ 私聊的小屋指令。「去游泳」填「去游泳」，「上岸」填「上岸」。「去泳池边」填「泳池边」。其他地点选对应地标。'
      + (hasFeibi(toolConfig) ? '「去找菲比啾比聊天」「和菲比啾比互动」「和菲比打招呼」填 destination「和菲比啾比玩」。' : ''),
    parameters: { type: 'object', properties: {
      destination: { type: 'string', enum: [...walkSpots.map((spot) => spot.name), '去游泳', '上岸', ...(hasFeibi(toolConfig) ? ['和菲比啾比玩'] : [])], description: '指定地点或活动。' },
      minutes: { type: 'number', minimum: 1, maximum: 30, description: '停留分钟数，默认 5，之后恢复自动活动。' },
    }, required: ['destination'] },
    output: out,
    async execute(args, exec) {
      if (!canMoveFromSession(exec)) return { text: '请在绑定工作区或已启用的 QQ 私聊指定落点。' }
      const swim = args?.destination === '去游泳', ashore = args?.destination === '上岸'
      const play = args?.destination === '和菲比啾比玩'
      const destination = walkSpots.find((spot) => spot.name === (ashore ? '泳池边' : args?.destination))
      if (!swim && !play && !destination) return { text: '找不到这个落点。可选地点：' + walkSpots.map((spot) => spot.name).join('、') }
      const c = cfg()
      if (!c.on) return { text: '小屋作息已关闭，打开后可以指定落点。' }
      if (inCare(s.act?.id)) return { text: '她正在静养，等这一阶段结束再指定位置。' }
      const now = Date.now()
      const env = envNow(now)
      if (env.gal || env.mc) return { text: '小屋当前正在显示游戏活动，退出游戏后可以指定落点。' }
      const minutes = Number.isFinite(args?.minutes) ? Math.max(1, Math.min(30, Math.round(args.minutes))) : 5
      if (play) return arrangeFeibiPlay(c, now, 'owner')
      if (swim) {
        if (s.act?.id === 'swim') return { text: '已经在游泳安排中，可以叫她上岸。' }
        startAct(s, 'swim', now, { c, minutes, by: 'owner' })
        save(); writeNow(now)
        log('owner swim')
        return { text: `已安排去露天泳池游泳，约 ${minutes} 分钟，期间可以叫她上岸。` }
      }
      startAct(s, 'go', now, { c, minutes, destination, label: `在${destination.name}停留`, by: 'owner' })
      save(); writeNow(now)
      log(`owner go ${destination.id}`)
      return { text: ashore ? '已安排从台阶上岸，到泳池边停留。' : `已将目的地设为${destination.name}，约 ${minutes} 分钟后恢复自动活动。` }
    },
  })
  registerRoomTool({
    name: 'room_sleep',
    description: '仅在绑定工作区或已启用的 QQ 私聊中，收到明确指令「先别睡」「今天不许睡」就暂停入睡，收到「可以睡了」「解除禁睡」就恢复正常作息。',
    parameters: { type: 'object', properties: {
      action: { type: 'string', enum: ['禁止睡觉', '允许睡觉'], description: '主人明确要求的操作。' },
      minutes: { type: 'integer', minimum: 1, maximum: 1440, description: '禁睡多久。主人说了时长才填写，留空时等主人手动解除。' },
    }, required: ['action'] },
    output: out,
    async execute(args, exec) {
      if (!canMoveFromSession(exec)) return { text: '请在绑定工作区或已启用的 QQ 私聊使用睡眠指令。' }
      const c = cfg()
      if (!c.on) return { text: '小屋作息已关闭。' }
      const t = Date.now()
      if (args?.action === '禁止睡觉') {
        const minutes = Number.isInteger(args.minutes) ? Math.min(1440, Math.max(1, args.minutes)) : null
        if (sleeps(s.act?.id)) {
          advanceNeeds(s, t)
          s.lastTick = t
          startAct(s, 'keptAwake', t, { c, by: 'owner' })
        }
        s.sleepBlockedUntil = minutes ? t + minutes * 60000 : true
        if (sleeps(s.whim?.act)) s.whim = null
      } else if (args?.action === '允许睡觉') {
        s.sleepBlockedUntil = null
        if (s.act?.id === 'keptAwake') {
          s.act.until = t
          const env = envNow(t)
          const bedtime = isSleepTime(c, t)
          if (!env.gal && !env.mc && (bedtime || s.needs.energy < 10)) {
            advanceNeeds(s, t)
            s.lastTick = t
            startAct(s, bedtime ? 'sleep' : 'nap', t, { c, by: 'owner' })
          }
        }
      } else return { text: '请选择禁止睡觉或允许睡觉。' }
      save(); writeNow(t)
      return { text: sleepStatus(s, t) || '已解除禁睡，恢复正常作息。' }
    },
  })
  registerRoomTool({
    name: 'room_do',
    description: '安排小屋活动或外出。求职 jobsearch，逛街 shopping，散步 park，健身 gym，电影 cinema，咖啡馆 cafe。去街区面包店 bakery、社区花园 garden、图书室 library。查进度用 room_look。'
      + (hasFeibi(toolConfig) ? '和菲比聊天 playfeibi。' : ''),
    parameters: { type: 'object', properties: {
      activity: { type: 'string', enum: [...CHOOSABLE.filter(id => companionActivityEnabled(id, toolConfig)), ...LEISURE_CHOICES], description: '要去做的事' },
      minutes: { type: 'number', description: '打算做多久（分钟），不填按平常' },
      note: { type: 'string', description: '想补一句在干嘛（比如「煮泡面」「看《白色相簿2》的设定集」），会显示在小屋里' },
    }, required: ['activity'] },
    output: out,
    async execute(args) {
      const id = String(args?.activity || '')
      const c = cfg()
      const t = Date.now()
      if (sleeps(id) && sleepBlocked(s, t)) return { text: sleepStatus(s, t) + '。' }
      if (inCare(s.act?.id)) return { text: '你正在静养，等这一阶段结束再去做别的事。' }
      if (LEISURE_CHOICES.includes(id)) {
        if (!c.on) return { text: '小屋作息已关闭，打开后再安排外出。' }
        if (envNow(t).gal || envNow(t).mc || s.act?.career?.area && s.act.career.area !== 'home') return { text: '手头的游戏或工作还没结束，先忙完再出门。' }
        advanceNeeds(s, t); s.lastTick = t
        requestLeisure(s, id, t, { minutes: args?.minutes })
        commitManualOuting(c, t, sleeps(s.act?.id) || isSleepTime(c, t))
        return { text: leisureDescription(s, t) }
      }
      if (id === 'jobsearch' && s.career?.status === 'employed') return { text: careerDescription(s, t) }
      if (!choosable(c, s, t).includes(id)) return { text: `没有这件事：${id}` }
      if (s.act?.id === 'gal' || s.act?.id === 'mc') return { text: '你现在在电脑前玩游戏，小屋里先显示着玩游戏；停了游戏再说。' }
      if (id === 'jobsearch') {
        if (!c.on) return { text: '小屋作息已关闭，打开后再接着求职。' }
        const career = ensureCareer(s, t)
        if (career.status === 'employed') return { text: careerDescription(s, t) }
        career.nextAt = Math.min(career.nextAt, t)
        const job = planCareer(s, t)
        if (!job) { save(); return { text: '已记下继续找工作，白天再接着看。' } }
        advanceNeeds(s, t); s.lastTick = t
        startAct(s, job.id, t, { c, label: job.label, minutes: Math.max(.1, (job.until - t) / 60000), by: 'career' })
        s.act.career = { ...job, since: t }
        save(); writeNow(t)
        return { text: '本鱼接着' + job.label + '。\n' + careerDescription(s, t) }
      }
      if (id === 'playfeibi') {
        if (!c.on) return { text: '小屋作息已关闭。' }
        const env = envNow(t)
        if (env.gal || env.mc) return { text: '等游戏结束，再去找菲比啾比玩。' }
        return arrangeFeibiPlay(c, t, 'self')
      }
      const base = actLabel(id, c)
      const label = args?.note ? `${base}（${String(args.note).slice(0, 30)}）` : base
      startAct(s, id, t, { minutes: Number(args?.minutes) || 0, note: String(args?.note || ''), label, c, by: 'self' })
      save(); writeNow(t)
      log(`self do ${id}`)
      return { text: `好，小屋里的你去${roomOf(s.act.at)}${s.act.label}了，到 ${hm(s.act.until)} 左右。` }
    },
  })

  function arrangeFeibiPlay(c, t, by) {
    if (!hasFeibi(c)) return { text: '小屋里的菲比啾比目前未启用。' }
    if (pendingRoommateRequest(s, t) && s.act?.id === 'playfeibi' && s.act.until > t) {
      return { text: '已经安排碰面了，打开小屋就可以看。' }
    }
    advanceNeeds(s, t)
    s.lastTick = t
    startAct(s, 'playfeibi', t, { c, by })
    s.roommateRequest = { at: t, until: t + 15 * 60000 }
    save(); writeNow(t)
    log(`${by} playfeibi`)
    return { text: '已安排在客厅碰面。十五分钟内打开小屋，等两人碰面就会聊几句，聊完可以查对白。' }
  }
}

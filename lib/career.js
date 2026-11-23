// 小屋里的虚构求职和工作生活，统一按北京时间推进。
const MINUTE = 60000, DAY = 86400000, OFFSET = 8 * 3600000
export const careerClock = (t) => {
  const d = new Date(t + OFFSET)
  return { day: d.toISOString().slice(0, 10), weekday: d.getUTCDay(), minute: d.getUTCHours() * 60 + d.getUTCMinutes() }
}
const dayStart = (t) => Math.floor((t + OFFSET) / DAY) * DAY - OFFSET
const weekday = (t) => ![0, 6].includes(careerClock(t).weekday)
const nextWeekday = (t, days = 1, minute = 600) => {
  let date = dayStart(t)
  for (let count = 0; count < days;) { date += DAY; if (weekday(date)) count++ }
  return date + minute * MINUTE
}
const searchTime = (t) => {
  const { minute } = careerClock(t)
  if (!weekday(t)) return nextWeekday(t)
  if (minute < 600) return dayStart(t) + 600 * MINUTE
  if (minute >= 20 * 60) return nextWeekday(t)
  return t
}

export const CAREER_ACTS = {
  jobsearch: { label: '在电脑前找工作', at: 'desk', pose: 'sit', emoji: '📄', eff: { fun: 3, energy: -1 } },
  jobinterview: { label: '去工作室面试', at: 'office', pose: 'sit', emoji: '🗂️', eff: { social: 8, energy: -1 } },
  work_task: { label: '在工位整理选题', at: 'office', pose: 'sit', emoji: '💻', eff: { energy: -1.5, fun: 1 } },
  work_meeting: { label: '和同事开选题会', at: 'office', pose: 'sit', emoji: '📝', eff: { social: 12, energy: -1 } },
  work_break: { label: '在茶水间歇一会儿', at: 'office', pose: 'sit', emoji: '☕', eff: { fun: 22, social: 8 } },
  work_lunch: { label: '和同事吃午饭', at: 'office', pose: 'sit', emoji: '🍱', eff: { satiety: 170, fun: 8 } },
  work_nap: { label: '在休息区午休', at: 'office', pose: 'sit', emoji: '💤', base: { satiety: -3, bladder: -3, energy: 18, fun: 3, social: 0, hygiene: -1 } },
  work_commute: { label: '在去工作室的路上', at: 'office', pose: 'stand', emoji: '🚇', eff: { energy: -1 } },
  work_toilet: { label: '暂时离开工位去洗手间', at: 'office', pose: 'sit', emoji: '🚻', eff: { bladder: 1800 } },
}

const SEARCH = [
  { label: '翻招聘页，把觉得合适的岗位存下来', duration: 16, area: 'home', pose: 'type', nextDays: 0, gap: 90,
    lines: ['本鱼想找份能写东西的工作。', '这个岗位怎么连咖啡机都要会修……先放旁边。', '先存两个看起来合适的，慢慢比。'] },
  { label: '改简历，把写过的稿子整理成作品集', duration: 24, area: 'home', pose: 'type', nextDays: 1,
    lines: ['“爱刷视频”换个写法……', '嗯，平时会留意评论和大家在聊什么。', '写自己真做过的事，好过凑一堆大词。'] },
  { label: '给两家工作室投简历，检查附件有没有漏', duration: 15, area: 'home', pose: 'type', nextDays: 1,
    lines: ['标题写好了。附件也在。', '等一下，本鱼再打开一次看看。', '好，发出去了。现在等他们回。'] },
  { label: '收到一封婉拒，重新挑几份招聘信息', duration: 12, area: 'home', pose: 'phone', nextDays: 1, notify: true,
    lines: ['这家说想要有更多经验的。', '唉……本鱼先把这封收起来。', '另外一家回了，约本鱼聊作品。那就准备那家。'] },
  { label: '在工作室面试，讲自己做的选题和稿子', duration: 22, area: 'interview', pose: 'read', nextDays: 1, notify: true,
    lines: ['面试官：你会怎么选一个短视频话题？', '本鱼会先看评论里大家真正在问什么，再去核对。', '面试官：可以。我们看一下你这篇稿子的修改过程。', '这一段本鱼改了两次，第一次写得太满了。'] },
  { label: '收到录用消息，核对入职日期和工作安排', duration: 14, area: 'home', pose: 'phone', nextDays: 0, notify: true,
    lines: ['邮件上写的是录用……本鱼再看一遍。', '周一到周五，九点半上班，六点下班。中午有午休。', '本鱼回好确认邮件了。入职那天得早点出门。'] },
]

const TASKS = [
  ['整理本周的短视频选题，给每条补参考链接', '核对脚本里的资料，把出处贴进文档', '按同事意见改开头，删掉绕远的两句'],
  ['翻评论区，把反复出现的问题归到选题表', '给明天的稿子写初稿，先搭清楚顺序', '核对标题和封面文字，把夸大的地方改掉'],
  ['整理昨天的视频数据，看看观众在哪段离开', '把选题会留下的草稿整理成两份方案', '检查排期，把待审核的稿子发给同事'],
]
const SEARCH_DETOURS = [
  null,
  { label: '比对通勤和岗位内容，放弃一份不太合适的邀请',
    lines: ['这一家要来回换三趟车……', '而且工作内容跟招聘页写的有点出入。', '本鱼先婉拒了。另一家愿意看作品集，准备那家吧。'] },
  { label: '收到补作品集的邮件，给稿子添上修改说明',
    lines: ['他们问这篇稿子是怎么改出来的。', '那把第一稿也找出来，放在旁边比。', '好，解释发过去了，等他们安排面试。'] },
]

function record(career, t, text, notify = false, lines = []) {
  const event = { id: 'career-' + t + '-' + career.history.length, at: t, text, lines, notice: notify ? 'pending' : 'none' }
  career.history = [...career.history, event].slice(-24)
}

export function ensureCareer(s, t) {
  if (!s.career) s.career = {
    version: 1, status: 'searching', phase: 0, nextAt: searchTime(t), active: null, history: [],
    company: ['晴窗内容工作室', '海盐创意工作室', '纸飞机内容工作室'][Math.floor(Math.random() * 3)],
    role: '内容运营助理', detour: Math.floor(Math.random() * SEARCH_DETOURS.length), startedAt: t,
  }
  return s.career
}

function officeSlot(s, t) {
  const career = s.career, clock = careerClock(t)
  if (career.status !== 'employed' || dayStart(t) < dayStart(career.startAt) || !weekday(t) || clock.minute < 550 || clock.minute >= 1105) return null
  const start = dayStart(t), tasks = TASKS[Math.floor(start / DAY) % TASKS.length]
  const first = clock.day === careerClock(career.startAt).day
  const slots = [
    [550, 570, 'work_commute', '去工作室，路上看一眼今天的安排', 'commute', 'stand'],
    [570, 585, 'work_task', first ? '领工牌、认识同事，把常用文档收好' : '打开排期表，整理今天先做哪几件事', 'desk', 'type'],
    [585, 605, 'work_meeting', first ? '听带教同事讲选题和审核流程' : '和同事碰一下今天的选题和截止时间', 'meeting', 'read'],
    [605, 655, 'work_task', tasks[0], 'desk', 'type'],
    [655, 665, 'work_break', '去倒杯水，顺便摸鱼看两眼手机', 'break', 'phone'],
    [665, 720, 'work_task', tasks[1], 'desk', 'type'],
    [720, 755, 'work_lunch', '和同事吃午饭，聊今天的菜和通勤', 'lunch', 'eat'],
    [755, 805, 'work_nap', '在休息区闭眼午休，手机放在一边', 'nap', 'sit'],
    [805, 870, 'work_task', '午休结束，接着改上午没写完的稿子', 'desk', 'type'],
    [870, 900, 'work_meeting', '参加选题会，记下需要修改的地方', 'meeting', 'read'],
    [900, 915, 'work_break', '在茶水间伸个懒腰，和同事闲聊两句', 'break', 'stretch'],
    [915, 1020, 'work_task', tasks[2], 'desk', 'type'],
    [1020, 1080, 'work_task', '整理待审核稿件和明天的清单，等同事回复', 'desk', 'read'],
    [1080, 1105, 'work_commute', '下班回家，路上想今晚吃什么', 'commute', 'phone'],
  ]
  const slot = slots.find(([a, b]) => clock.minute >= a && clock.minute < b)
  if (!slot) return null
  const [from, to, id, label, area, pose] = slot
  const scenes = {
    work_meeting: ['同事：这版先把开头缩短，出处留在文档里。', '本鱼记下来了。标题等正文定了再一起改。', '同事：好，下午再碰一下进度。'],
    work_lunch: ['今天这份还挺香的……本鱼先吃两口。', '同事：你平时通勤要多久？', '本鱼得预留一点时间，省得早上一路赶。'],
    work_break: ['这页还在加载，本鱼看两眼手机。', '……欸，不能一划就忘了时间。', '喝口水，待会儿回去接着改。'],
  }
  return { id, label, area, pose, lines: scenes[id], key: clock.day + '-' + from, until: start + to * MINUTE }
}

export function advanceCareer(s, t) {
  const c = ensureCareer(s, t)
  if (c.active && t >= c.active.until) {
    const completed = c.active
    record(c, completed.until, completed.label + '。' + completed.lines.at(-1), SEARCH[c.phase].notify && c.phase < SEARCH.length - 1, completed.lines)
    c.active = null
    const stage = SEARCH[c.phase++]
    if (c.phase === SEARCH.length) {
      c.status = 'employed'
      c.startAt = nextWeekday(completed.until, 1, 570)
      c.nextAt = null
      record(c, completed.until + 1, '确认入职' + c.company + '，岗位是' + c.role + '，下一个工作日开始。周一到周五 9:30—18:00，中午吃饭和午休。', true)
    } else {
      c.nextAt = stage.nextDays ? nextWeekday(completed.until, stage.nextDays, 600 + (c.phase * 37) % 120)
        : searchTime(completed.until + (stage.gap || 90) * MINUTE)
    }
  }
  return c
}

export function planCareer(s, t, { blocked = false } = {}) {
  let c = ensureCareer(s, t)
  if (blocked) {
    if (c.active) c.pausedAt ??= t
    return null
  }
  if (c.pausedAt) {
    if (c.active) c.active.until += Math.max(0, t - c.pausedAt)
    c.pausedAt = null
  }
  c = advanceCareer(s, t)
  if (c.active) return { ...c.active, id: c.active.area === 'interview' ? 'jobinterview' : 'jobsearch' }
  if (c.status === 'searching' && t >= c.nextAt && searchTime(t) === t) {
    const stage = { ...SEARCH[c.phase], ...(c.phase === 3 ? SEARCH_DETOURS[c.detour || 0] : null) }
    c.active = { ...stage, key: 'search-' + c.phase + '-' + t, since: t, until: t + stage.duration * MINUTE }
    return { ...c.active, id: stage.area === 'interview' ? 'jobinterview' : 'jobsearch' }
  }
  const slot = officeSlot(s, t)
  if (!slot) return null
  if (careerClock(t).day === careerClock(c.startAt).day && !c.firstDayRecorded) {
    c.firstDayRecorded = true
    record(c, t, '本鱼到' + c.company + '报到，今天先认工位、学审核流程。', true)
  }
  if (s.needs.bladder < 18 || s.act?.id === 'work_toilet' && t < s.act.until) {
    return { id: 'work_toilet', label: '暂时离开工位去洗手间', area: 'washroom', pose: 'sit', key: 'toilet-' + careerClock(t).day,
      until: s.act?.id === 'work_toilet' ? s.act.until : t + 4 * MINUTE }
  }
  return slot
}

export function careerSnapshot(s, t) {
  const c = s.career
  if (!c) return null
  return {
    status: c.status, company: c.company, role: c.role, phase: c.phase,
    startAt: c.startAt || null, nextAt: c.nextAt || null,
    history: c.history.slice(-8), schedule: '周一至周五 9:30—18:00，12:00 午饭，12:35—13:25 午休',
    current: s.act?.career || null,
  }
}

export function careerLine(s, t) {
  const c = s.career
  if (!c) return ''
  if (c.status === 'searching') return '本鱼正在找工作，方向是' + c.role + (c.active || s.act?.career ? '' : '，等下一次投递或回复')
  if (s.act?.career) return '本鱼已入职' + c.company + '，做' + c.role
  const next = t < c.startAt ? '，还没到入职日' : weekday(t) ? '，现在已离开工作安排' : '，今天周末休息'
  return '本鱼在' + c.company + '做' + c.role + next
}

export function careerDescription(s, t) {
  const c = careerSnapshot(s, t)
  if (!c) return ''
  const lines = [careerLine(s, t), (c.status === 'searching' ? '录用后的工作安排（北京时间）' : '工作安排（北京时间）') + c.schedule]
  if (c.status === 'searching') lines.push('求职方向 ' + c.role + '，正在了解的单位包括' + c.company)
  if (c.startAt) lines.push('入职日期 ' + careerClock(c.startAt).day)
  for (const e of c.history.slice(-5)) lines.push(careerClock(e.at).day + ' ' + e.text)
  for (const e of c.history.slice(-2)) if (e.lines?.length) lines.push('那段小剧场：' + e.lines.join(' / '))
  if (c.current?.lines) lines.push('当前小剧场：' + c.current.lines.join(' / '))
  return lines.join('\n')
}

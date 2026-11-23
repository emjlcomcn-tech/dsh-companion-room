import { careerClock } from './career.js'
import { NEIGHBORHOOD_CHOICES, neighborhoodSnapshot, neighborhoodVisit, finishNeighborhoodVisit } from './neighborhood.js'

const MINUTE = 60000
const DAY = 86400000
const dayStart = (t) => Math.floor((t + 8 * 3600000) / DAY) * DAY - 8 * 3600000
export const LEISURE_CHOICES = ['shopping', 'park', 'gym', 'cinema', 'cafe', ...NEIGHBORHOOD_CHOICES]
const WORKDAY_OUTINGS = [...NEIGHBORHOOD_CHOICES, 'park', 'cafe', 'shopping']
const PLACES = {
  shopping: { name: '逛街', place: '街边小店', label: '逛文具店和小店，慢慢挑喜欢的小东西', duration: 55, pose: 'stand',
    lines: ['这排贴纸颜色好看，本鱼再翻一下。', '拿起来比了半天，还是先挑最喜欢的那张。', '袋子小小一只，倒是逛了挺久。'], summary: '逛了文具店，在几张贴纸之间挑了好久' },
  park: { name: '公园散步', place: '公园步道', label: '沿公园步道慢慢散步，绕到长椅那边看看', duration: 45, pose: 'walk',
    lines: ['走到这边才发现，还有一条小路。', '长椅那边有人在遛狗，本鱼过去看看。', '那只狗走两步就回头，像在催人跟上。'], summary: '沿步道散步，在长椅旁看人遛狗' },
  gym: { name: '健身', place: '健身房', label: '在健身房做轻量拉伸，再走一会儿跑步机', duration: 40, pose: 'stretch',
    lines: ['本鱼先伸伸胳膊，肩膀有点紧。', '跑步机先调慢一点，慢慢走。', '呼……今天这点量刚好，休息一下再回去。'], summary: '做了轻量拉伸，又慢走了一会儿，结束后有点累' },
  cinema: { name: '看电影', place: '小电影院', label: '坐在小影院里看一场轻松的电影', duration: 75, pose: 'sit',
    lines: ['刚刚那段配乐挺好听的。', '本鱼先把手机收起来，等散场再聊这段。', '最后那个人回头的地方，还挺让人惦记。'], summary: '看了一场轻松的电影，散场时还在想结尾' },
  cafe: { name: '咖啡馆看书', place: '街角咖啡馆', label: '在街角咖啡馆找个位置，看几页带来的书', duration: 50, pose: 'read',
    lines: ['本鱼挑了窗边这张小桌。', '读到刚刚那一页，倒回去又看了一遍。', '杯子喝空了，书签才往后挪几页。'], summary: '在街角咖啡馆看书，喜欢的一页又读了一遍' },
  bakery: { name: '去面包店', place: '面包店', label: '在柜台前挑面包，和阿棠说说话', duration: 15, pose: 'stand', emoji: '🥐' },
  garden: { name: '去社区花园', place: '社区花园', label: '看看自己的花盆，和小满聊聊天', duration: 20, pose: 'stand', emoji: '🌼' },
  library: { name: '去图书室', place: '图书室', label: '和若宁打个招呼，翻翻想看的书', duration: 25, pose: 'stand', emoji: '📚' },
  office: { id: 'visit_office', name: '去工作室', place: '工作室', label: '在工作室门口打个招呼，进去坐一会儿', duration: 15, pose: 'sit', emoji: '💼',
    lines: ['先打个招呼，本鱼在休息区坐一坐。'], summary: '去工作室看了看，在休息区坐了一会儿' },
  hospital: { id: 'visit_hospital', name: '去医院', place: '医院', label: '到了医院，在访客区坐一会儿', duration: 15, pose: 'perch', emoji: '🏥',
    lines: ['本鱼在访客座位这边等一会儿。'], summary: '去医院探访，在访客区待了一会儿' },
}
export const MAP_DESTINATIONS = ['home', ...Object.keys(PLACES)]

export const LEISURE_ACTS = {
  outing_travel: { label: '在出门的路上', at: 'outside', pose: 'stand', emoji: '🚶', eff: { fun: 18, energy: -2 } },
  outing_break: { label: '找个地方坐下歇脚，喝水吃点东西', at: 'outside', pose: 'sit', emoji: '🥤', eff: { fun: 26, satiety: 90, energy: 8 } },
  outing_return: { label: '结束外出，慢慢回家', at: 'outside', pose: 'stand', emoji: '🏠', eff: { fun: 12, energy: -1 } },
  ...Object.fromEntries(Object.keys(PLACES).map((kind) => [PLACES[kind].id || kind, {
    label: PLACES[kind].label, at: 'outside', pose: 'stand', emoji: PLACES[kind].emoji || { shopping: '🛍️', park: '🌳', gym: '🏃', cinema: '🎬', cafe: '☕' }[kind],
    eff: { fun: 38, energy: kind === 'gym' ? -12 : -2, social: NEIGHBORHOOD_CHOICES.includes(kind) ? 30 : 6 },
  }])),
}

function ensureLeisure(s) {
  s.leisure ||= { version: 1, day: '', plan: null, history: [] }
  return s.leisure
}

function record(leisure, plan, t, text, { notify = false, visited = false } = {}) {
  leisure.history = [...leisure.history, {
    id: 'leisure-' + plan.id + '-' + plan.phase + '-' + leisure.history.length, at: t, text,
    notice: notify ? 'pending' : 'none', kind: plan.kind, planId: plan.id, visited,
  }].slice(-30)
}

function retireNotices(leisure, plan) {
  for (const event of leisure.history) if (event.planId === plan.id && event.notice === 'pending') event.notice = 'superseded'
}

function newPlan(kind, t, startAt, by) {
  return { id: t + '-' + kind, day: careerClock(t).day, kind, name: PLACES[kind].name,
    startAt, by, phase: 0, active: null, done: false }
}

function dailyPlan(s, leisure, t, weekend) {
  const workday = !weekend && s.career?.status === 'employed' && dayStart(t) >= dayStart(s.career.startAt)
  const [from, spread, latest] = weekend ? [13 * 60 + 20, 130, 19 * 60]
    : workday ? [18 * 60 + 40, 45, 21 * 60] : [14 * 60, 135, 20 * 60 + 30]
  const pool = workday ? WORKDAY_OUTINGS : weekend ? LEISURE_CHOICES : LEISURE_CHOICES.filter(kind => kind !== 'cinema')
  const recent = leisure.history.filter(event => event.visited ?? (event.id?.startsWith(`leisure-${event.planId}-1-`)
    && !/^(临时改了主意|昨天的外出安排|外出途中有点累)/.test(event.text)))
    .slice(-2).map(event => event.kind)
  const stage = neighborhoodSnapshot(s, t).gardenStage
  const weights = pool.map(kind => {
    if (recent.includes(kind)) return 0
    if (kind === 'garden' && ['sprout', 'bloom'].includes(stage)) return 3
    if (kind === 'gym' && s.needs.energy < 50) return 0
    return 1
  })
  let roll = Math.random() * weights.reduce((a, b) => a + b, 0)
  const kind = pool.find((_, index) => (roll -= weights[index]) < 0) || 'park'
  const day = dayStart(t)
  const plan = newPlan(kind, t, day + (from + Math.floor(Math.random() * spread)) * MINUTE, 'sim')
  plan.latestAt = day + latest * MINUTE
  if (workday) {
    plan.duration = Math.min(PLACES[kind].duration, 28)
    plan.breakMinutes = 8
  }
  return plan
}

function automaticWindow(plan, t) {
  return plan?.by === 'sim' && plan.latestAt && !plan.done && plan.phase === 0 && !plan.active
    && t >= plan.startAt && t < plan.latestAt
}

export function leisurePreparation(s, t) {
  const plan = s.leisure?.plan
  if (!automaticWindow(plan, t)) return null
  const { energy, satiety, bladder } = s.needs
  if (bladder < 40) return 'toilet'
  if (satiety < 45) return 'snack'
  if (energy >= 21 && energy < 30 && !plan.rested) return 'nap'
  return null
}

export function requestLeisure(s, kind, t, { minutes, from } = {}) {
  if (!Object.hasOwn(PLACES, kind)) return false
  const leisure = ensureLeisure(s)
  const day = careerClock(t).day
  if (leisure.plan && !leisure.plan.done) {
    if (leisure.plan.day === day && leisure.plan.kind === kind && leisure.plan.active) return true
    retireNotices(leisure, leisure.plan)
    record(leisure, leisure.plan, t, '临时改了主意，收起原来的外出打算。')
  }
  leisure.day = day
  leisure.plan = newPlan(kind, t, t, 'owner')
  if (Object.hasOwn(PLACES, from) && from !== kind) leisure.plan.from = from
  if (Number.isFinite(Number(minutes)) && Number(minutes) > 0) leisure.plan.duration = Math.max(5, Math.min(180, Number(minutes)))
  return true
}

export function requestLeisureReturn(s, t) {
  const plan = s.leisure?.plan
  if (!s.act?.leisure || !plan?.active || plan.done) return false
  if (plan.phase === 3) return true
  retireNotices(s.leisure, plan)
  plan.phase = 3
  plan.by = 'owner'
  plan.active = null
  plan.ownerReturn = true
  record(s.leisure, plan, t, '收好随身的东西，准备按主人的安排回小屋。')
  return true
}

function stage(plan, catName) {
  const place = PLACES[plan.kind]
  const stages = [
    { id: 'outing_travel', label: (plan.from ? '沿街去下一个地点 · ' : '收好手机和钥匙，准备出门 · ') + place.name, duration: 10, pose: 'walk', area: 'path',
      lines: ['本鱼带上钥匙了。', '路上慢慢走，到了再看看。'] },
    { id: plan.kind, ...place, duration: plan.duration || place.duration, area: plan.kind },
    { id: 'outing_break', label: '在附近坐下歇脚，喝水吃点东西', duration: plan.breakMinutes || 20, pose: 'sit', area: 'break',
      lines: ['本鱼找个地方坐一下，喝口水。', '把刚才逛到的东西在脑袋里又过了一遍。',
        catName ? `歇够了就慢慢回去，${catName}应该还在家里团着。` : '歇够了就慢慢回去，晚上给自己泡杯茶。'] },
    { id: 'outing_return', label: plan.earlyReason ? plan.earlyReason + '，先回家休息' : '从' + place.place + '沿路慢慢回家',
      duration: plan.earlyReason ? 5 : 10, pose: 'walk', area: 'path', lines: ['钥匙在，手机也在。', '本鱼在回家的路上了。'] },
  ]
  return stages[plan.phase]
}

export function planLeisure(s, t, { blocked = false, catName = '' } = {}) {
  const leisure = ensureLeisure(s)
  const clock = careerClock(t)
  let plan = leisure.plan
  if (plan && plan.day !== clock.day) {
    if (plan.by === 'owner' && !plan.done) plan.day = leisure.day = clock.day
    else {
      retireNotices(leisure, plan)
      if (!plan.done) record(leisure, plan, t, '昨天的外出安排已结束，剩下的事留到以后。')
      plan = leisure.plan = null
    }
  }
  const weekend = [0, 6].includes(clock.weekday)
  if (!plan && leisure.day !== clock.day) {
    leisure.day = clock.day
    plan = leisure.plan = dailyPlan(s, leisure, t, weekend)
  }
  if (!plan || plan.done) return null
  if (plan.latestAt && t >= plan.latestAt && plan.phase === 0 && !plan.active) {
    plan.done = true
    plan.skipped = s.needs.energy < 30 ? '今天有点累，留在小屋休息' : '今天时间没凑上，把外出留到下次'
    record(leisure, plan, t, plan.skipped + '。')
    return null
  }
  if (blocked) {
    if (plan.active) plan.pausedAt ??= t
    return null
  }
  if (plan.pausedAt) {
    if (plan.active) plan.active.until += Math.max(0, t - plan.pausedAt)
    plan.pausedAt = null
  }
  if (!plan.active && plan.phase === 0) {
    if (t < plan.startAt || (!plan.latestAt && plan.by === 'sim' && clock.minute >= (weekend ? 19 * 60 : 20 * 60 + 15))) return null
    if (s.needs.energy < (plan.latestAt ? 30 : 40) || s.needs.satiety < 45 || s.needs.bladder < (plan.latestAt ? 40 : 45)) return null
    // A gym plan made in the morning can become too tiring by the time she is free.
    if (plan.latestAt && plan.kind === 'gym' && s.needs.energy < 50) {
      plan.kind = 'park'
      plan.name = PLACES.park.name
    }
  }
  const tired = s.needs.energy < 18 || s.needs.satiety < 15 || s.needs.bladder < 15
  if (tired && plan.active && plan.phase < 3) {
    record(leisure, plan, t, '外出途中有点累或需要休息，决定提前回家。')
    plan.earlyReason = '有点累或需要休息'
    plan.phase = 3
    plan.active = null
  }
  if (plan.active && t >= plan.active.until) {
    const completed = plan.active
    if (plan.phase === 1) {
      plan.summary = NEIGHBORHOOD_CHOICES.includes(plan.kind)
        ? finishNeighborhoodVisit(s, plan.kind, completed.until, completed.topic || neighborhoodVisit(s, plan.kind, completed.since).topic)
        : PLACES[plan.kind].summary + '。'
      record(leisure, plan, completed.until, plan.summary, { visited: true })
    }
    plan.active = null
    plan.phase++
    if (plan.phase === 4) {
      plan.done = true
      retireNotices(leisure, plan)
      const summary = plan.ownerReturn ? '按主人的安排结束了外出，现在已经回到小屋。'
        : plan.earlyReason ? '这趟外出提前结束，本鱼已经回家，想先歇一会儿。'
          : `${plan.summary || (PLACES[plan.kind].summary || '外出结束了') + '。'}在附近歇了会儿，现在已经回到小屋。`
      record(leisure, plan, completed.until, summary, { notify: true })
      return null
    }
  }
  if (!plan.active) {
    const next = stage(plan, catName)
    if (plan.phase === 1 && NEIGHBORHOOD_CHOICES.includes(plan.kind)) Object.assign(next, neighborhoodVisit(s, plan.kind, t))
    plan.active = { ...next, kind: plan.kind, place: next.area === 'path' ? '外出路上' : next.area === 'break' ? '街角休息处' : PLACES[plan.kind].place,
      key: plan.id + '-' + plan.phase, since: t, until: t + next.duration * MINUTE }
    if (plan.phase === 0 && plan.from) plan.active.from = plan.from
    if (plan.phase === 0) record(leisure, plan, t, '本鱼准备出门 · ' + PLACES[plan.kind].name + '，带上钥匙和手机，晚些时候回来。',
      { notify: plan.by === 'owner' && !NEIGHBORHOOD_CHOICES.includes(plan.kind) })
  }
  return plan.active
}

function agenda(s, t) {
  const plan = s.leisure?.plan
  if (plan?.day !== careerClock(t).day) return null
  const minute = careerClock(plan.startAt).minute
  const time = [Math.floor(minute / 60), minute % 60].map(value => String(value).padStart(2, '0')).join(':')
  const text = plan.skipped || (plan.done ? `今天${plan.name}的行程已经结束，已回到小屋`
    : plan.pausedAt ? `先忙手头的事，之后再继续${plan.name}`
      : plan.active ? plan.active.label
        : t < plan.startAt ? `${time} 左右${plan.name}` : `等有空就出门 · ${plan.name}`)
  return { name: plan.name, kind: plan.kind, pending: !plan.done && !plan.active, text }
}

export function leisureSnapshot(s, t = Date.now()) {
  if (!s.leisure) return null
  return { plan: s.leisure.plan, agenda: agenda(s, t), history: s.leisure.history.slice(-6) }
}

export function leisureDescription(s, t) {
  const leisure = s.leisure
  const lines = ['每天会留一段出门时间。找工作时多在下午，入职后工作日多在下班后，周末可以逛久一点。']
  const today = agenda(s, t)
  if (today) lines.push(`今天的外出安排（北京时间）：${today.text}。`)
  for (const event of (leisure?.history || []).filter((e) => t >= e.at && t - e.at < 48 * 3600000).slice(-4)) lines.push(careerClock(event.at).day + ' ' + event.text)
  if (s.act?.leisure?.lines) lines.push('正在经历的小插曲：' + s.act.leisure.lines.join(' / '))
  lines.push('想出门用 room_do，activity 可选 shopping、park、gym、cinema、cafe、bakery（面包店）、garden（社区花园）、library（图书室）。')
  return lines.join('\n')
}

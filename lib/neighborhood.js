import { careerClock } from './career.js'

const residents = {
  bakery: { name: '阿棠', place: '面包店', topics: ['刚出炉的橘皮面包', '怎么把隔夜吐司烤脆', '下次想试的小蛋糕'] },
  garden: { name: '小满', place: '社区花园', topics: ['哪些花适合种在背风处', '最近几天的日照', '空花盆可以种些什么'] },
  library: { name: '若宁', place: '图书室', topics: ['靠窗的空座', '最近归还的新书', '怎么用废纸做书签'] },
}
const books = ['《海边小站》', '《雨天的窗》', '《街角的花盆》']
export const NEIGHBORHOOD_CHOICES = Object.keys(residents)
const stageNames = { seed: '刚播种', sprout: '发芽了', budding: '长出花苞', bloom: '开花了' }
const familiarity = visits => visits >= 4 ? '朋友' : visits >= 2 ? '熟面孔' : '刚认识'

function gardenStage(plot, time) {
  if (!plot) return null
  const today = careerClock(time).day
  if (today <= plot.planted) return 'seed'
  if (!plot.watered) return 'sprout'
  return today > plot.watered ? 'bloom' : 'budding'
}

export function neighborhoodVisit(s, kind, time) {
  const person = residents[kind]
  if (!person) return null
  const town = s.neighborhood
  const visits = town?.contacts?.[kind]?.visits || 0
  const topic = person.topics[visits % person.topics.length]
  const stage = kind === 'garden' ? gardenStage(town?.plot, time) : null
  const lines = [visits ? `欸，${person.name}今天也在呀。` : `今天在${person.place}第一次见到${person.name}。`,
    `刚和${person.name}聊到${topic}。`]
  if (kind === 'garden') {
    lines.push({ seed: '盆里的土还是湿的，再等一等呀。', sprout: '冒出两片小叶子了，今天给它浇一点水。',
      budding: '有小花苞啦，留在这儿慢慢开。', bloom: '开花啦！等会儿在花盆旁边插一张小牌。' }[stage] || '小满留了一只空盆，本鱼想种一颗金盏菊。')
  }
  if (kind === 'library') lines.push(town?.book ? `接着读${town.book.title}，书签还夹在第${town.book.page}页。` : '若宁留了一本薄薄的小说，可以借回去慢慢看。')
  return { lines, topic, gardenStage: stage }
}

export function finishNeighborhoodVisit(s, kind, time, topic) {
  const person = residents[kind]
  const town = s.neighborhood ||= { contacts: {}, flowers: 0, booksRead: 0 }
  const previous = town.contacts[kind]
  const visits = (previous?.visits || 0) + 1
  town.contacts[kind] = { visits, at: time, topic }
  let text = previous ? `又见到${person.name}，聊了${topic}` : `在${person.place}认识了${person.name}，聊了${topic}`
  if (visits === 4) text += '，现在已经是会约着聊天的朋友了'
  const day = careerClock(time).day
  if (kind === 'garden') {
    const stage = gardenStage(town.plot, time)
    if (!stage) { town.plot = { planted: day }; text += '，种下了一盆金盏菊' }
    if (stage === 'sprout') { town.plot.watered = day; text += '，给发芽的金盏菊浇了水' }
    if (stage === 'bloom') { town.flowers++; town.plot = null; text += '，给开花的金盏菊插了名牌，空盆留给下次' }
  }
  if (kind === 'library') {
    if (!town.book) {
      town.book = { title: books[town.booksRead % books.length], page: 1, pages: 72 }
      text += `，借了${town.book.title}回家`
    } else {
      text += '，' + advanceBorrowedBook(s, 18)
    }
  }
  return text + '。'
}

export function advanceBorrowedBook(s, pages) {
  const town = s.neighborhood, book = town?.book
  if (!book) return ''
  book.page = Math.min(book.pages, book.page + pages)
  if (book.page < book.pages) return `${book.title}读到了第${book.page}页`
  town.booksRead++
  town.book = null
  return `读完了${book.title}`
}

export function neighborhoodSnapshot(s, t) {
  const town = s.neighborhood
  const stage = gardenStage(town?.plot, t)
  return {
    contacts: Object.entries(town?.contacts || {}).map(([kind, row]) => ({
      name: residents[kind].name, place: residents[kind].place, relationship: familiarity(row.visits), visits: row.visits, topic: row.topic,
    })),
    garden: stage ? `金盏菊${stageNames[stage]}` : town?.flowers ? `照料过 ${town.flowers} 盆金盏菊` : '',
    gardenStage: stage,
    book: town?.book ? `${town.book.title} ${town.book.page}/${town.book.pages} 页` : town?.booksRead ? `读完了 ${town.booksRead} 本借来的书` : '',
  }
}

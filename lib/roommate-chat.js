export const FEIBI_NAME = '菲比啾比';
export const formatFeibiLine = (cue) => cue ? FEIBI_NAME + cue.punctuation + '（' + cue.meaning + '）' : '';
export const formatCatText = (text, name = '小猫') => text.replace('{cat}', () => name);
export const formatRoommateTurn = ({ speaker, text, punctuation }, catName) => {
  const line = formatCatText(text, catName);
  return speaker === 'feibi' ? formatFeibiLine({ punctuation, meaning: line }) : line;
};

export const ROOMMATE_TOPICS = {
  snacks: '怎么分饼干',
  cups: '用哪个杯子喝水',
  curtain: '窗帘留多宽的缝',
  cat: '怎么让{cat}主动过来',
  book: '借书和书签',
  music: '刚才放的那首歌',
};

const feibiSays = (text, punctuation = '～') => ({ speaker: 'feibi', text, punctuation });
const whaleSays = (text) => ({ speaker: 'whale', text });
export const roommateTopics = {
  snacks: [
    feibiSays('你还吃饼干吗？我想泡杯茶。', '？'),
    whaleSays('吃啊，给本鱼留两块。'),
    feibiSays('那碎掉的算一块吗？', '？'),
    whaleSays('两块整的。碎的归你。'),
    feibiSays('好，那碎的我先吃掉。'),
  ],
  cups: [
    whaleSays('你要喝水吗？本鱼待会儿去厨房。'),
    feibiSays('要。拿那个蓝杯子就行。'),
    whaleSays('你不是嫌它太大吗？'),
    feibiSays('是啊，可用小杯子得跑两趟。'),
  ],
  curtain: [
    feibiSays('窗帘能留一点缝吗？', '？'),
    whaleSays('行啊。你想看楼下？'),
    feibiSays('嗯。就留这么一点，够我看就行。'),
    whaleSays('那你待会儿走的时候记得拉上。'),
  ],
  cat: [
    feibiSays('{cat}今天肯给你摸脑袋吗？', '？'),
    whaleSays('得等它自己凑过来。本鱼一般就把手搁这儿。'),
    feibiSays('哦，怪不得我一伸手它就走。'),
    whaleSays('你先坐着，等它来闻闻你。'),
  ],
  book: [
    feibiSays('你这本好看吗？看完能借我吗？', '？'),
    whaleSays('好看。本鱼还剩几页，等会儿给你。'),
    feibiSays('那结局先别讲，我想自己看。'),
    whaleSays('行。书签也先借你，别把页角折了。'),
  ],
  music: [
    whaleSays('这首是不是太吵了？本鱼调小一点。'),
    feibiSays('不用，我刚想问你这首叫什么。'),
    whaleSays('等它放完本鱼给你看歌名。'),
    feibiSays('好呀，这段我还想再听一遍。'),
  ],
};

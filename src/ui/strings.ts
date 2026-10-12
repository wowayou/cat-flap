import type { MapId } from '../game/maps.ts';

/** UI copy. Chinese for zh-* browsers, English otherwise. */
export interface Strings {
  lang: string;
  title: string;
  loading: string;
  artLoadFailed: string;
  reload: string;
  tagline: string;
  startTouch: string;
  startMouse: string;
  /** Rendered next to a "Space" keycap: `{key}` is replaced. */
  startKeys: string;
  /** How to glide (every device). */
  startGlide: string;
  mapNames: Record<MapId, string>;
  /** One line on what's different about each map. */
  mapHints: Record<MapId, string>;
  prevMap: string;
  nextMap: string;
  /** Fish snacks eaten (a label for the counters). */
  fish: string;
  /** Accessible text for a map's medal stars. */
  stars: (n: number) => string;
  best: string;
  score: string;
  gameOver: string;
  newBest: string;
  livesLeft: (n: number) => string;
  outOfLives: string;
  newBestQuip: string;
  retry: string;
  chooseMap: string;
  backToChallenge: string;
  goal: (score: number) => string;
  allStars: string;
  groundTip: string;
  obstacleTip: string;
  help: string;
  closeHelp: string;
  helpSteps: readonly { title: string; text: string }[];
  retryTouch: string;
  retryMouse: string;
  paused: string;
  resumeTouch: string;
  resumeMouse: string;
  pause: string;
  resume: string;
  soundOn: string;
  soundOff: string;
  canvasLabel: string;
  spaceKey: string;
  // Challenges (friends' ghosts).
  challengeHeading: string;
  challengeHint: string;
  exitChallenge: string;
  overtook: (names: string) => string;
  you: string;
  standingsLabel: string;
  nameLabel: string;
  namePlaceholder: string;
  defaultName: string;
  shareStart: string;
  shareRelay: string;
  shareText: (score: number, rank: number, total: number, map: string) => string;
  copied: string;
  copyPrompt: string;
  linkOutdated: string;
  linkBroken: string;
  ghostsSkipped: (n: number) => string;
}

const zh: Strings = {
  lang: 'zh-CN',
  title: 'Cat Flap',
  loading: '小猫准备起飞…',
  artLoadFailed: '小猫还没准备好，请重新加载。',
  reload: '重新加载',
  tagline: '点一下，扇一下。',
  startTouch: '轻点屏幕起飞',
  startMouse: '点击鼠标起飞',
  startKeys: '或按 {key}',
  startGlide: '按住不放，披风滑翔',
  mapNames: { garden: '花园围墙', library: '午夜书房', clouds: '云端漫步', moon: '月球' },
  mapHints: {
    garden: '经典猫爬架',
    library: '长书架是隧道，稳住高度',
    clouds: '云柱会上下浮动',
    moon: '低重力，轻飘飘',
  },
  prevMap: '上一张地图',
  nextMap: '下一张地图',
  fish: '小鱼干',
  stars: (n) => `${n}/3 颗星`,
  best: '最高',
  score: '得分',
  gameOver: '游戏结束',
  newBest: '新纪录！',
  livesLeft: (n) => `猫有九条命，还剩 ${n} 条。`,
  outOfLives: '九条命用完了，再借九条。',
  newBestQuip: '今晚加罐头。',
  retry: '再飞一次',
  chooseMap: '返回选图',
  backToChallenge: '返回挑战',
  goal: (score) => `下一颗星：${score} 分`,
  allStars: '三颗星已集齐，挑战新纪录！',
  groundTip: '落地了：连续轻点保持高度，按住只能减慢下落。',
  obstacleTip: '撞到障碍了：看准缺口，提前调整高度，不必追每条鱼。',
  help: '怎么玩',
  closeHelp: '知道了',
  helpSteps: [
    { title: '① 轻点起飞，连续轻点爬升', text: '鼠标、触屏、空格 / ↑ / W 或手柄 A 都可以。松手会下落；穿过一道障碍得 1 分。' },
    { title: '② 按住，打开披风滑翔', text: '越过最高点才会张开，减慢下落，不会自动向上飞。头顶圆环是能量；用完后松开再点一次。' },
    { title: '③ 小鱼干补能量，不加分', text: '披风会自行慢慢回充；吃鱼能回充约三分之一。先安全穿过缺口，再考虑吃鱼。' },
    { title: '④ 四张地图，三个小目标', text: '每张地图 10 / 25 / 50 分各得一颗星，纪录分别保存。首次尝试可选花园；月球下落更慢。' },
    { title: '随时暂停，也能挑战朋友', text: 'P / Esc 或左上角按钮暂停，继续前有 3‑2‑1。结算后发起挑战，朋友会和你的幽灵猫飞同一条航线。' },
  ],
  retryTouch: '也可轻点空白处直接起飞',
  retryMouse: '也可点空白处或按空格直接起飞',
  paused: '暂停中',
  resumeTouch: '轻点继续',
  resumeMouse: '点击或按空格继续',
  pause: '暂停',
  resume: '继续',
  soundOn: '声音：开',
  soundOff: '声音：关',
  canvasLabel: '游戏画面：一只披着红斗篷的猫在障碍之间飞行',
  spaceKey: '空格',
  challengeHeading: '好友挑战',
  challengeHint: '和 TA 们的幽灵猫飞同一条航线',
  exitChallenge: '退出挑战',
  overtook: (names) => `超过 ${names}！`,
  you: '你',
  standingsLabel: '这条航线',
  nameLabel: '昵称',
  namePlaceholder: '你的昵称',
  defaultName: '神秘猫友',
  shareStart: '发起挑战',
  shareRelay: '接力分享',
  shareText: (score, rank, total, map) =>
    total > 1
      ? `我在 Cat Flap「${map}」这条航线飞了 ${score} 分，${total} 只猫里排第 ${rank}。来追我的幽灵猫！`
      : `我在 Cat Flap「${map}」飞了 ${score} 分，来追我的幽灵猫！`,
  copied: '挑战链接已复制，发给好友吧',
  copyPrompt: '复制这个链接发给好友：',
  linkOutdated: '这条挑战来自旧版本，航线变了，先自由飞吧',
  linkBroken: '挑战链接不完整，可能被截断了',
  ghostsSkipped: (n) => `有 ${n} 只幽灵猫对不上航线，已跳过`,
};

const en: Strings = {
  lang: 'en',
  title: 'Cat Flap',
  loading: 'Getting ready to fly…',
  artLoadFailed: 'The cat could not load. Please try again.',
  reload: 'Reload',
  tagline: 'Tap to flap.',
  startTouch: 'Tap to take off',
  startMouse: 'Click to take off',
  startKeys: 'or press {key}',
  startGlide: 'Hold on to glide on your cape',
  mapNames: { garden: 'Garden Wall', library: 'Midnight Library', clouds: 'Cloud Walk', moon: 'The Moon' },
  mapHints: {
    garden: 'The classic cat trees',
    library: 'Long shelves: hold your height',
    clouds: 'Cloud pillars bob up and down',
    moon: 'Low gravity, floaty flaps',
  },
  prevMap: 'Previous map',
  nextMap: 'Next map',
  fish: 'Fish',
  stars: (n) => `${n} of 3 stars`,
  best: 'Best',
  score: 'Score',
  gameOver: 'Game over',
  newBest: 'New best!',
  livesLeft: (n) => `Cats have nine lives. ${n} left.`,
  outOfLives: 'That was life number nine. Borrowing nine more.',
  newBestQuip: 'Extra treats tonight.',
  retry: 'Fly again',
  chooseMap: 'Choose a map',
  backToChallenge: 'Back to challenge',
  goal: (score) => `Next star: ${score} points`,
  allStars: 'All three stars! Beat your best.',
  groundTip: 'Landed! Keep tapping to stay up. Holding only slows your fall.',
  obstacleTip: 'Hit an obstacle! Aim for the gap early. Not every fish is worth the risk.',
  help: 'How to play',
  closeHelp: 'Got it',
  helpSteps: [
    { title: '① Tap to fly, tap again to climb', text: 'Use a mouse, touch, Space / ↑ / W or gamepad A. Release to fall. Clear an obstacle for 1 point.' },
    { title: '② Hold to glide on your cape', text: 'The cape opens after the top of a flap. It slows your fall, not lifts you. The ring shows energy; when empty, release and tap again.' },
    { title: '③ Fish refill energy, not score', text: 'Your cape slowly recharges. Each fish restores about a third. Clear the gap safely before chasing a snack.' },
    { title: '④ Four maps, three small goals', text: 'Earn stars at 10 / 25 / 50 points on each map, with separate bests. Start in the Garden, or try the Moon for a slower fall.' },
    { title: 'Pause anytime. Challenge a friend.', text: 'P / Esc or the top-left button pauses; a 3‑2‑1 gets you ready to resume. Share a run so friends can race your ghost on the same course.' },
  ],
  retryTouch: 'Or tap an empty spot to take off',
  retryMouse: 'Or click an empty spot / press Space',
  paused: 'Paused',
  resumeTouch: 'Tap to continue',
  resumeMouse: 'Click or press Space to continue',
  pause: 'Pause',
  resume: 'Resume',
  soundOn: 'Sound on',
  soundOff: 'Sound off',
  canvasLabel: 'Game view: a caped cat flying between obstacles',
  spaceKey: 'Space',
  challengeHeading: 'Friends\' challenge',
  challengeHint: 'Fly the same course as their ghosts',
  exitChallenge: 'Leave challenge',
  overtook: (names) => `Passed ${names}!`,
  you: 'You',
  standingsLabel: 'This course',
  nameLabel: 'Name',
  namePlaceholder: 'Your name',
  defaultName: 'Mystery cat',
  shareStart: 'Challenge friends',
  shareRelay: 'Pass it on',
  shareText: (score, rank, total, map) =>
    total > 1
      ? `I flew ${score} on this Cat Flap course (${map}): #${rank} of ${total} cats. Chase my ghost!`
      : `I flew ${score} in Cat Flap (${map}). Chase my ghost!`,
  copied: 'Challenge link copied. Send it to a friend!',
  copyPrompt: 'Copy this link and send it to a friend:',
  linkOutdated: 'That challenge is from an older version. Flying a fresh course.',
  linkBroken: 'That challenge link looks cut off.',
  ghostsSkipped: (n) => `${n} ghost${n === 1 ? '' : 's'} didn't match the course and were skipped.`,
};

export function pickStrings(languages: readonly string[]): Strings {
  for (const l of languages) {
    const lower = l.toLowerCase();
    if (lower.startsWith('zh')) return zh;
    if (lower.startsWith('en')) return en;
  }
  return en;
}

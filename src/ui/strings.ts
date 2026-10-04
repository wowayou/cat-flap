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
  best: string;
  score: string;
  gameOver: string;
  newBest: string;
  livesLeft: (n: number) => string;
  outOfLives: string;
  newBestQuip: string;
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
  shareText: (score: number, rank: number, total: number) => string;
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
  best: '最高',
  score: '得分',
  gameOver: '游戏结束',
  newBest: '新纪录！',
  livesLeft: (n) => `猫有九条命，还剩 ${n} 条。`,
  outOfLives: '九条命用完了，再借九条。',
  newBestQuip: '今晚加罐头。',
  retryTouch: '轻点再来一次',
  retryMouse: '点击或按空格再来一次',
  paused: '暂停中',
  resumeTouch: '轻点继续',
  resumeMouse: '点击或按空格继续',
  pause: '暂停',
  resume: '继续',
  soundOn: '声音：开',
  soundOff: '声音：关',
  canvasLabel: '游戏画面：一只披着红斗篷的猫在猫爬架之间飞行',
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
  shareText: (score, rank, total) =>
    total > 1
      ? `我在 Cat Flap 这条航线飞了 ${score} 分，${total} 只猫里排第 ${rank}。来追我的幽灵猫！`
      : `我在 Cat Flap 飞了 ${score} 分，来追我的幽灵猫！`,
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
  best: 'Best',
  score: 'Score',
  gameOver: 'Game over',
  newBest: 'New best!',
  livesLeft: (n) => `Cats have nine lives. ${n} left.`,
  outOfLives: 'That was life number nine. Borrowing nine more.',
  newBestQuip: 'Extra treats tonight.',
  retryTouch: 'Tap to try again',
  retryMouse: 'Click or press Space to try again',
  paused: 'Paused',
  resumeTouch: 'Tap to continue',
  resumeMouse: 'Click or press Space to continue',
  pause: 'Pause',
  resume: 'Resume',
  soundOn: 'Sound on',
  soundOff: 'Sound off',
  canvasLabel: 'Game view: a caped cat flying between scratching posts',
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
  shareText: (score, rank, total) =>
    total > 1
      ? `I flew ${score} on this Cat Flap course: #${rank} of ${total} cats. Chase my ghost!`
      : `I flew ${score} in Cat Flap. Chase my ghost!`,
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

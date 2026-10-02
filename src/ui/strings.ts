/** UI copy. Chinese for zh-* browsers, English otherwise. */
export interface Strings {
  lang: string;
  title: string;
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
}

const zh: Strings = {
  lang: 'zh-CN',
  title: 'Cat Flap',
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
  canvasLabel: '游戏画面：一只长着小翅膀的猫在猫爬架之间飞行',
  spaceKey: '空格',
};

const en: Strings = {
  lang: 'en',
  title: 'Cat Flap',
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
  canvasLabel: 'Game view: a cat with little wings flying between scratching posts',
  spaceKey: 'Space',
};

export function pickStrings(languages: readonly string[]): Strings {
  for (const l of languages) {
    const lower = l.toLowerCase();
    if (lower.startsWith('zh')) return zh;
    if (lower.startsWith('en')) return en;
  }
  return en;
}

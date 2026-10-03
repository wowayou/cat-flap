# 推广与收录素材

## X 帖子

配图用 [`preview.png`](preview.png)（中文界面：好友挑战开始页、超过好友、结算排名）。每条都在 X 的 280 加权字符以内（中日韩文字和 emoji 记 2，链接记 23）。

### 中文

主帖（248/280）：

```text
做了个一键小游戏 Cat Flap 🐱
点一下，披红斗篷的橘猫就往上一冲，从猫爬架之间飞过去。
玩完把这条航线连同你的「幽灵猫」发给朋友：同一条航线异步比赛，不用注册、没有服务器，分数靠重放录像验证。
手机电脑都能玩 👉 https://wowayou.github.io/cat-flap/
#独立游戏 #小游戏
```

回复主帖，讲技术（212/280）：

```text
技术上：模拟固定 120Hz 步长、只用 IEEE 精确运算，所以「种子 + 起飞高度 + 每次点击落在第几步」就能在任何设备上逐位重放整局。
一局每秒约 2–3 字节，50 分的挑战链接也就一两百个字符。零运行时依赖，JS 约 24KB（gzip）。
```

### English

Main post (270/280):

```text
I made Cat Flap, a one-button browser game 🐱
Tap, and a caped ginger cat surges up between scratching posts.
Then send the link: friends race your ghost on the same course. No sign-up, no server; scores are verified by replay.
https://wowayou.github.io/cat-flap/
#indiedev #gamedev
```

Reply (270/280):

```text
How the ghosts work: a fixed 120 Hz sim using only exact IEEE math, so seed + start height + the step of each tap replays bit-for-bit on any device.
~2–3 bytes per second of play; a 50-point challenge link is a couple hundred chars. Zero runtime deps, ~24 KB JS gzipped.
```

## 收录到游戏大厅 [`wowayou/games`](https://github.com/wowayou/games)

Cat Flap 有自己的仓库和 Pages 站点，按大厅里独立游戏的做法只加一条带 `url` 的条目，不复制源码。在 `games.json` 的 `games` 数组里插入：

```json
    {
      "id": "cat-flap",
      "name": "Cat Flap",
      "status": "published",
      "url": "https://wowayou.github.io/cat-flap/",
      "title": ["CAT", "FLAP"],
      "badge": "ONE TAP · FLYING",
      "description": "披红斗篷的橘猫一点就冲：穿过猫爬架，再把幽灵猫发给朋友，在同一条航线上比赛。",
      "tags": ["单指操作", "好友幽灵赛", "手机友好"]
    },
```

- 数组顺序就是展示顺序。放在六点夺秒之后（第 2 位）已验证过：大厅配置测试 13/13 通过，打包为 6 款上架、1 款草稿、22 个文件，桌面和手机宽度下卡片显示正常。
- 其他卡片标题下显示的是中文名；`name` 若保持 `Cat Flap`，会和上面的 `CAT FLAP` 重复，可以换成想要的中文名。
- 如果把本仓库克隆到大厅仓库目录里（和 `cosmic-merge/` 一样），要在大厅的 `.gitignore` 里加上 `/cat-flap/`，那里的独立仓库是逐个列出的。

在大厅仓库根目录验证后再提交推送（推送 `main` 会触发大厅的 Pages 部署）：

```bash
node --test tests/catalog.test.mjs
node scripts/build-site.mjs
```

大厅的 `GAMES-HANDOFF.md` 仓库地图里也可以补一行：`cat-flap`（外链），大厅在架，独立站点。

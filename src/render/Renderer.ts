import { circleHitsObstacle } from '../game/collision.ts';
import { CAT, FAIRNESS, OBSTACLE, WORLD } from '../game/config.ts';
import type { Game, GameEvent } from '../game/Game.ts';
import type { Squad } from '../social/squad.ts';
import { CatAnimator } from './animator.ts';
import { drawCat, drawGhostCat } from './cat.ts';
import { Fx } from './fx.ts';
import { GHOST_COLORS, INK, skyAt, type SkyPalette } from './palette.ts';
import { drawObstacle } from './posts.ts';
import { drawCity, drawClouds, drawSky, drawStars, drawSunMoon, drawWall } from './scenery.ts';
import { computeView, type View } from './view.ts';

export const POPUP_FONT = '700 22px "Fredoka Variable", "Fredoka", ui-rounded, system-ui, sans-serif';
const TAG_FONT = '600 10px "Fredoka Variable", "Fredoka", ui-rounded, "PingFang SC", "Microsoft YaHei", system-ui, sans-serif';
/** Ghosts further than this outside the frame aren't drawn. */
const GHOST_MARGIN = 52;
const GHOST_ALPHA = 0.5;
const TAG_HEIGHT = 14;
/** Rendering resolution cap: beyond 2× the extra pixels cost battery and add nothing visible here. */
const MAX_DPR = 2;

interface NameTag {
  x: number;
  y: number;
  w: number;
  name: string;
}

const clamp01 = (v: number) => (v < 0 ? 0 : v > 1 ? 1 : v);

/** A crashed cat flips belly-up a little above where it fell. */
const deathLift = (game: Game) => (game.phase === 'dying' || game.phase === 'gameover' ? 9 * clamp01((game.time - game.cat.deathAt) / 0.55) : 0);

/**
 * Draws a `Game` — never changes it. Owns only presentation state: the
 * cats' animation, the sky's drift, particles, shake and flash.
 */
export class Renderer {
  readonly fx = new Fx();
  reducedMotion = false;
  debug = false;

  private readonly canvas: HTMLCanvasElement;
  private readonly ctx: CanvasRenderingContext2D;
  private view: View = computeView(WORLD.width, WORLD.height, 1);
  private readonly cat = new CatAnimator();
  private squad: Squad | null = null;
  private ghostAnims: CatAnimator[] = [];
  private ghostGeneration = -1;
  private readonly tags: NameTag[] = [];
  private readonly spareTags: NameTag[] = [];
  private animTime = 0;
  private skyPos = 0;
  private sky: SkyPalette = skyAt(0);
  private skyDrawnAt = 0;
  private fps = 60;

  constructor(canvas: HTMLCanvasElement) {
    this.canvas = canvas;
    const ctx = canvas.getContext('2d', { alpha: false });
    if (!ctx) throw new Error('Canvas 2D is not available');
    this.ctx = ctx;
  }

  get currentView(): View {
    return this.view;
  }

  /** Friends' ghosts to draw alongside the player (null: none). */
  setSquad(squad: Squad | null): void {
    this.squad = squad;
    this.ghostAnims = squad ? squad.rivals.map((_, i) => new CatAnimator(0.9 + i * 1.37)) : [];
    this.ghostGeneration = -1;
  }

  resize(cssWidth: number, cssHeight: number, devicePixelRatio: number): View {
    const dpr = Math.min(MAX_DPR, Math.max(1, devicePixelRatio || 1));
    this.view = computeView(cssWidth, cssHeight, dpr);
    this.canvas.width = Math.round(cssWidth * dpr);
    this.canvas.height = Math.round(cssHeight * dpr);
    return this.view;
  }

  /** React to simulation events with effects. */
  handleEvent(e: GameEvent, game: Game): void {
    const cat = game.cat;
    const wx = game.catWorldX;
    switch (e.type) {
      case 'flap':
        this.fx.puff(wx - 16, cat.y + 10);
        break;
      case 'score':
        this.fx.popup(CAT.x + 4, cat.y - 30, '+1');
        this.fx.sparks(wx + 6, cat.y - 4);
        break;
      case 'bonk':
        if (!this.reducedMotion) this.fx.shake = Math.max(this.fx.shake, 2.5);
        break;
      case 'hit':
        this.fx.furTufts(wx - 4, cat.y - 8);
        this.fx.flash = this.reducedMotion ? 0.35 : 1;
        if (!this.reducedMotion) this.fx.shake = 7;
        break;
      case 'land':
        this.fx.dust(wx, WORLD.groundY);
        break;
      case 'reset':
        // A fresh cat: don't animate the belly-up pose spinning back upright.
        this.fx.clear();
        this.cat.reset();
        break;
      default:
        break;
    }
  }

  render(game: Game, alpha: number, dt: number): void {
    const paused = game.phase === 'paused';
    if (!paused) {
      this.animTime += dt;
      this.fx.update(dt);
    }
    if (dt > 0) this.fps += (1 / dt - this.fps) * 0.05;

    const ctx = this.ctx;
    const v = this.view;
    const scroll = game.prevScroll + (game.scroll - game.prevScroll) * alpha;
    const catY = game.cat.prevY + (game.cat.y - game.cat.prevY) * alpha;

    // Sky drifts towards the current score; on a new run it eases back to sunset.
    this.skyPos += (game.score - this.skyPos) * clamp01(dt * 1.2);
    if (Math.abs(this.skyPos - this.skyDrawnAt) > 0.002) {
      this.sky = skyAt(this.skyPos);
      this.skyDrawnAt = this.skyPos;
    }

    const k = v.dpr * v.scale;
    ctx.setTransform(k, 0, 0, k, v.dpr * v.offsetX, v.dpr * v.offsetY);
    if (this.fx.shake > 0) {
      const s = this.fx.shake;
      ctx.translate(Math.sin(this.animTime * 91) * s, Math.cos(this.animTime * 67) * s);
    }

    drawSky(ctx, v, this.sky);
    drawStars(ctx, v, this.sky, this.animTime, scroll);
    drawSunMoon(ctx, this.sky);
    drawClouds(ctx, v, this.sky, this.animTime, scroll);
    drawCity(ctx, v, this.sky, scroll);
    drawWall(ctx, v, scroll);

    // Gameplay layer, clipped to the fixed world frame.
    ctx.save();
    ctx.beginPath();
    ctx.rect(0, v.top - 20, WORLD.width, v.bottom - v.top + 40);
    ctx.clip();
    for (const o of game.obstacles) {
      if (o.active) drawObstacle(ctx, o, o.x - scroll, v.top - 20);
    }
    this.fx.draw(ctx, scroll);
    if (this.squad?.flying) {
      this.drawGhosts(ctx, game, alpha, paused ? 0 : dt);
      this.drawNameTags(ctx); // over the ghosts, under the player: your own cat is never hidden
    }
    this.cat.update(game, dt, this.animTime, this.reducedMotion);
    const flipLift = deathLift(game);
    drawCat(ctx, CAT.x, catY - flipLift, this.cat.pose);
    if (game.cat.landed) this.drawDizzy(ctx, catY - flipLift);
    this.fx.drawPopups(ctx, POPUP_FONT, INK);
    if (this.debug) this.drawDebug(ctx, game, scroll, catY);
    ctx.restore();

    if (this.fx.flash > 0) {
      ctx.fillStyle = `rgba(255,250,240,${0.55 * this.fx.flash})`;
      ctx.fillRect(v.left - 20, v.top - 20, v.right - v.left + 40, v.bottom - v.top + 40);
    }
    this.drawSurround(ctx);
  }

  /** Friends' ghost cats: translucent, each in its own coat, with a name tag. */
  private drawGhosts(ctx: CanvasRenderingContext2D, player: Game, alpha: number, dt: number): void {
    const squad = this.squad;
    if (!squad) return;
    // Paused replays retain their last two positions while the render-loop
    // fraction keeps changing. Settle on the current tick, like the player.
    if (player.phase === 'paused') alpha = 1;
    if (squad.generation !== this.ghostGeneration) {
      this.ghostGeneration = squad.generation;
      for (const a of this.ghostAnims) a.reset();
    }
    for (let i = 0; i < squad.rivals.length; i++) {
      const r = squad.rivals[i];
      const g = r.replay?.game;
      if (!g) continue;
      const x = squad.screenX(r, player, alpha);
      const anim = this.ghostAnims[i];
      if (player.phase !== 'paused') anim.update(g, dt, this.animTime, this.reducedMotion);
      if (x < -GHOST_MARGIN || x > WORLD.width + GHOST_MARGIN) continue;
      const y = g.cat.prevY + (g.cat.y - g.cat.prevY) * alpha - deathLift(g);
      drawGhostCat(ctx, x, y, anim.pose, GHOST_COLORS[r.coat % GHOST_COLORS.length], GHOST_ALPHA);
      const tag = this.spareTags.pop() ?? { x: 0, y: 0, w: 0, name: '' };
      tag.x = x;
      tag.y = y - 38;
      tag.name = r.ghost.name;
      this.tags.push(tag);
    }
  }

  /** Ghost name tags, nudged apart so none hides another. */
  private drawNameTags(ctx: CanvasRenderingContext2D): void {
    const tags = this.tags;
    if (tags.length === 0) return;
    ctx.font = TAG_FONT;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    for (const t of tags) t.w = ctx.measureText(t.name).width + 10;
    tags.sort((a, b) => a.y - b.y);
    for (let i = 1; i < tags.length; i++) {
      for (let j = 0; j < i; j++) {
        const a = tags[j];
        const b = tags[i];
        if (Math.abs(a.x - b.x) < (a.w + b.w) / 2 && Math.abs(a.y - b.y) < TAG_HEIGHT + 1) b.y = a.y + TAG_HEIGHT + 1;
      }
    }
    for (const t of tags) {
      ctx.globalAlpha = 0.85;
      ctx.fillStyle = 'rgba(42,27,61,0.8)';
      ctx.beginPath();
      ctx.roundRect(t.x - t.w / 2, t.y - TAG_HEIGHT / 2, t.w, TAG_HEIGHT, TAG_HEIGHT / 2);
      ctx.fill();
      ctx.fillStyle = '#fff4e0';
      ctx.fillText(t.name, t.x, t.y + 0.5);
    }
    ctx.globalAlpha = 1;
    while (tags.length > 0) this.spareTags.push(tags.pop()!);
  }

  /** Cartoon dizzy stars circling over the fallen cat. */
  private drawDizzy(ctx: CanvasRenderingContext2D, catY: number): void {
    const cx = CAT.x - 4;
    const cy = catY - 24;
    ctx.fillStyle = '#ffd86b';
    ctx.strokeStyle = INK;
    ctx.lineWidth = 1.2;
    for (let i = 0; i < 3; i++) {
      const a = this.animTime * 3.2 + (i * Math.PI * 2) / 3;
      const x = cx + Math.cos(a) * 15;
      const y = cy + Math.sin(a) * 4.5;
      const s = 3.6 + Math.sin(a) * 0.8;
      ctx.beginPath();
      for (let j = 0; j < 10; j++) {
        const r = j % 2 === 0 ? s : s * 0.45;
        const b = (j * Math.PI) / 5 - Math.PI / 2;
        if (j === 0) ctx.moveTo(x + Math.cos(b) * r, y + Math.sin(b) * r);
        else ctx.lineTo(x + Math.cos(b) * r, y + Math.sin(b) * r);
      }
      ctx.closePath();
      ctx.fill();
      ctx.stroke();
    }
  }

  /** On screens wider than the world, dim everything outside the frame so the play area reads as a window. */
  private drawSurround(ctx: CanvasRenderingContext2D): void {
    const v = this.view;
    if (v.left >= -0.5) return;
    const h = v.bottom - v.top;
    ctx.fillStyle = 'rgba(16,10,34,0.62)';
    ctx.fillRect(v.left, v.top, -v.left, h);
    ctx.fillRect(WORLD.width, v.top, v.right - WORLD.width, h);
    const edge = (x: number, dir: number) => {
      const g = ctx.createLinearGradient(x, 0, x + dir * 14, 0);
      g.addColorStop(0, 'rgba(16,10,34,0.35)');
      g.addColorStop(1, 'rgba(16,10,34,0)');
      ctx.fillStyle = g;
      ctx.fillRect(Math.min(x, x + dir * 14), v.top, 14, h);
    };
    edge(0, 1);
    edge(WORLD.width, -1);
    ctx.strokeStyle = INK;
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.moveTo(0, v.top);
    ctx.lineTo(0, v.bottom);
    ctx.moveTo(WORLD.width, v.top);
    ctx.lineTo(WORLD.width, v.bottom);
    ctx.stroke();
  }

  private drawDebug(ctx: CanvasRenderingContext2D, game: Game, scroll: number, catY: number): void {
    const r = CAT.hitboxRadius;
    ctx.lineWidth = 1;
    ctx.strokeStyle = '#ff3b6b';
    ctx.beginPath();
    ctx.arc(CAT.x, catY, r, 0, Math.PI * 2);
    ctx.stroke();
    ctx.strokeStyle = '#00e5ff';
    const inset = FAIRNESS.collisionInset;
    for (const o of game.obstacles) {
      if (!o.active) continue;
      const x = o.x - scroll;
      const top = o.gapY - o.gap / 2;
      const bottom = o.gapY + o.gap / 2;
      const px = x + (OBSTACLE.capWidth - OBSTACLE.postWidth) / 2;
      ctx.strokeRect(x + inset, top - OBSTACLE.capHeight + inset, OBSTACLE.capWidth - 2 * inset, OBSTACLE.capHeight - 2 * inset);
      ctx.strokeRect(x + inset, bottom + inset, OBSTACLE.capWidth - 2 * inset, OBSTACLE.capHeight - 2 * inset);
      ctx.strokeRect(px + inset, -1000, OBSTACLE.postWidth - 2 * inset, top - OBSTACLE.capHeight + inset + 1000);
      ctx.strokeRect(px + inset, bottom + OBSTACLE.capHeight - inset, OBSTACLE.postWidth - 2 * inset, 1000);
      if (circleHitsObstacle(game.scroll + CAT.x, game.cat.y, r, o)) {
        ctx.fillStyle = 'rgba(255,59,107,0.3)';
        ctx.fillRect(x, top - 40, OBSTACLE.capWidth, o.gap + 80);
      }
    }
    ctx.fillStyle = '#fff';
    ctx.font = '11px ui-monospace, monospace';
    ctx.textAlign = 'left';
    ctx.textBaseline = 'top';
    ctx.fillText(`${Math.round(this.fps)} fps  seed ${game.seed}  speed ${game.speed.toFixed(0)}  ${game.phase}`, 6, 6);
  }
}

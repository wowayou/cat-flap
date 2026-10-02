import { circleHitsObstacle } from '../game/collision.ts';
import { CAT, FAIRNESS, OBSTACLE, WORLD } from '../game/config.ts';
import type { Game, GameEvent } from '../game/Game.ts';
import { DEFAULT_POSE, drawCat, type CatPose } from './cat.ts';
import { Fx } from './fx.ts';
import { INK, skyAt, type SkyPalette } from './palette.ts';
import { drawObstacle } from './posts.ts';
import { drawCity, drawClouds, drawSky, drawStars, drawSunMoon, drawWall } from './scenery.ts';
import { computeView, type View } from './view.ts';

export const POPUP_FONT = '700 22px "Fredoka Variable", "Fredoka", ui-rounded, system-ui, sans-serif';
/** Rendering resolution cap: beyond 2× the extra pixels cost battery and add nothing visible here. */
const MAX_DPR = 2;

const clamp01 = (v: number) => (v < 0 ? 0 : v > 1 ? 1 : v);

/**
 * Draws a `Game` — never changes it. Owns only presentation state: the
 * smoothed tilt of the cat, the sky's drift, particles, shake and flash.
 */
export class Renderer {
  readonly fx = new Fx();
  reducedMotion = false;
  debug = false;

  private readonly canvas: HTMLCanvasElement;
  private readonly ctx: CanvasRenderingContext2D;
  private view: View = computeView(WORLD.width, WORLD.height, 1);
  private readonly pose: CatPose = { ...DEFAULT_POSE };
  private deathTilt = 0;
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
        this.deathTilt = this.pose.tilt;
        this.fx.feathers(wx - 4, cat.y - 8);
        this.fx.flash = this.reducedMotion ? 0.35 : 1;
        if (!this.reducedMotion) this.fx.shake = 7;
        break;
      case 'land':
        this.fx.dust(wx, WORLD.groundY);
        break;
      case 'reset':
        // A fresh cat: don't animate the belly-up pose spinning back upright.
        this.fx.clear();
        this.pose.tilt = 0;
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
    this.updatePose(game, dt);
    const flipLift = game.phase === 'dying' || game.phase === 'gameover' ? 9 * clamp01((game.time - game.cat.deathAt) / 0.55) : 0;
    drawCat(ctx, CAT.x, catY - flipLift, this.pose);
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

  private updatePose(game: Game, dt: number): void {
    const p = this.pose;
    const cat = game.cat;
    const t = game.time;
    const ease = (rate: number) => 1 - Math.exp(-rate * dt);

    if (game.phase === 'dying' || game.phase === 'gameover') {
      // Lose control: spin belly-up while falling, land with a squash.
      const flip = clamp01((t - cat.deathAt) / 0.55);
      const e = 1 - (1 - flip) * (1 - flip);
      p.tilt = this.deathTilt + (Math.PI - this.deathTilt) * e;
      const q = cat.landed ? clamp01(1 - (t - cat.landAt) / 0.25) : 0;
      p.scaleX = 1 + 0.2 * q;
      p.scaleY = 1 - 0.2 * q;
      p.wing = 0.75;
      p.legs = 1;
      p.eyes = 'dead';
      p.mouth = 'tongue';
      p.tail = 0.5 + (cat.landed ? Math.sin(this.animTime * 2) * 0.08 : 0);
      return;
    }

    const ready = game.phase === 'ready';
    const vy = ready ? 0 : cat.vy;
    const target = ready ? Math.sin(this.animTime * 1.7) * 0.06 : Math.max(-0.45, Math.min(1.05, vy * 0.0017));
    // Snap up on a flap, lean into a dive more lazily.
    p.tilt += (target - p.tilt) * ease(target < p.tilt ? 20 : 6);

    const since = t - cat.flapAt;
    if (since < 0.07) p.wing = since / 0.07;
    else if (since < 0.3) p.wing = 1 - (since - 0.07) / 0.23;
    else p.wing = ready ? 0.4 + 0.4 * Math.sin(this.animTime * 11) : 0.12 + 0.08 * Math.sin(this.animTime * 7);

    const stretch = clamp01(1 - since / 0.16);
    const bonk = clamp01(1 - (t - cat.bonkAt) / 0.14);
    p.scaleX = 1 - 0.1 * stretch + 0.12 * bonk;
    p.scaleY = 1 + 0.13 * stretch - 0.12 * bonk;

    p.legs = ready ? -0.15 : Math.max(-1, Math.min(1, vy / 420));
    const panic = vy > 560;
    p.eyes = panic ? 'wide' : this.animTime % 3.3 < 0.12 ? 'blink' : 'open';
    p.mouth = panic ? 'open' : 'smile';
    p.tail = Math.sin(this.animTime * 4) * 0.18 + Math.max(-0.35, Math.min(0.35, -vy * 0.0007));
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

// Count visible play, stopping at 60 seconds without an interaction.
export class PlayClock {
  lastInterval = { start: 0, end: 0 };
  private checkpoint: number;
  private interaction: number;
  private visible = true;
  constructor(now: number) {
    this.checkpoint = now;
    this.interaction = now;
  }
  tick(now: number): number {
    this.lastInterval = {
      start: this.checkpoint,
      end: this.visible
        ? Math.max(this.checkpoint, Math.min(now, this.interaction + 60_000))
        : this.checkpoint,
    };
    const elapsed = this.visible
      ? Math.max(0, Math.min(now, this.interaction + 60_000) - this.checkpoint)
      : 0;
    this.checkpoint = now;
    return elapsed;
  }
  touch(now: number) {
    const elapsed = this.tick(now);
    this.interaction = now;
    return elapsed;
  }
  visibility(now: number, visible: boolean) {
    const elapsed = this.tick(now);
    this.visible = visible;
    if (visible) this.interaction = now;
    return elapsed;
  }
  active(now: number) {
    return this.visible && now < this.interaction + 60_000;
  }
}

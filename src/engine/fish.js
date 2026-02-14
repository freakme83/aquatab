export class Fish {
  constructor(bounds) {
    this.bounds = bounds;
    this.position = { x: bounds.width * 0.5, y: bounds.height * 0.5 };
    this.size = 18;
    this.colorHue = 24;
    this.headingAngle = 0;
  }
  update(_dt) {}
  heading() { return this.headingAngle; }
}

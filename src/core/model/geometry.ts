/**
 * Pure geometry on plain numbers, shared by `layout` (clip connector ends to the real outline of a shape) and
 * `validate` (measure the gap to that outline, find connectors that cross nodes, labels or each other).
 * Architecture sections 6.1 and 6.4; requirements FR-6 and FR-14.
 *
 * Rules that hold for every function here:
 *
 * - No I/O, no clock, no random numbers and no state: the same input gives the same output (NFR-1).
 * - Coordinates are CSS pixels with the y axis pointing down, like the SVG output.
 * - Input is checked once at the boundary: a coordinate that is NaN, infinite or larger than
 *   {@link COORDINATE_LIMIT} in magnitude, a box with a negative size, or a negative tolerance throws a
 *   `RangeError` (a bug in the caller, like `formatNumber`). Valid input never produces NaN or an infinity.
 * - Degenerate input has a defined result: a zero-size box has a zero-size outline (a point or a segment), a
 *   zero-length segment behaves as a point, collinear and parallel segments never divide by zero.
 * - Boxes are closed rectangles `{x, y, w, h}`; "interior" means the open rectangle. A `margin` is a clearance:
 *   positive widens the test (things closer than the margin count), negative is a tolerance (shallow overlaps
 *   are ignored).
 * - Curved shapes are approximated by polygons that stay within 0.25 px of the drawn curve for corner radii up to
 *   100 px. The polygon is the one definition of "the real outline" used for distances and clipping; the
 *   caller adds the 4 px tolerance for curves from architecture section 7.4, not this module.
 */

import type { Shape } from "./enums.js";
import type { Box, Point } from "./types.js";

/**
 * Smallest length, in pixels, that this module treats as non-zero: segments shorter than this are points,
 * contacts closer than this touch, and a segment must enter an interior by more than this to "go through" it.
 *
 * 1e-9 px is far below the 0.01 px accuracy the outputs promise (numbers are written with two decimals) and
 * far above the rounding error of double arithmetic for coordinates up to about 1e6 px, so it absorbs rounding
 * noise without ever hiding a real gap.
 */
export const EPSILON = 1e-9;

/**
 * Largest coordinate magnitude accepted. Squared differences of two such values (about 4e200) still fit in a
 * double, so no intermediate result can overflow to an infinity.
 */
export const COORDINATE_LIMIT = 1e100;

/** Segments used per quarter turn of a curve: 7.5 degrees per segment, which gives the 0.25 px bound above. */
export const ARC_SEGMENTS_PER_QUARTER = 12;

/**
 * Sizes, in pixels, that define the outline of the shapes. They describe the same drawing as the SVG renderer
 * (the research prototype's `shapeSvg`), so a change here must change the renderer too.
 */
export const SHAPE_METRICS = Object.freeze({
  /** Corner radius of `rect` (clamped to half the width and half the height). */
  rectCornerRadius: 8,
  /** Horizontal inset of the upper and lower edge of `hexagon`. */
  hexagonInset: 14,
  /** Height of the elliptical cap of `cylinder`. */
  cylinderCapHeight: 7,
  /** Horizontal radius of the elliptical ends of `pipe`. */
  pipeCapWidth: 9,
  /** Radius of the head of `person`. */
  personHeadRadius: 12,
  /** Distance from the top of the box to the centre of the head of `person`. */
  personHeadCentreY: 13,
  /** Distance from the top of the box to the top of the body of `person`. */
  personBodyTop: 16,
  /** Corner radius of the body of `person`. */
  personBodyCornerRadius: 14,
});

// Two directions closer than this sine of an angle are parallel. About 1e-12 rad, still far from the 1e-16 of
// double rounding, so segments that cross at a real angle are never mistaken for parallel ones.
const PARALLEL_SINE = 1e-12;

// ---------------------------------------------------------------------------------------------------------
// Input checks

function checkNumber(value: number, what: string): void {
  // Written as a negation so that NaN fails too.
  if (!(Math.abs(value) <= COORDINATE_LIMIT)) {
    throw new RangeError(`${what} must be a finite number of at most ${String(COORDINATE_LIMIT)}, got ${String(value)}`);
  }
}

function checkPoint(point: Point, what: string): void {
  checkNumber(point.x, `${what}.x`);
  checkNumber(point.y, `${what}.y`);
}

function checkBox(box: Box, what: string): void {
  checkNumber(box.x, `${what}.x`);
  checkNumber(box.y, `${what}.y`);
  checkNumber(box.w, `${what}.w`);
  checkNumber(box.h, `${what}.h`);
  if (box.w < 0 || box.h < 0) {
    throw new RangeError(`${what} must not have a negative size, got ${String(box.w)} x ${String(box.h)}`);
  }
}

function checkPoints(points: readonly Point[], what: string, minimum: number): void {
  if (points.length < minimum) {
    throw new RangeError(`${what} needs at least ${String(minimum)} point(s), got ${String(points.length)}`);
  }
  for (const point of points) {
    checkPoint(point, what);
  }
}

function checkTolerance(value: number, what: string): void {
  checkNumber(value, what);
  if (value < 0) {
    throw new RangeError(`${what} must not be negative, got ${String(value)}`);
  }
}

// ---------------------------------------------------------------------------------------------------------
// Points and polylines

/** Manhattan (taxicab) distance between two points: `|dx| + |dy|`. */
export function manhattanDistance(a: Point, b: Point): number {
  checkPoint(a, "a");
  checkPoint(b, "b");
  return Math.abs(a.x - b.x) + Math.abs(a.y - b.y);
}

/** Length of a polyline: the sum of its segment lengths. Zero or one point have length 0. */
export function polylineLength(points: readonly Point[]): number {
  checkPoints(points, "points", 0);
  let length = 0;
  for (let i = 1; i < points.length; i++) {
    const a = points[i - 1];
    const b = points[i];
    if (a !== undefined && b !== undefined) {
      length += Math.hypot(b.x - a.x, b.y - a.y);
    }
  }
  return length;
}

function nearestOnSegment(point: Point, a: Point, b: Point): Point {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const lengthSquared = dx * dx + dy * dy;
  if (lengthSquared === 0) {
    return { x: a.x, y: a.y };
  }
  const t = Math.max(0, Math.min(1, ((point.x - a.x) * dx + (point.y - a.y) * dy) / lengthSquared));
  return { x: a.x + dx * t, y: a.y + dy * t };
}

/** The point of the segment `a`-`b` closest to `point`. A zero-length segment is the point `a`. */
export function nearestPointOnSegment(point: Point, a: Point, b: Point): Point {
  checkPoint(point, "point");
  checkPoint(a, "a");
  checkPoint(b, "b");
  return nearestOnSegment(point, a, b);
}

// Nearest point of a chain of segments; `closed` adds the segment from the last point back to the first.
// On a tie the earlier segment wins, so the result does not depend on anything but the input order.
function nearestOnChain(point: Point, points: readonly Point[], closed: boolean): Point {
  const first = points[0];
  if (first === undefined) {
    throw new RangeError("a polyline needs at least 1 point, got 0");
  }
  let best: Point = { x: first.x, y: first.y };
  let bestDistance = Math.hypot(point.x - first.x, point.y - first.y);
  const count = closed ? points.length : points.length - 1;
  for (let i = 0; i < count; i++) {
    const a = points[i];
    const b = points[(i + 1) % points.length];
    if (a === undefined || b === undefined) {
      continue;
    }
    const candidate = nearestOnSegment(point, a, b);
    const distance = Math.hypot(point.x - candidate.x, point.y - candidate.y);
    if (distance < bestDistance) {
      best = candidate;
      bestDistance = distance;
    }
  }
  return best;
}

/** The point of the polyline closest to `point`. One point is a polyline; an empty one throws a `RangeError`. */
export function nearestPointOnPolyline(point: Point, points: readonly Point[]): Point {
  checkPoint(point, "point");
  checkPoints(points, "points", 1);
  return nearestOnChain(point, points, false);
}

/** Distance from `point` to the polyline (to its single point when it has one). An empty one throws. */
export function distanceToPolyline(point: Point, points: readonly Point[]): number {
  const nearest = nearestPointOnPolyline(point, points);
  return Math.hypot(point.x - nearest.x, point.y - nearest.y);
}

// ---------------------------------------------------------------------------------------------------------
// Boxes

/**
 * Whether `point` lies in the closed box (its edges and corners count), grown by `margin` on every side
 * (shrunk when negative). A box shrunk to nothing contains no point.
 */
export function pointInBox(point: Point, box: Box, margin = 0): boolean {
  checkPoint(point, "point");
  checkBox(box, "box");
  checkNumber(margin, "margin");
  return (
    point.x >= box.x - margin &&
    point.x <= box.x + box.w + margin &&
    point.y >= box.y - margin &&
    point.y <= box.y + box.h + margin
  );
}

/**
 * Whether `inner` lies inside `outer`, edges included. A positive `tolerance` accepts `inner` that sticks out
 * of `outer` by up to that many pixels on any side.
 */
export function boxContainsBox(outer: Box, inner: Box, tolerance = 0): boolean {
  checkBox(outer, "outer");
  checkBox(inner, "inner");
  checkTolerance(tolerance, "tolerance");
  return (
    inner.x >= outer.x - tolerance &&
    inner.y >= outer.y - tolerance &&
    inner.x + inner.w <= outer.x + outer.w + tolerance &&
    inner.y + inner.h <= outer.y + outer.h + tolerance
  );
}

/**
 * Whether the interiors of two boxes overlap by more than `-margin` on both axes. With margin 0, boxes that
 * only touch do not intersect, and a box without area never intersects anything. A positive margin is a
 * clearance: boxes closer than `margin` on both axes count as intersecting. A negative margin is a
 * tolerance: boxes must overlap by more than `-margin`. Symmetric in `a` and `b`.
 */
export function boxesIntersect(a: Box, b: Box, margin = 0): boolean {
  checkBox(a, "a");
  checkBox(b, "b");
  checkNumber(margin, "margin");
  const overlapX = Math.min(a.x + a.w, b.x + b.w) - Math.max(a.x, b.x);
  const overlapY = Math.min(a.y + a.h, b.y + b.h) - Math.max(a.y, b.y);
  return overlapX > -margin && overlapY > -margin;
}

/** The four corners of a box, clockwise from the top-left corner (a point or a segment when it has no area). */
export function boxOutline(box: Box): Point[] {
  checkBox(box, "box");
  return mergeClose([
    { x: box.x, y: box.y },
    { x: box.x + box.w, y: box.y },
    { x: box.x + box.w, y: box.y + box.h },
    { x: box.x, y: box.y + box.h },
  ]);
}

// ---------------------------------------------------------------------------------------------------------
// Segments

/**
 * Whether the segment `p`-`q` goes through the interior of `box` grown by `margin` (shrunk when negative).
 * A segment that only touches the edge or a corner, runs along an edge, or ends exactly on it does not: it has
 * to be inside by more than {@link EPSILON}. A zero-length segment is a point that must lie strictly inside.
 * Symmetric in the direction of the segment (Liang-Barsky clipping).
 */
export function segmentIntersectsBox(p: Point, q: Point, box: Box, margin = 0): boolean {
  checkPoint(p, "p");
  checkPoint(q, "q");
  checkBox(box, "box");
  checkNumber(margin, "margin");
  const left = box.x - margin;
  const top = box.y - margin;
  const right = box.x + box.w + margin;
  const bottom = box.y + box.h + margin;
  if (right <= left || bottom <= top) {
    return false;
  }
  const dx = q.x - p.x;
  const dy = q.y - p.y;
  const length = Math.hypot(dx, dy);
  if (length <= EPSILON) {
    return p.x > left && p.x < right && p.y > top && p.y < bottom;
  }
  let t0 = 0;
  let t1 = 1;
  // One slab of Liang-Barsky: `direction` is the change of the coordinate along the segment, `room` the
  // distance from p to the slab limit measured in that direction. Returns false when the segment misses.
  const clip = (direction: number, room: number): boolean => {
    if (Math.abs(direction) <= EPSILON) {
      // Parallel to the limit: only a segment strictly on the inner side can be inside.
      return room > EPSILON;
    }
    const t = room / direction;
    if (direction < 0) {
      if (t > t1) {
        return false;
      }
      t0 = Math.max(t0, t);
    } else {
      if (t < t0) {
        return false;
      }
      t1 = Math.min(t1, t);
    }
    return true;
  };
  const inside =
    clip(-dx, p.x - left) && clip(dx, right - p.x) && clip(-dy, p.y - top) && clip(dy, bottom - p.y);
  return inside && (t1 - t0) * length > EPSILON;
}

// Orientation of c relative to the directed line a->b: +1 or -1 when c is further than EPSILON from the line,
// else 0 (on the line, or a-b is shorter than EPSILON).
function side(a: Point, b: Point, c: Point): -1 | 0 | 1 {
  const length = Math.hypot(b.x - a.x, b.y - a.y);
  if (length <= EPSILON) {
    return 0;
  }
  const distance = ((b.x - a.x) * (c.y - a.y) - (b.y - a.y) * (c.x - a.x)) / length;
  if (distance > EPSILON) {
    return 1;
  }
  return distance < -EPSILON ? -1 : 0;
}

function properCross(p: Point, q: Point, r: Point, s: Point): boolean {
  return side(p, q, r) * side(p, q, s) < 0 && side(r, s, p) * side(r, s, q) < 0;
}

/**
 * Whether the segments `p`-`q` and `r`-`s` cross at a point that is interior to both. Touching at an end
 * (a T or L junction, a shared end point), collinear overlap, parallel segments and zero-length segments do not
 * count. Symmetric in the segments and in the direction of each.
 */
export function segmentsCross(p: Point, q: Point, r: Point, s: Point): boolean {
  checkPoint(p, "p");
  checkPoint(q, "q");
  checkPoint(r, "r");
  checkPoint(s, "s");
  return properCross(p, q, r, s);
}

/**
 * Number of pairs of segments, one from each polyline, that cross as in {@link segmentsCross}. A crossing that
 * falls exactly on a vertex of a polyline is a touch for both of its segments and is not counted. Cost is the
 * product of the segment counts. Fewer than two points have no segment.
 */
export function countPolylineCrossings(a: readonly Point[], b: readonly Point[]): number {
  checkPoints(a, "a", 0);
  checkPoints(b, "b", 0);
  let count = 0;
  for (let i = 1; i < a.length; i++) {
    const p = a[i - 1];
    const q = a[i];
    for (let j = 1; j < b.length; j++) {
      const r = b[j - 1];
      const s = b[j];
      if (p !== undefined && q !== undefined && r !== undefined && s !== undefined && properCross(p, q, r, s)) {
        count++;
      }
    }
  }
  return count;
}

/**
 * Length of the stretch over which the segments `p`-`q` and `r`-`s` run on top of each other: both end points
 * of `r`-`s` must be within `offset` pixels of the line through `p`-`q` (parallel and, up to `offset`,
 * collinear). 0 for segments that are not parallel, are further apart, or only meet at an end; 0 when `p`-`q`
 * is shorter than {@link EPSILON}. The offset is measured from the line through `p`-`q`, so with a positive
 * `offset` the result is not exactly symmetric in the two segments; callers that compare edges pass a small
 * `offset` such as 1.5 px.
 */
export function segmentOverlapLength(p: Point, q: Point, r: Point, s: Point, offset = EPSILON): number {
  checkPoint(p, "p");
  checkPoint(q, "q");
  checkPoint(r, "r");
  checkPoint(s, "s");
  checkTolerance(offset, "offset");
  const length = Math.hypot(q.x - p.x, q.y - p.y);
  if (length <= EPSILON) {
    return 0;
  }
  const ux = (q.x - p.x) / length;
  const uy = (q.y - p.y) / length;
  const offsetR = Math.abs(ux * (r.y - p.y) - uy * (r.x - p.x));
  const offsetS = Math.abs(ux * (s.y - p.y) - uy * (s.x - p.x));
  if (offsetR > offset || offsetS > offset) {
    return 0;
  }
  const alongR = ux * (r.x - p.x) + uy * (r.y - p.y);
  const alongS = ux * (s.x - p.x) + uy * (s.y - p.y);
  const overlap = Math.min(length, Math.max(alongR, alongS)) - Math.max(0, Math.min(alongR, alongS));
  return Math.max(0, overlap);
}

// ---------------------------------------------------------------------------------------------------------
// Polygons: the outline of a shape is a closed ring of points

// Ring without consecutive points closer than EPSILON (also between the last and the first point).
function mergeClose(points: Point[]): Point[] {
  const result: Point[] = [];
  for (const point of points) {
    const last = result[result.length - 1];
    if (last === undefined || Math.abs(point.x - last.x) > EPSILON || Math.abs(point.y - last.y) > EPSILON) {
      result.push(point);
    }
  }
  const first = result[0];
  const last = result[result.length - 1];
  if (result.length > 1 && first !== undefined && last !== undefined) {
    if (Math.abs(first.x - last.x) <= EPSILON && Math.abs(first.y - last.y) <= EPSILON) {
      result.pop();
    }
  }
  return result;
}

// Smallest parameter t in [0, 1] at which the segment p->q meets the segment a->b, or null. Handles zero-length
// segments on either side and collinear overlap (the start of the overlap is reported).
function firstContact(p: Point, q: Point, a: Point, b: Point): number | null {
  const dx = q.x - p.x;
  const dy = q.y - p.y;
  const ex = b.x - a.x;
  const ey = b.y - a.y;
  const length = Math.hypot(dx, dy);
  const edgeLength = Math.hypot(ex, ey);
  if (length <= EPSILON) {
    const nearest = nearestOnSegment(p, a, b);
    return Math.hypot(p.x - nearest.x, p.y - nearest.y) <= EPSILON ? 0 : null;
  }
  if (edgeLength <= EPSILON) {
    const onSegment = nearestOnSegment(a, p, q);
    if (Math.hypot(a.x - onSegment.x, a.y - onSegment.y) > EPSILON) {
      return null;
    }
    return Math.hypot(onSegment.x - p.x, onSegment.y - p.y) / length;
  }
  const denominator = dx * ey - dy * ex;
  if (Math.abs(denominator) <= PARALLEL_SINE * length * edgeLength) {
    // Parallel: they meet only when a lies on the line p-q, and then along the overlap of the two ranges.
    const offset = Math.abs((a.x - p.x) * dy - (a.y - p.y) * dx) / length;
    if (offset > EPSILON) {
      return null;
    }
    const scale = length * length;
    const ta = ((a.x - p.x) * dx + (a.y - p.y) * dy) / scale;
    const tb = ((b.x - p.x) * dx + (b.y - p.y) * dy) / scale;
    const low = Math.max(0, Math.min(ta, tb));
    const high = Math.min(1, Math.max(ta, tb));
    return low <= high + EPSILON / length ? Math.min(1, low) : null;
  }
  const t = ((a.x - p.x) * ey - (a.y - p.y) * ex) / denominator;
  const u = ((a.x - p.x) * dy - (a.y - p.y) * dx) / denominator;
  const tTolerance = EPSILON / length;
  const uTolerance = EPSILON / edgeLength;
  if (t < -tTolerance || t > 1 + tTolerance || u < -uTolerance || u > 1 + uTolerance) {
    return null;
  }
  return Math.max(0, Math.min(1, t));
}

function clipToRing(from: Point, to: Point, polygon: readonly Point[]): Point | null {
  let best: number | null = null;
  for (let i = 0; i < polygon.length; i++) {
    const a = polygon[i];
    const b = polygon[(i + 1) % polygon.length];
    if (a === undefined || b === undefined) {
      continue;
    }
    const t = firstContact(from, to, a, b);
    if (t !== null && (best === null || t < best)) {
      best = t;
    }
  }
  if (best === null) {
    return null;
  }
  if (best <= 0) {
    return { x: from.x, y: from.y };
  }
  if (best >= 1) {
    return { x: to.x, y: to.y };
  }
  return { x: from.x + (to.x - from.x) * best, y: from.y + (to.y - from.y) * best };
}

/** The point of the closed polygon (its last point joins its first) closest to `point`. */
export function nearestPointOnPolygon(point: Point, polygon: readonly Point[]): Point {
  checkPoint(point, "point");
  checkPoints(polygon, "polygon", 1);
  return nearestOnChain(point, polygon, true);
}

/** Distance from `point` to the closed polygon's boundary, from inside or outside. */
export function distanceToPolygon(point: Point, polygon: readonly Point[]): number {
  const nearest = nearestPointOnPolygon(point, polygon);
  return Math.hypot(point.x - nearest.x, point.y - nearest.y);
}

/**
 * Where the segment `from`-`to` first meets the boundary of the closed polygon, walking from `from`: the
 * point where it enters when `from` is outside, where it leaves when `from` is inside, `from` itself when it is
 * on the boundary. `null` when the segment does not reach the boundary, so the caller decides what an edge that
 * stops short of its node means. Idempotent: clipping `from`-`result` returns `result` again.
 */
export function clipSegmentToPolygon(from: Point, to: Point, polygon: readonly Point[]): Point | null {
  checkPoint(from, "from");
  checkPoint(to, "to");
  checkPoints(polygon, "polygon", 1);
  return clipToRing(from, to, polygon);
}

/**
 * Like {@link clipSegmentToPolygon} for the ray that starts at `origin` and runs through `through`, as far as
 * needed: the way an edge end is moved from the bounding box of a node onto its outline. `null` when the ray
 * misses the polygon or `through` is closer than {@link EPSILON} to `origin` (no direction).
 */
export function clipRayToPolygon(origin: Point, through: Point, polygon: readonly Point[]): Point | null {
  checkPoint(origin, "origin");
  checkPoint(through, "through");
  checkPoints(polygon, "polygon", 1);
  const dx = through.x - origin.x;
  const dy = through.y - origin.y;
  const length = Math.hypot(dx, dy);
  if (length <= EPSILON) {
    return null;
  }
  // Every boundary point is within the distance of the farthest vertex (distance is convex along an edge).
  let reach = 0;
  for (const vertex of polygon) {
    reach = Math.max(reach, Math.hypot(vertex.x - origin.x, vertex.y - origin.y));
  }
  reach += 1;
  const far = { x: origin.x + (dx / length) * reach, y: origin.y + (dy / length) * reach };
  return clipToRing(origin, far, polygon);
}

// ---------------------------------------------------------------------------------------------------------
// Outline of each shape

// Points of an elliptical arc from angle `from` to angle `to` (radians; 0 is right, pi/2 is down on screen),
// both ends included, with ARC_SEGMENTS_PER_QUARTER segments per quarter turn.
function arc(cx: number, cy: number, rx: number, ry: number, from: number, to: number): Point[] {
  const sweep = to - from;
  const segments = Math.max(1, Math.ceil((Math.abs(sweep) / (Math.PI / 2)) * ARC_SEGMENTS_PER_QUARTER - 1e-9));
  const points: Point[] = [];
  for (let i = 0; i <= segments; i++) {
    const angle = from + (sweep * i) / segments;
    points.push({ x: cx + rx * Math.cos(angle), y: cy + ry * Math.sin(angle) });
  }
  return points;
}

// Rectangle with circular corners, clockwise from the top-left corner.
function roundedRectangle(x: number, y: number, w: number, h: number, radius: number): Point[] {
  const r = Math.max(0, Math.min(radius, w / 2, h / 2));
  const quarter = Math.PI / 2;
  return [
    ...arc(x + w - r, y + r, r, r, -quarter, 0),
    ...arc(x + w - r, y + h - r, r, r, 0, quarter),
    ...arc(x + r, y + h - r, r, r, quarter, 2 * quarter),
    ...arc(x + r, y + r, r, r, 2 * quarter, 3 * quarter),
  ];
}

// Head circle united with a rounded body, clockwise from the left end of the head arc.
function personRing(x: number, y: number, w: number, h: number): Point[] {
  const m = SHAPE_METRICS;
  const radius = m.personHeadRadius;
  const centreX = x + w / 2;
  const centreY = y + m.personHeadCentreY;
  const bodyTop = y + m.personBodyTop;
  const bodyHeight = Math.max(0, h - m.personBodyTop);
  const corner = Math.max(0, Math.min(m.personBodyCornerRadius, w / 2, bodyHeight / 2));
  const quarter = Math.PI / 2;
  // The head meets the straight top edge of the body at this half chord. A body narrower than head plus corners
  // (under about 52 px) has no room for it: the head is then cut to the straight part, an approximation that
  // keeps the ring finite.
  const rise = bodyTop - centreY;
  const chord = Math.min(Math.sqrt(Math.max(0, radius * radius - rise * rise)), Math.max(0, w / 2 - corner));
  const angle = Math.acos(Math.min(1, chord / radius));
  return [
    ...arc(centreX, centreY, radius, radius, Math.PI - angle, 2 * Math.PI + angle),
    ...arc(x + w - corner, bodyTop + corner, corner, corner, -quarter, 0),
    ...arc(x + w - corner, y + h - corner, corner, corner, 0, quarter),
    ...arc(x + corner, y + h - corner, corner, corner, quarter, 2 * quarter),
    ...arc(x + corner, bodyTop + corner, corner, corner, 2 * quarter, 3 * quarter),
  ];
}

/**
 * The real outline of `shape` drawn in `box`, as a closed ring of points (the last joins the first), clockwise
 * on screen, without repeated points. Deterministic for a given input. A box without area gives a point or a
 * segment, whatever the shape.
 *
 * `rect` has rounded corners; `pill` has half-circle ends; `pipe` has half-elliptical ends; `cylinder` has
 * half-elliptical top and bottom; `hexagon` and `diamond` are plain polygons; `person` is a round head on a
 * rounded body (the head has a fixed size and is cut to the body in boxes narrower than about 52 px). Sizes come
 * from {@link SHAPE_METRICS} and are clamped so that small boxes stay valid.
 */
export function shapeOutline(shape: Shape, box: Box): Point[] {
  checkBox(box, "box");
  const { x, y, w, h } = box;
  if (w === 0 || h === 0) {
    return boxOutline(box);
  }
  const m = SHAPE_METRICS;
  const quarter = Math.PI / 2;
  switch (shape) {
    case "rect":
      return mergeClose(roundedRectangle(x, y, w, h, m.rectCornerRadius));
    case "pill":
      return mergeClose(roundedRectangle(x, y, w, h, Math.min(w, h) / 2));
    case "diamond":
      return [
        { x: x + w / 2, y },
        { x: x + w, y: y + h / 2 },
        { x: x + w / 2, y: y + h },
        { x, y: y + h / 2 },
      ];
    case "hexagon": {
      const inset = Math.min(m.hexagonInset, w / 2);
      return mergeClose([
        { x: x + inset, y },
        { x: x + w - inset, y },
        { x: x + w, y: y + h / 2 },
        { x: x + w - inset, y: y + h },
        { x: x + inset, y: y + h },
        { x, y: y + h / 2 },
      ]);
    }
    case "cylinder": {
      const cap = Math.min(m.cylinderCapHeight, h / 2);
      return mergeClose([
        ...arc(x + w / 2, y + cap, w / 2, cap, 2 * quarter, 4 * quarter),
        ...arc(x + w / 2, y + h - cap, w / 2, cap, 0, 2 * quarter),
      ]);
    }
    case "pipe": {
      const cap = Math.min(m.pipeCapWidth, w / 2);
      return mergeClose([
        ...arc(x + w - cap, y + h / 2, cap, h / 2, -quarter, quarter),
        ...arc(x + cap, y + h / 2, cap, h / 2, quarter, 3 * quarter),
      ]);
    }
    case "person":
      return mergeClose(personRing(x, y, w, h));
    default: {
      const unreachable: never = shape;
      throw new RangeError(`unknown shape ${String(unreachable)}`);
    }
  }
}

/** Nearest point of the outline of `shape` in `box` to `point`. */
export function nearestOutlinePoint(point: Point, shape: Shape, box: Box): Point {
  return nearestPointOnPolygon(point, shapeOutline(shape, box));
}

/**
 * Distance from `point` to the outline of `shape` in `box`: 0 on the outline, the same value inside and
 * outside. This is the endpoint gap `E_EDGE_ENDPOINT_GAP` measures (FR-14).
 */
export function distanceToOutline(point: Point, shape: Shape, box: Box): number {
  return distanceToPolygon(point, shapeOutline(shape, box));
}

/** {@link clipSegmentToPolygon} against the outline of `shape` in `box`. */
export function clipSegmentToOutline(from: Point, to: Point, shape: Shape, box: Box): Point | null {
  return clipSegmentToPolygon(from, to, shapeOutline(shape, box));
}

/** {@link clipRayToPolygon} against the outline of `shape` in `box`. */
export function clipRayToOutline(origin: Point, through: Point, shape: Shape, box: Box): Point | null {
  return clipRayToPolygon(origin, through, shapeOutline(shape, box));
}

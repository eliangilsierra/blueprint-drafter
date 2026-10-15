import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { SHAPES } from "../../src/core/model/enums.js";
import type { Shape } from "../../src/core/model/enums.js";
import {
  ARC_SEGMENTS_PER_QUARTER,
  COORDINATE_LIMIT,
  EPSILON,
  SHAPE_METRICS,
  boxContainsBox,
  boxOutline,
  boxesIntersect,
  clipRayToOutline,
  clipRayToPolygon,
  clipSegmentToOutline,
  clipSegmentToPolygon,
  countPolylineCrossings,
  distanceToOutline,
  distanceToPolygon,
  distanceToPolyline,
  manhattanDistance,
  nearestOutlinePoint,
  nearestPointOnPolygon,
  nearestPointOnPolyline,
  nearestPointOnSegment,
  pointInBox,
  polylineLength,
  segmentIntersectsBox,
  segmentOverlapLength,
  segmentsCross,
  shapeOutline,
} from "../../src/core/model/geometry.js";
import type { Box, Point } from "../../src/core/model/types.js";

const P = (x: number, y: number): Point => ({ x, y });

// Seeded generator (mulberry32): the property tests are reproducible, never random (T-AC-3).
function makeRandom(seed: number): () => number {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function between(random: () => number, low: number, high: number): number {
  return low + random() * (high - low);
}

function closeTo(actual: number, expected: number, tolerance = 1e-9, message?: string): void {
  assert.ok(
    Math.abs(actual - expected) <= tolerance,
    message ?? `expected ${String(actual)} to be within ${String(tolerance)} of ${String(expected)}`,
  );
}

function pointCloseTo(actual: Point | null, expected: Point, tolerance = 1e-9): void {
  assert.ok(actual !== null, `expected the point ${JSON.stringify(expected)}, got null`);
  closeTo(actual.x, expected.x, tolerance, `x: ${String(actual.x)} vs ${String(expected.x)}`);
  closeTo(actual.y, expected.y, tolerance, `y: ${String(actual.y)} vs ${String(expected.y)}`);
}

function isFinitePoint(point: Point): boolean {
  return Number.isFinite(point.x) && Number.isFinite(point.y);
}

function signedArea(ring: readonly Point[]): number {
  let sum = 0;
  for (let i = 0; i < ring.length; i++) {
    const a = ring[i];
    const b = ring[(i + 1) % ring.length];
    if (a !== undefined && b !== undefined) {
      sum += a.x * b.y - b.x * a.y;
    }
  }
  return sum / 2;
}

const BOX: Box = { x: 100, y: 50, w: 120, h: 80 };
const CENTRE = P(BOX.x + BOX.w / 2, BOX.y + BOX.h / 2);

describe("constants", () => {
  it("name their reasons and stay frozen", () => {
    assert.equal(EPSILON, 1e-9);
    assert.equal(ARC_SEGMENTS_PER_QUARTER, 12);
    assert.ok(Object.isFrozen(SHAPE_METRICS));
    assert.ok(COORDINATE_LIMIT * COORDINATE_LIMIT * 4 < Number.MAX_VALUE);
  });
});

describe("shapeOutline", () => {
  for (const shape of SHAPES) {
    describe(shape, () => {
      it("is a finite clockwise ring inside the box, without repeated points", () => {
        const ring = shapeOutline(shape, BOX);
        assert.ok(ring.length >= 4);
        for (const point of ring) {
          assert.ok(isFinitePoint(point));
          assert.ok(pointInBox(point, BOX, 1e-9), `${JSON.stringify(point)} outside the box`);
        }
        assert.ok(signedArea(ring) > 0, "screen-clockwise rings have a positive shoelace area");
        for (let i = 0; i < ring.length; i++) {
          const a = ring[i] as Point;
          const b = ring[(i + 1) % ring.length] as Point;
          assert.ok(Math.hypot(a.x - b.x, a.y - b.y) > EPSILON, "no zero-length edge");
        }
      });

      it("is the same on every call and never shares points between calls", () => {
        const first = shapeOutline(shape, BOX);
        const second = shapeOutline(shape, BOX);
        assert.deepEqual(first, second);
        assert.notEqual(first[0], second[0]);
      });

      it("covers less area than the box and more than half of it for a 120 x 80 box", () => {
        const area = Math.abs(signedArea(shapeOutline(shape, BOX)));
        assert.ok(area <= BOX.w * BOX.h + 1e-6);
        assert.ok(area > (BOX.w * BOX.h) / 2 - 1e-6, `${shape} area ${String(area)}`);
      });
    });
  }

  it("rect is a rectangle with 8 px rounded corners", () => {
    const ring = shapeOutline("rect", BOX);
    // The sharp corner is cut off: it is 8 * (sqrt 2 - 1) = 3.31 px away from the outline.
    closeTo(distanceToPolygon(P(BOX.x, BOX.y), ring), 8 * (Math.SQRT2 - 1), 0.02);
    closeTo(distanceToPolygon(P(BOX.x + BOX.w / 2, BOX.y), ring), 0);
  });

  it("diamond has its vertices at the middle of each side", () => {
    assert.deepEqual(shapeOutline("diamond", BOX), [P(160, 50), P(220, 90), P(160, 130), P(100, 90)]);
  });

  it("hexagon has an inset of 14 px on the upper and lower sides", () => {
    assert.deepEqual(shapeOutline("hexagon", BOX), [
      P(114, 50),
      P(206, 50),
      P(220, 90),
      P(206, 130),
      P(114, 130),
      P(100, 90),
    ]);
  });

  it("pill has half-circle ends of radius h / 2", () => {
    const ring = shapeOutline("pill", BOX);
    closeTo(distanceToPolygon(P(BOX.x + BOX.w, BOX.y + BOX.h / 2), ring), 0);
    // The centre of the right cap is 40 px from the end; points of the cap are all 40 px from it.
    for (const point of ring) {
      if (point.x > BOX.x + BOX.w - 40) {
        closeTo(Math.hypot(point.x - (BOX.x + BOX.w - 40), point.y - (BOX.y + 40)), 40, 1e-9);
      }
    }
  });

  it("cylinder bulges 7 px into the top and bottom of the box", () => {
    const ring = shapeOutline("cylinder", BOX);
    closeTo(Math.min(...ring.map((point) => point.y)), BOX.y);
    closeTo(Math.max(...ring.map((point) => point.y)), BOX.y + BOX.h);
    // The side wall runs straight between the caps.
    closeTo(distanceToPolygon(P(BOX.x, BOX.y + BOX.h / 2), ring), 0);
    // The centre of the top cap is one cap height (7 px) below the apex of the outline.
    closeTo(distanceToPolygon(P(BOX.x + BOX.w / 2, BOX.y + SHAPE_METRICS.cylinderCapHeight), ring), 7, 0.01);
  });

  it("pipe has half-elliptical ends of width 9 px", () => {
    const ring = shapeOutline("pipe", BOX);
    closeTo(distanceToPolygon(P(BOX.x + BOX.w, BOX.y + BOX.h / 2), ring), 0);
    closeTo(distanceToPolygon(P(BOX.x, BOX.y + BOX.h / 2), ring), 0);
    // The straight top edge runs from x + 9 to x + w - 9.
    closeTo(distanceToPolygon(P(BOX.x + 9, BOX.y), ring), 0);
    closeTo(distanceToPolygon(P(BOX.x + BOX.w - 9, BOX.y + BOX.h), ring), 0);
  });

  it("person is a head on a body: the head rises above the body top", () => {
    const ring = shapeOutline("person", BOX);
    closeTo(Math.min(...ring.map((point) => point.y)), BOX.y + 13 - 12);
    closeTo(Math.max(...ring.map((point) => point.y)), BOX.y + BOX.h);
    // The body is 16 px below the top, the neck (between head and body corner) lies on y = top + 16.
    closeTo(distanceToPolygon(P(BOX.x + 20, BOX.y + 16), ring), 0);
    // A point inside the head is 12 - distance from the head centre away from the outline.
    closeTo(distanceToPolygon(P(BOX.x + BOX.w / 2, BOX.y + 13), ring), 12, 0.03);
  });

  it("approximates the curves within 0.25 px for radii up to 100 px", () => {
    // The middle of every edge of the ring is the farthest point of the polygon from the true curve.
    const pill = shapeOutline("pill", { x: 0, y: 0, w: 400, h: 200 });
    for (let i = 0; i < pill.length; i++) {
      const a = pill[i] as Point;
      const b = pill[(i + 1) % pill.length] as Point;
      const mx = (a.x + b.x) / 2;
      const my = (a.y + b.y) / 2;
      if (mx > 300) {
        assert.ok(Math.abs(Math.hypot(mx - 300, my - 100) - 100) <= 0.25);
      } else if (mx < 100) {
        assert.ok(Math.abs(Math.hypot(mx - 100, my - 100) - 100) <= 0.25);
      }
    }
    const pipe = shapeOutline("pipe", { x: 0, y: 0, w: 400, h: 200 });
    for (let i = 0; i < pipe.length; i++) {
      const a = pipe[i] as Point;
      const b = pipe[(i + 1) % pipe.length] as Point;
      const mx = (a.x + b.x) / 2;
      const my = (a.y + b.y) / 2;
      if (mx > 391 || mx < 9) {
        const cx = mx > 200 ? 391 : 9;
        // Points of the ellipse (x - cx)^2 / 9^2 + (y - 100)^2 / 100^2 = 1 are at "radius" 1 in these units.
        const unit = Math.hypot((mx - cx) / 9, (my - 100) / 100);
        assert.ok(Math.abs(unit - 1) * 9 <= 0.25);
      }
    }
  });

  describe("degenerate boxes", () => {
    const boxes: ReadonlyArray<readonly [string, Box]> = [
      ["a point", { x: 5, y: 7, w: 0, h: 0 }],
      ["a vertical line", { x: 5, y: 7, w: 0, h: 30 }],
      ["a horizontal line", { x: 5, y: 7, w: 30, h: 0 }],
      ["a tiny box", { x: 5, y: 7, w: 1e-12, h: 1e-12 }],
      ["a thin box", { x: 5, y: 7, w: 100, h: 0.5 }],
      ["a box narrower than the person head", { x: 5, y: 7, w: 20, h: 40 }],
      ["a box shorter than the person head", { x: 5, y: 7, w: 120, h: 10 }],
    ];
    for (const shape of SHAPES) {
      for (const [name, box] of boxes) {
        it(`${shape} in ${name} gives a finite outline and finite distances`, () => {
          const ring = shapeOutline(shape, box);
          assert.ok(ring.length >= 1);
          assert.ok(ring.every(isFinitePoint));
          for (const target of [P(0, 0), P(box.x, box.y), P(box.x + box.w / 2, box.y + box.h / 2), P(1e6, -1e6)]) {
            const distance = distanceToOutline(target, shape, box);
            assert.ok(Number.isFinite(distance) && distance >= 0);
            assert.ok(isFinitePoint(nearestOutlinePoint(target, shape, box)));
            const clipped = clipSegmentToOutline(P(box.x - 50, box.y - 50), target, shape, box);
            assert.ok(clipped === null || isFinitePoint(clipped));
            const ray = clipRayToOutline(P(box.x - 50, box.y - 50), target, shape, box);
            assert.ok(ray === null || isFinitePoint(ray));
          }
        });
      }
    }

    it("a zero-size box has a one-point outline whatever the shape", () => {
      for (const shape of SHAPES) {
        assert.deepEqual(shapeOutline(shape, { x: 5, y: 7, w: 0, h: 0 }), [P(5, 7)]);
      }
    });

    it("a zero-size box is at its position: distance, nearest point and clipping", () => {
      const box: Box = { x: 5, y: 7, w: 0, h: 0 };
      assert.equal(distanceToOutline(P(8, 11), "diamond", box), 5);
      assert.deepEqual(nearestOutlinePoint(P(8, 11), "pill", box), P(5, 7));
      pointCloseTo(clipSegmentToOutline(P(5, 0), P(5, 20), "rect", box), P(5, 7));
      assert.equal(clipSegmentToOutline(P(6, 0), P(6, 20), "rect", box), null);
    });

    it("a zero-height box is a segment: a crossing segment is clipped to it", () => {
      const box: Box = { x: 0, y: 10, w: 40, h: 0 };
      pointCloseTo(clipSegmentToOutline(P(20, 0), P(20, 30), "hexagon", box), P(20, 10));
      // Running along the box (collinear), the clip is the start of the overlap.
      pointCloseTo(clipSegmentToOutline(P(-10, 10), P(60, 10), "hexagon", box), P(0, 10));
    });
  });
});

describe("distance to the outline (AC-19, FR-14)", () => {
  for (const shape of SHAPES) {
    describe(shape, () => {
      const ring = shapeOutline(shape, { x: 100, y: 50, w: 120, h: 80 });
      const top = Math.min(...ring.map((point) => point.y));
      const bottom = Math.max(...ring.map((point) => point.y));
      const left = Math.min(...ring.map((point) => point.x));
      const right = Math.max(...ring.map((point) => point.x));
      const box = { x: 100, y: 50, w: 120, h: 80 };
      for (const gap of [2, 3]) {
        it(`a point ${String(gap)} px outside the middle of each side is ${String(gap)} px away`, () => {
          closeTo(distanceToOutline(P(160, top - gap), shape, box), gap);
          closeTo(distanceToOutline(P(160, bottom + gap), shape, box), gap);
          closeTo(distanceToOutline(P(left - gap, 90), shape, box), gap);
          closeTo(distanceToOutline(P(right + gap, 90), shape, box), gap);
        });
      }

      it("is 0 on every outline point and on the middle of every edge", () => {
        for (let i = 0; i < ring.length; i++) {
          const a = ring[i] as Point;
          const b = ring[(i + 1) % ring.length] as Point;
          closeTo(distanceToOutline(a, shape, box), 0);
          closeTo(distanceToOutline(P((a.x + b.x) / 2, (a.y + b.y) / 2), shape, box), 0);
        }
      });

      it("is the same from inside as from outside", () => {
        // Take the longest edge of the ring and look 2 px to each side of its middle.
        let longest = 0;
        let best: readonly [Point, Point] = [P(0, 0), P(1, 0)];
        for (let i = 0; i < ring.length; i++) {
          const a = ring[i] as Point;
          const b = ring[(i + 1) % ring.length] as Point;
          const length = Math.hypot(b.x - a.x, b.y - a.y);
          if (length > longest) {
            longest = length;
            best = [a, b];
          }
        }
        const [a, b] = best;
        const middle = P((a.x + b.x) / 2, (a.y + b.y) / 2);
        const nx = (-(b.y - a.y) / longest) * 2;
        const ny = ((b.x - a.x) / longest) * 2;
        closeTo(distanceToOutline(P(middle.x + nx, middle.y + ny), shape, box), 2);
        closeTo(distanceToOutline(P(middle.x - nx, middle.y - ny), shape, box), 2);
      });

      it("nearest point lies on the outline and at the reported distance", () => {
        const target = P(300, 20);
        const nearest = nearestOutlinePoint(target, shape, box);
        closeTo(distanceToOutline(nearest, shape, box), 0);
        closeTo(Math.hypot(target.x - nearest.x, target.y - nearest.y), distanceToOutline(target, shape, box));
      });
    });
  }

  it("distance of a far point grows with the point (no cap, no overflow)", () => {
    closeTo(distanceToOutline(P(1e9, 90), "rect", BOX), 1e9 - 220, 1e-3);
    assert.ok(Number.isFinite(distanceToOutline(P(1e99, -1e99), "person", BOX)));
  });

  it("the centre of a rectangle is half its height from the outline", () => {
    closeTo(distanceToOutline(CENTRE, "rect", BOX), 40);
    closeTo(distanceToOutline(CENTRE, "diamond", BOX), (60 * 40) / Math.hypot(60, 40));
  });
});

describe("clipping to the outline (T-AC-1, T-AC-3)", () => {
  const boxes: readonly Box[] = [
    { x: 100, y: 50, w: 120, h: 80 },
    { x: -40, y: 20, w: 200, h: 36 },
    { x: 10, y: 10, w: 60, h: 160 },
  ];

  for (const shape of SHAPES) {
    describe(shape, () => {
      it("from the centre towards an outside point ends on the outline, whatever the direction", () => {
        for (const box of boxes) {
          const centre = P(box.x + box.w / 2, box.y + box.h / 2);
          for (let k = 0; k < 48; k++) {
            const angle = (k * 2 * Math.PI) / 48 + 0.013;
            const outside = P(centre.x + Math.cos(angle) * (box.w + box.h), centre.y + Math.sin(angle) * (box.w + box.h));
            const hit = clipSegmentToOutline(centre, outside, shape, box);
            assert.ok(hit !== null, `${shape} ${String(k)}: no hit`);
            assert.ok(distanceToOutline(hit, shape, box) < 0.01, `${shape} ${String(k)}`);
            // Between the centre and the target, on the segment.
            const along = Math.hypot(hit.x - centre.x, hit.y - centre.y);
            const total = Math.hypot(outside.x - centre.x, outside.y - centre.y);
            assert.ok(along > 0 && along < total);
            closeTo(Math.hypot(hit.x - centre.x, hit.y - centre.y) + Math.hypot(outside.x - hit.x, outside.y - hit.y), total, 1e-6);
          }
        }
      });

      it("from an outside point towards the centre ends on the outline too", () => {
        for (const box of boxes) {
          const centre = P(box.x + box.w / 2, box.y + box.h / 2);
          for (let k = 0; k < 24; k++) {
            const angle = (k * 2 * Math.PI) / 24 + 0.5;
            const outside = P(centre.x + Math.cos(angle) * (box.w + box.h), centre.y + Math.sin(angle) * (box.w + box.h));
            const hit = clipSegmentToOutline(outside, centre, shape, box);
            assert.ok(hit !== null);
            assert.ok(distanceToOutline(hit, shape, box) < 0.01);
          }
        }
      });

      it("the first point from the centre is the farthest one inside the outline", () => {
        // Moving a little before the hit is inside, a little after is outside: it is a crossing, not a touch.
        const centre = P(160, 90);
        const hit = clipSegmentToOutline(centre, P(500, 90), shape, BOX);
        assert.ok(hit !== null);
        assert.ok(hit.x > centre.x && hit.x <= 220 + 1e-9);
        assert.ok(distanceToOutline(P(hit.x + 1, hit.y), shape, BOX) > 0.5);
      });

      it("returns null when the segment stops short of the outline or points away", () => {
        assert.equal(clipSegmentToOutline(P(0, 0), P(50, 0), shape, BOX), null);
        assert.equal(clipSegmentToOutline(P(300, 90), P(400, 90), shape, BOX), null);
        assert.equal(clipSegmentToOutline(P(0, 0), P(0, 0), shape, BOX), null);
      });

      it("returns the start when the segment starts on the outline", () => {
        const ring = shapeOutline(shape, BOX);
        const start = ring[0] as Point;
        const hit = clipSegmentToOutline(start, CENTRE, shape, BOX);
        pointCloseTo(hit, start);
      });

      it("returns the end when the segment ends on the outline", () => {
        const ring = shapeOutline(shape, BOX);
        const end = ring[Math.floor(ring.length / 2)] as Point;
        const hit = clipSegmentToOutline(P(end.x, end.y - 500), end, shape, BOX);
        assert.ok(hit !== null);
        assert.ok(distanceToOutline(hit, shape, BOX) < 0.01);
      });
    });
  }

  it("clipping is idempotent (seeded property test, 4000 cases)", () => {
    const random = makeRandom(20260715);
    let clipped = 0;
    for (let i = 0; i < 4000; i++) {
      const shape = SHAPES[Math.floor(random() * SHAPES.length)] as Shape;
      const box: Box = { x: between(random, -500, 500), y: between(random, -500, 500), w: between(random, 0.5, 400), h: between(random, 0.5, 300) };
      const from = P(between(random, -900, 900), between(random, -900, 900));
      const to = P(between(random, -900, 900), between(random, -900, 900));
      const once = clipSegmentToOutline(from, to, shape, box);
      if (once === null) {
        continue;
      }
      clipped++;
      const twice = clipSegmentToOutline(from, once, shape, box);
      pointCloseTo(twice, once, 1e-7);
      assert.ok(distanceToOutline(once, shape, box) < 0.01, `${shape} ${JSON.stringify(box)}`);
      const rayOnce = clipRayToOutline(from, to, shape, box);
      if (rayOnce !== null) {
        const rayTwice = clipRayToOutline(from, rayOnce, shape, box);
        pointCloseTo(rayTwice, rayOnce, 1e-7);
        assert.ok(distanceToOutline(rayOnce, shape, box) < 0.01);
      }
    }
    assert.ok(clipped > 400, `the generator must exercise clipping, got ${String(clipped)} hits`);
  });

  it("clipping to a polygon is idempotent too", () => {
    const polygon = shapeOutline("hexagon", BOX);
    const once = clipSegmentToPolygon(P(0, 0), P(400, 300), polygon);
    assert.ok(once !== null);
    pointCloseTo(clipSegmentToPolygon(P(0, 0), once, polygon), once);
  });

  it("a ray ends on the outline from a point of the bounding box of a diamond, where a segment would miss", () => {
    // ELK ends the edge on the bounding box; the top left of the box is outside the diamond.
    const from = P(120, -50);
    const end = P(120, 50);
    assert.equal(clipSegmentToOutline(from, end, "diamond", BOX), null);
    const hit = clipRayToOutline(from, end, "diamond", BOX);
    assert.ok(hit !== null);
    closeTo(hit.x, 120);
    closeTo(hit.y, 90 - (40 * (120 - 100)) / 60, 1e-9);
    assert.ok(distanceToOutline(hit, "diamond", BOX) < 0.01);
  });

  it("a ray with no direction or pointing away returns null", () => {
    assert.equal(clipRayToOutline(P(0, 0), P(0, 0), "rect", BOX), null);
    assert.equal(clipRayToOutline(P(0, 0), P(-10, -10), "rect", BOX), null);
    assert.equal(clipRayToPolygon(P(0, 0), P(1e-12, 0), boxOutline(BOX)), null);
  });

  it("is identical across two runs (T-AC-3)", () => {
    const run = (): unknown => {
      const random = makeRandom(7);
      const results: unknown[] = [];
      for (let i = 0; i < 300; i++) {
        const shape = SHAPES[i % SHAPES.length] as Shape;
        const box: Box = { x: between(random, -50, 50), y: between(random, -50, 50), w: between(random, 1, 300), h: between(random, 1, 300) };
        const from = P(between(random, -400, 400), between(random, -400, 400));
        const to = P(between(random, -400, 400), between(random, -400, 400));
        results.push(
          shapeOutline(shape, box),
          distanceToOutline(from, shape, box),
          nearestOutlinePoint(to, shape, box),
          clipSegmentToOutline(from, to, shape, box),
          clipRayToOutline(from, to, shape, box),
        );
      }
      return results;
    };
    assert.deepEqual(run(), run());
    assert.equal(JSON.stringify(run()), JSON.stringify(run()));
  });

  describe("on a polygon with collinear and parallel edges", () => {
    const square = boxOutline({ x: 0, y: 0, w: 10, h: 10 });

    it("a segment along an edge is clipped to the start of the overlap", () => {
      pointCloseTo(clipSegmentToPolygon(P(-5, 0), P(15, 0), square), P(0, 0));
      pointCloseTo(clipSegmentToPolygon(P(15, 0), P(-5, 0), square), P(10, 0));
      pointCloseTo(clipSegmentToPolygon(P(5, 0), P(8, 0), square), P(5, 0));
    });

    it("a segment parallel to an edge but apart from it does not meet that edge", () => {
      pointCloseTo(clipSegmentToPolygon(P(-5, 5), P(15, 5), square), P(0, 5));
      assert.equal(clipSegmentToPolygon(P(-5, -3), P(15, -3), square), null);
    });

    it("a segment through a corner reports the corner", () => {
      pointCloseTo(clipSegmentToPolygon(P(-5, -5), P(5, 5), square), P(0, 0));
      pointCloseTo(clipSegmentToPolygon(P(5, 5), P(20, 20), square), P(10, 10));
    });

    it("a segment ending at 1e-10 from an edge still counts as touching, at 1e-6 it does not", () => {
      assert.ok(clipSegmentToPolygon(P(5, -5), P(5, -1e-10), square) !== null);
      assert.equal(clipSegmentToPolygon(P(5, -5), P(5, -1e-6), square), null);
    });
  });

  describe("with huge coordinates", () => {
    it("clips and measures a shape far from the origin", () => {
      for (const offset of [1e6, 1e9, 1e12, 1e15]) {
        const box: Box = { x: offset, y: -offset, w: 120, h: 80 };
        for (const shape of SHAPES) {
          const centre = P(offset + 60, -offset + 40);
          const outside = P(centre.x + 500, centre.y + 10);
          const hit = clipSegmentToOutline(centre, outside, shape, box);
          assert.ok(hit !== null && isFinitePoint(hit), `${shape} at ${String(offset)}`);
          // Double precision at 1e15 is 0.125 px, so only the finite result is guaranteed there.
          if (offset <= 1e9) {
            assert.ok(distanceToOutline(hit, shape, box) < 0.01);
          }
          assert.ok(Number.isFinite(distanceToOutline(P(0, 0), shape, box)));
        }
      }
    });

    it("stays finite at the coordinate limit and rejects anything beyond it", () => {
      const limit = COORDINATE_LIMIT;
      const big: Box = { x: -limit, y: -limit, w: limit, h: limit };
      for (const shape of SHAPES) {
        assert.ok(shapeOutline(shape, big).every(isFinitePoint));
        const distance = distanceToOutline(P(limit, limit), shape, big);
        assert.ok(Number.isFinite(distance));
      }
      assert.ok(Number.isFinite(polylineLength([P(-limit, -limit), P(limit, limit)])));
      assert.ok(Number.isFinite(manhattanDistance(P(-limit, -limit), P(limit, limit))));
      assert.equal(segmentIntersectsBox(P(-limit, -limit / 2), P(limit, -limit / 2), big), true);
      assert.equal(segmentsCross(P(-limit, -limit), P(limit, limit), P(-limit, limit), P(limit, -limit)), true);
      assert.throws(() => distanceToOutline(P(limit * 10, 0), "rect", BOX), RangeError);
    });
  });
});

describe("segmentIntersectsBox (T-AC-2)", () => {
  const box: Box = { x: 10, y: 10, w: 20, h: 10 };

  const cases: ReadonlyArray<readonly [string, Point, Point, number | undefined, boolean]> = [
    ["through the box", P(0, 15), P(40, 15), undefined, true],
    ["diagonally through", P(0, 0), P(40, 30), undefined, true],
    ["ends inside", P(0, 15), P(20, 15), undefined, true],
    ["starts inside", P(20, 15), P(100, 15), undefined, true],
    ["fully inside", P(15, 12), P(25, 18), undefined, true],
    ["a single point inside", P(20, 15), P(20, 15), undefined, true],
    ["a single point outside", P(5, 15), P(5, 15), undefined, false],
    ["a single point on the edge", P(10, 15), P(10, 15), undefined, false],
    ["far above", P(0, 0), P(40, 0), undefined, false],
    ["short of the box", P(0, 15), P(9, 15), undefined, false],
    ["ends exactly on the left edge", P(0, 15), P(10, 15), undefined, false],
    ["along the top edge", P(0, 10), P(40, 10), undefined, false],
    ["along the right edge", P(30, 0), P(30, 40), undefined, false],
    ["touches the top left corner", P(0, 20), P(20, 0), undefined, false],
    ["grazes a corner from outside", P(0, 0), P(10, 10), undefined, false],
    ["1 px outside, margin 0", P(0, 9), P(40, 9), undefined, false],
    ["1 px outside, margin 1", P(0, 9), P(40, 9), 1, false],
    ["1 px outside, margin 2", P(0, 9), P(40, 9), 2, true],
    ["along the edge with margin 0.5", P(0, 10), P(40, 10), 0.5, true],
    ["1 px inside, margin -2 (tolerance)", P(0, 11), P(40, 11), -2, false],
    ["3 px inside, margin -2 (tolerance)", P(0, 13), P(40, 13), -2, true],
    ["margin shrinks the box to nothing", P(0, 15), P(40, 15), -5, false],
    ["margin shrinks the box below nothing", P(0, 15), P(40, 15), -50, false],
  ];
  for (const [name, p, q, margin, expected] of cases) {
    it(`${name}: ${String(expected)}`, () => {
      assert.equal(margin === undefined ? segmentIntersectsBox(p, q, box) : segmentIntersectsBox(p, q, box, margin), expected);
      // Symmetric in the direction of the segment.
      assert.equal(margin === undefined ? segmentIntersectsBox(q, p, box) : segmentIntersectsBox(q, p, box, margin), expected);
    });
  }

  it("a box without area is never crossed at margin 0", () => {
    assert.equal(segmentIntersectsBox(P(0, 5), P(10, 5), { x: 5, y: 5, w: 0, h: 0 }), false);
    assert.equal(segmentIntersectsBox(P(0, 5), P(10, 5), { x: 5, y: 0, w: 0, h: 10 }), false);
    assert.equal(segmentIntersectsBox(P(0, 5), P(10, 5), { x: 5, y: 5, w: 0, h: 0 }, 1), true);
  });

  it("a segment tilted by less than EPSILON along an edge still only touches", () => {
    assert.equal(segmentIntersectsBox(P(0, 10), P(40, 10 + 1e-12), box), false);
  });

  it("is symmetric in the segment direction and agrees with sampling (seeded property test)", () => {
    const random = makeRandom(11);
    let hits = 0;
    for (let i = 0; i < 3000; i++) {
      const r: Box = { x: between(random, -50, 50), y: between(random, -50, 50), w: between(random, 1, 60), h: between(random, 1, 60) };
      const p = P(between(random, -100, 100), between(random, -100, 100));
      const q = P(between(random, -100, 100), between(random, -100, 100));
      const forward = segmentIntersectsBox(p, q, r);
      assert.equal(segmentIntersectsBox(q, p, r), forward);
      // Dense sampling finds a point strictly inside exactly when the segment goes through the interior
      // (grazing cases are rare with random reals; allow 1e-6 px of slack by testing a slightly shrunk box).
      let sampled = false;
      for (let k = 0; k <= 400 && !sampled; k++) {
        const t = k / 400;
        sampled = pointInBox(P(p.x + (q.x - p.x) * t, p.y + (q.y - p.y) * t), r, -1e-6);
      }
      if (sampled) {
        assert.ok(forward, `sampled a point inside but got false: ${JSON.stringify({ p, q, r })}`);
      }
      if (!forward) {
        assert.ok(!sampled);
      }
      if (forward) {
        hits++;
      }
    }
    assert.ok(hits > 200 && hits < 2800, `both outcomes must occur, got ${String(hits)} hits`);
  });
});

describe("boxesIntersect, pointInBox, boxContainsBox", () => {
  const a: Box = { x: 0, y: 0, w: 10, h: 10 };

  const intersections: ReadonlyArray<readonly [string, Box, number | undefined, boolean]> = [
    ["overlapping", { x: 5, y: 5, w: 10, h: 10 }, undefined, true],
    ["one inside the other", { x: 2, y: 2, w: 3, h: 3 }, undefined, true],
    ["touching along an edge", { x: 10, y: 0, w: 10, h: 10 }, undefined, false],
    ["touching at a corner", { x: 10, y: 10, w: 5, h: 5 }, undefined, false],
    ["apart", { x: 11, y: 0, w: 5, h: 5 }, undefined, false],
    ["apart in one axis, overlapping in the other", { x: 20, y: 2, w: 5, h: 5 }, undefined, false],
    ["1 px apart, clearance 2", { x: 11, y: 0, w: 5, h: 10 }, 2, true],
    ["1 px apart, clearance 1", { x: 11, y: 0, w: 5, h: 10 }, 1, false],
    ["touching, clearance 0.5", { x: 10, y: 0, w: 5, h: 10 }, 0.5, true],
    ["overlapping by 0.4, tolerance 0.5", { x: 9.6, y: 0, w: 5, h: 10 }, -0.5, false],
    ["overlapping by 0.6, tolerance 0.5", { x: 9.4, y: 0, w: 5, h: 10 }, -0.5, true],
    ["a box without area inside", { x: 5, y: 5, w: 0, h: 0 }, undefined, false],
    ["a box without area inside, clearance 1", { x: 5, y: 5, w: 0, h: 0 }, 1, true],
  ];
  for (const [name, b, margin, expected] of intersections) {
    it(`boxesIntersect, ${name}: ${String(expected)}, in both argument orders`, () => {
      assert.equal(margin === undefined ? boxesIntersect(a, b) : boxesIntersect(a, b, margin), expected);
      assert.equal(margin === undefined ? boxesIntersect(b, a) : boxesIntersect(b, a, margin), expected);
    });
  }

  it("boxesIntersect is symmetric (seeded property test)", () => {
    const random = makeRandom(5);
    for (let i = 0; i < 2000; i++) {
      const p: Box = { x: between(random, -20, 20), y: between(random, -20, 20), w: between(random, 0, 30), h: between(random, 0, 30) };
      const q: Box = { x: between(random, -20, 20), y: between(random, -20, 20), w: between(random, 0, 30), h: between(random, 0, 30) };
      const margin = between(random, -5, 5);
      assert.equal(boxesIntersect(p, q, margin), boxesIntersect(q, p, margin));
    }
  });

  const points: ReadonlyArray<readonly [string, Point, number | undefined, boolean]> = [
    ["inside", P(5, 5), undefined, true],
    ["on an edge", P(0, 5), undefined, true],
    ["on a corner", P(10, 10), undefined, true],
    ["just outside", P(10.0001, 5), undefined, false],
    ["outside, margin covers it", P(11, 5), 1, true],
    ["inside, shrunk margin excludes it", P(0.5, 5), -1, false],
    ["inside, shrunk margin keeps it", P(5, 5), -1, true],
    ["shrunk below nothing", P(5, 5), -6, false],
  ];
  for (const [name, point, margin, expected] of points) {
    it(`pointInBox, ${name}: ${String(expected)}`, () => {
      assert.equal(margin === undefined ? pointInBox(point, a) : pointInBox(point, a, margin), expected);
    });
  }

  const containment: ReadonlyArray<readonly [string, Box, number | undefined, boolean]> = [
    ["inside", { x: 1, y: 1, w: 5, h: 5 }, undefined, true],
    ["identical", a, undefined, true],
    ["sticks out by 0.5", { x: -0.5, y: 0, w: 5, h: 5 }, undefined, false],
    ["sticks out by 0.5, tolerance 0.5", { x: -0.5, y: 0, w: 5, h: 5 }, 0.5, true],
    ["sticks out by 0.6, tolerance 0.5", { x: -0.6, y: 0, w: 5, h: 5 }, 0.5, false],
    ["larger", { x: -1, y: -1, w: 12, h: 12 }, undefined, false],
    ["a point on the edge", { x: 10, y: 10, w: 0, h: 0 }, undefined, true],
    ["right edge too far", { x: 6, y: 0, w: 5, h: 5 }, undefined, false],
  ];
  for (const [name, inner, tolerance, expected] of containment) {
    it(`boxContainsBox, ${name}: ${String(expected)}`, () => {
      assert.equal(tolerance === undefined ? boxContainsBox(a, inner) : boxContainsBox(a, inner, tolerance), expected);
    });
  }

  it("boxContainsBox is reflexive and antisymmetric for different boxes (seeded property test)", () => {
    const random = makeRandom(3);
    for (let i = 0; i < 1000; i++) {
      const p: Box = { x: between(random, -20, 20), y: between(random, -20, 20), w: between(random, 0, 30), h: between(random, 0, 30) };
      const q: Box = { x: between(random, -20, 20), y: between(random, -20, 20), w: between(random, 0, 30), h: between(random, 0, 30) };
      assert.ok(boxContainsBox(p, p));
      assert.ok(!(boxContainsBox(p, q) && boxContainsBox(q, p)));
      if (boxContainsBox(p, q)) {
        assert.ok(pointInBox(P(q.x, q.y), p) && pointInBox(P(q.x + q.w, q.y + q.h), p));
      }
    }
  });

  it("boxOutline lists the corners clockwise from the top left", () => {
    assert.deepEqual(boxOutline(a), [P(0, 0), P(10, 0), P(10, 10), P(0, 10)]);
    assert.deepEqual(boxOutline({ x: 1, y: 2, w: 0, h: 0 }), [P(1, 2)]);
    assert.deepEqual(boxOutline({ x: 1, y: 2, w: 5, h: 0 }), [P(1, 2), P(6, 2)]);
  });
});

describe("segment crossings", () => {
  const cases: ReadonlyArray<readonly [string, Point, Point, Point, Point, boolean]> = [
    ["an X", P(0, 0), P(10, 10), P(0, 10), P(10, 0), true],
    ["a plus", P(0, 5), P(10, 5), P(5, 0), P(5, 10), true],
    ["a T junction (touch)", P(0, 5), P(10, 5), P(5, 5), P(5, 10), false],
    ["an L junction (shared end point)", P(0, 0), P(10, 0), P(10, 0), P(10, 10), false],
    ["the same end point from both", P(0, 0), P(5, 5), P(5, 5), P(10, 0), false],
    ["parallel", P(0, 0), P(10, 0), P(0, 5), P(10, 5), false],
    ["collinear overlapping", P(0, 0), P(10, 0), P(5, 0), P(15, 0), false],
    ["collinear apart", P(0, 0), P(4, 0), P(5, 0), P(15, 0), false],
    ["identical", P(0, 0), P(10, 0), P(0, 0), P(10, 0), false],
    ["lines cross beyond the segments", P(0, 0), P(4, 4), P(0, 10), P(10, 0), false],
    ["a zero-length segment on the other", P(5, 5), P(5, 5), P(0, 0), P(10, 10), false],
    ["a zero-length segment off the other", P(5, 6), P(5, 6), P(0, 0), P(10, 10), false],
    ["two zero-length segments", P(5, 5), P(5, 5), P(5, 5), P(5, 5), false],
    ["a shallow angle", P(0, 0), P(100, 0.001), P(50, -1), P(50, 1), true],
    ["almost touching: end 1e-12 short", P(0, 5), P(10, 5), P(5, 5 + 1e-12), P(5, 10), false],
    ["end 0.01 past", P(0, 5), P(10, 5), P(5, 4.99), P(5, 10), true],
  ];
  for (const [name, p, q, r, s, expected] of cases) {
    it(`${name}: ${String(expected)}, whatever the order and direction`, () => {
      assert.equal(segmentsCross(p, q, r, s), expected);
      assert.equal(segmentsCross(q, p, r, s), expected);
      assert.equal(segmentsCross(p, q, s, r), expected);
      assert.equal(segmentsCross(r, s, p, q), expected);
    });
  }

  it("segmentsCross is symmetric under every swap (seeded property test)", () => {
    const random = makeRandom(99);
    let crossings = 0;
    for (let i = 0; i < 4000; i++) {
      const [p, q, r, s] = [0, 1, 2, 3].map(() => P(Math.round(between(random, -5, 5)), Math.round(between(random, -5, 5)))) as [Point, Point, Point, Point];
      const value = segmentsCross(p, q, r, s);
      assert.equal(segmentsCross(r, s, p, q), value);
      assert.equal(segmentsCross(q, p, s, r), value);
      assert.equal(segmentsCross(p, q, s, r), value);
      if (value) {
        crossings++;
      }
    }
    // Integer coordinates on a small grid produce many touches, collinear and zero-length cases as well.
    assert.ok(crossings > 100 && crossings < 3900, String(crossings));
  });

  describe("countPolylineCrossings", () => {
    const horizontal = [P(0, 5), P(100, 5)];

    it("counts a zig-zag across a line once per crossing", () => {
      const zigzag = [P(10, 0), P(20, 10), P(30, 0), P(40, 10), P(50, 0)];
      assert.equal(countPolylineCrossings(horizontal, zigzag), 4);
      assert.equal(countPolylineCrossings(zigzag, horizontal), 4);
    });

    it("counts pairs of segments, one from each polyline", () => {
      const grid = [P(0, 0), P(0, 10), P(10, 10), P(10, 0), P(20, 0), P(20, 10)];
      // x = 0 only touches the end of the horizontal line; x = 10 and x = 20 cross it.
      assert.equal(countPolylineCrossings(horizontal, grid), 2);
    });

    it("does not count touches, shared ends, collinear runs or a crossing exactly on a vertex", () => {
      assert.equal(countPolylineCrossings([P(0, 0), P(10, 0)], [P(10, 0), P(10, 10)]), 0);
      assert.equal(countPolylineCrossings([P(0, 0), P(10, 0)], [P(5, 0), P(15, 0)]), 0);
      assert.equal(countPolylineCrossings([P(0, 5), P(10, 5)], [P(5, 0), P(5, 5), P(5, 10)]), 0);
    });

    it("is 0 for fewer than two points and never throws for empty lists", () => {
      assert.equal(countPolylineCrossings([], horizontal), 0);
      assert.equal(countPolylineCrossings([P(1, 1)], horizontal), 0);
      assert.equal(countPolylineCrossings([], []), 0);
    });
  });

  describe("segmentOverlapLength", () => {
    const cases: ReadonlyArray<readonly [string, Point, Point, Point, Point, number | undefined, number]> = [
      ["horizontal partial overlap", P(0, 0), P(10, 0), P(6, 0), P(20, 0), undefined, 4],
      ["horizontal, other direction", P(10, 0), P(0, 0), P(20, 0), P(6, 0), undefined, 4],
      ["contained", P(0, 0), P(10, 0), P(2, 0), P(5, 0), undefined, 3],
      ["containing", P(2, 0), P(5, 0), P(0, 0), P(10, 0), undefined, 3],
      ["identical", P(0, 0), P(10, 0), P(0, 0), P(10, 0), undefined, 10],
      ["touching at one point", P(0, 0), P(10, 0), P(10, 0), P(20, 0), undefined, 0],
      ["collinear but apart", P(0, 0), P(10, 0), P(11, 0), P(20, 0), undefined, 0],
      ["vertical", P(0, 0), P(0, 10), P(0, 4), P(0, 30), undefined, 6],
      ["diagonal", P(0, 0), P(10, 10), P(5, 5), P(20, 20), undefined, 5 * Math.SQRT2],
      ["parallel but 1 px apart, offset 0", P(0, 0), P(10, 0), P(0, 1), P(10, 1), undefined, 0],
      ["parallel 1 px apart, offset 1.5", P(0, 0), P(10, 0), P(2, 1), P(12, 1), 1.5, 8],
      ["parallel 2 px apart, offset 1.5", P(0, 0), P(10, 0), P(2, 2), P(12, 2), 1.5, 0],
      ["perpendicular", P(0, 0), P(10, 0), P(5, -5), P(5, 5), undefined, 0],
      ["a zero-length first segment", P(3, 0), P(3, 0), P(0, 0), P(10, 0), undefined, 0],
      ["a zero-length second segment", P(0, 0), P(10, 0), P(3, 0), P(3, 0), undefined, 0],
    ];
    for (const [name, p, q, r, s, offset, expected] of cases) {
      it(`${name}: ${String(expected)}`, () => {
        const actual = offset === undefined ? segmentOverlapLength(p, q, r, s) : segmentOverlapLength(p, q, r, s, offset);
        closeTo(actual, expected, 1e-9);
      });
    }

    it("is never negative or greater than either segment (seeded property test)", () => {
      const random = makeRandom(41);
      for (let i = 0; i < 2000; i++) {
        const p = P(between(random, -50, 50), 0);
        const q = P(between(random, -50, 50), 0);
        const r = P(between(random, -50, 50), between(random, -2, 2));
        const s = P(between(random, -50, 50), between(random, -2, 2));
        const overlap = segmentOverlapLength(p, q, r, s, 1.5);
        assert.ok(overlap >= 0 && overlap <= Math.abs(q.x - p.x) + 1e-9);
      }
    });
  });
});

describe("polylines and points", () => {
  it("polylineLength sums the segments", () => {
    closeTo(polylineLength([P(0, 0), P(3, 4)]), 5);
    closeTo(polylineLength([P(0, 0), P(3, 4), P(3, 10), P(-5, 10)]), 5 + 6 + 8);
    assert.equal(polylineLength([P(1, 1), P(1, 1), P(1, 1)]), 0);
  });

  it("polylineLength of nothing or one point is 0", () => {
    assert.equal(polylineLength([]), 0);
    assert.equal(polylineLength([P(4, 4)]), 0);
  });

  it("polylineLength does not depend on the direction (seeded property test)", () => {
    const random = makeRandom(8);
    for (let i = 0; i < 500; i++) {
      const points = Array.from({ length: 2 + Math.floor(random() * 6) }, () => P(between(random, -100, 100), between(random, -100, 100)));
      closeTo(polylineLength(points), polylineLength([...points].reverse()), 1e-9);
    }
  });

  it("manhattanDistance is |dx| + |dy|, symmetric, zero for equal points", () => {
    assert.equal(manhattanDistance(P(0, 0), P(3, -4)), 7);
    assert.equal(manhattanDistance(P(3, -4), P(0, 0)), 7);
    assert.equal(manhattanDistance(P(2, 2), P(2, 2)), 0);
    assert.equal(manhattanDistance(P(-1e15, 0), P(1e15, 1)), 2e15 + 1);
  });

  it("route length is never below the Manhattan distance of its ends for orthogonal routes", () => {
    const route = [P(0, 0), P(0, 50), P(100, 50), P(100, 20)];
    assert.ok(polylineLength(route) >= manhattanDistance(route[0] as Point, route[3] as Point));
  });

  describe("nearest point and distance", () => {
    const line = [P(0, 0), P(10, 0), P(10, 10)];

    it("projects onto a segment and clamps at the ends", () => {
      assert.deepEqual(nearestPointOnSegment(P(5, 3), P(0, 0), P(10, 0)), P(5, 0));
      assert.deepEqual(nearestPointOnSegment(P(-5, 3), P(0, 0), P(10, 0)), P(0, 0));
      assert.deepEqual(nearestPointOnSegment(P(15, 3), P(0, 0), P(10, 0)), P(10, 0));
      assert.deepEqual(nearestPointOnSegment(P(15, 3), P(2, 2), P(2, 2)), P(2, 2));
    });

    it("finds the nearest point on a polyline", () => {
      assert.deepEqual(nearestPointOnPolyline(P(5, 3), line), P(5, 0));
      assert.deepEqual(nearestPointOnPolyline(P(14, 6), line), P(10, 6));
      assert.deepEqual(nearestPointOnPolyline(P(-3, -4), line), P(0, 0));
    });

    it("breaks ties by the earlier segment", () => {
      // (5, 5) is 5 px from the first segment and 5 px from the second.
      assert.deepEqual(nearestPointOnPolyline(P(5, 5), line), P(5, 0));
    });

    it("distanceToPolyline matches the nearest point", () => {
      assert.equal(distanceToPolyline(P(5, 3), line), 3);
      assert.equal(distanceToPolyline(P(10, 4), line), 0);
      assert.equal(distanceToPolyline(P(13, 14), line), Math.hypot(3, 4));
    });

    it("a single point is a polyline; a polyline with repeated points has no zero-length trouble", () => {
      assert.equal(distanceToPolyline(P(3, 4), [P(0, 0)]), 5);
      assert.equal(distanceToPolyline(P(3, 4), [P(0, 0), P(0, 0), P(0, 0)]), 5);
      assert.equal(distanceToPolyline(P(3, 0), [P(0, 0), P(0, 0), P(10, 0)]), 0);
    });

    it("an empty polyline or polygon throws instead of answering Infinity", () => {
      assert.throws(() => distanceToPolyline(P(0, 0), []), RangeError);
      assert.throws(() => nearestPointOnPolyline(P(0, 0), []), RangeError);
      assert.throws(() => distanceToPolygon(P(0, 0), []), RangeError);
      assert.throws(() => clipSegmentToPolygon(P(0, 0), P(1, 1), []), RangeError);
    });

    it("the distance to a closed polygon includes the closing edge", () => {
      const triangle = [P(0, 0), P(10, 0), P(0, 10)];
      assert.equal(distanceToPolygon(P(-3, 5), triangle), 3);
      closeTo(distanceToPolyline(P(-3, 5), triangle), 8 / Math.SQRT2);
      assert.deepEqual(nearestPointOnPolygon(P(-3, 5), triangle), P(0, 5));
    });

    it("distance is a metric: never negative, 0 only on the line, 1-Lipschitz (seeded property test)", () => {
      const random = makeRandom(1234);
      for (let i = 0; i < 1000; i++) {
        const points = Array.from({ length: 2 + Math.floor(random() * 5) }, () => P(between(random, -50, 50), between(random, -50, 50)));
        const a = P(between(random, -80, 80), between(random, -80, 80));
        const b = P(between(random, -80, 80), between(random, -80, 80));
        const da = distanceToPolyline(a, points);
        const db = distanceToPolyline(b, points);
        assert.ok(da >= 0 && db >= 0);
        assert.ok(Math.abs(da - db) <= Math.hypot(a.x - b.x, a.y - b.y) + 1e-9);
      }
    });
  });
});

describe("input checks", () => {
  const bad: ReadonlyArray<readonly [string, number]> = [
    ["NaN", Number.NaN],
    ["Infinity", Number.POSITIVE_INFINITY],
    ["-Infinity", Number.NEGATIVE_INFINITY],
    ["beyond the limit", COORDINATE_LIMIT * 2],
  ];
  for (const [name, value] of bad) {
    it(`rejects ${name} with a RangeError in every kind of argument`, () => {
      const box: Box = { x: 0, y: 0, w: 10, h: 10 };
      assert.throws(() => distanceToOutline(P(value, 0), "rect", box), RangeError);
      assert.throws(() => distanceToOutline(P(0, value), "rect", box), RangeError);
      assert.throws(() => shapeOutline("rect", { x: value, y: 0, w: 10, h: 10 }), RangeError);
      assert.throws(() => shapeOutline("rect", { x: 0, y: 0, w: value, h: 10 }), RangeError);
      assert.throws(() => shapeOutline("rect", { x: 0, y: 0, w: 10, h: value }), RangeError);
      assert.throws(() => clipSegmentToOutline(P(0, 0), P(value, 0), "pill", box), RangeError);
      assert.throws(() => clipRayToOutline(P(value, 0), P(0, 0), "pill", box), RangeError);
      assert.throws(() => segmentIntersectsBox(P(0, 0), P(value, 0), box), RangeError);
      assert.throws(() => segmentIntersectsBox(P(0, 0), P(1, 1), box, value), RangeError);
      assert.throws(() => segmentsCross(P(0, 0), P(1, 1), P(0, value), P(1, 0)), RangeError);
      assert.throws(() => polylineLength([P(0, 0), P(value, 1)]), RangeError);
      assert.throws(() => countPolylineCrossings([P(0, 0), P(value, 1)], []), RangeError);
      assert.throws(() => manhattanDistance(P(value, 0), P(0, 0)), RangeError);
      assert.throws(() => pointInBox(P(0, 0), box, value), RangeError);
      assert.throws(() => boxesIntersect(box, box, value), RangeError);
      assert.throws(() => boxContainsBox(box, box, value), RangeError);
      assert.throws(() => segmentOverlapLength(P(0, 0), P(1, 0), P(0, 0), P(1, 0), value), RangeError);
      assert.throws(() => nearestPointOnSegment(P(0, 0), P(value, 0), P(1, 1)), RangeError);
    });
  }

  it("rejects a negative box size and a negative tolerance", () => {
    assert.throws(() => shapeOutline("rect", { x: 0, y: 0, w: -1, h: 10 }), RangeError);
    assert.throws(() => boxOutline({ x: 0, y: 0, w: 10, h: -1 }), RangeError);
    assert.throws(() => pointInBox(P(0, 0), { x: 0, y: 0, w: -1, h: 1 }), RangeError);
    assert.throws(() => boxContainsBox(BOX, BOX, -1), RangeError);
    assert.throws(() => segmentOverlapLength(P(0, 0), P(1, 0), P(0, 0), P(1, 0), -1), RangeError);
  });

  it("names the offending argument in the message", () => {
    assert.throws(() => distanceToOutline(P(Number.NaN, 0), "rect", BOX), /point\.x must be a finite number/);
    assert.throws(() => shapeOutline("rect", { x: 0, y: 0, w: -3, h: 1 }), /box must not have a negative size/);
  });

  it("accepts -0 and the coordinate limit itself", () => {
    assert.equal(distanceToOutline(P(5, -0), "rect", { x: -0, y: -0, w: 10, h: 10 }), 0);
    assert.ok(Number.isFinite(distanceToOutline(P(COORDINATE_LIMIT, 0), "rect", BOX)));
  });

  it("an unknown shape from untyped data fails loudly", () => {
    assert.throws(() => shapeOutline("parallelogram" as Shape, BOX), /unknown shape parallelogram/);
  });
});

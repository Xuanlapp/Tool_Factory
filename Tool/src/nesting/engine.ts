export type Point = { x: number; y: number };
export type Bounds = { left: number; top: number; right: number; bottom: number; width: number; height: number };
export type Polygon = Point[];

export type NestItem = {
  id: string;
  sizeInch: number;
  polygon: Polygon;
};

export type NestPlacement = {
  id: string;
  angle: number;
  polygon: Polygon;
  bounds: Bounds;
  score: number;
};

export type NestOptions = {
  template: Bounds;
  gap: number;
  /** Kept for compatibility. FAST mode only uses it for the fallback scan. */
  angleStep?: number;
  fallbackGridStep?: number;
  maxCandidatesPerAngle?: number;
};

const EPSILON = 1e-6;

export function polygonBounds(points: Polygon): Bounds {
  const xs = points.map((point) => point.x);
  const ys = points.map((point) => point.y);
  const left = Math.min(...xs);
  const right = Math.max(...xs);
  const bottom = Math.min(...ys);
  const top = Math.max(...ys);
  return { left, top, right, bottom, width: right - left, height: top - bottom };
}

export function polygonArea(points: Polygon): number {
  let area = 0;
  for (let index = 0; index < points.length; index += 1) {
    const next = points[(index + 1) % points.length];
    const point = points[index];
    area += point.x * next.y - next.x * point.y;
  }
  return Math.abs(area) / 2;
}

export function rotatePolygon(points: Polygon, angle: number): Polygon {
  const radians = angle * Math.PI / 180;
  const cos = Math.cos(radians);
  const sin = Math.sin(radians);
  const bounds = polygonBounds(points);
  const center = { x: (bounds.left + bounds.right) / 2, y: (bounds.top + bounds.bottom) / 2 };
  return points.map((point) => ({
    x: center.x + ((point.x - center.x) * cos) - ((point.y - center.y) * sin),
    y: center.y + ((point.x - center.x) * sin) + ((point.y - center.y) * cos),
  }));
}

export function translatePolygon(points: Polygon, dx: number, dy: number): Polygon {
  return points.map((point) => ({ x: point.x + dx, y: point.y + dy }));
}

export function expandBounds(bounds: Bounds, amount: number): Bounds {
  return {
    left: bounds.left - amount,
    right: bounds.right + amount,
    top: bounds.top + amount,
    bottom: bounds.bottom - amount,
    width: bounds.width + amount * 2,
    height: bounds.height + amount * 2,
  };
}

export function boundsIntersect(a: Bounds, b: Bounds): boolean {
  return !(a.right <= b.left || a.left >= b.right || a.top <= b.bottom || a.bottom >= b.top);
}

export function boundsInside(bounds: Bounds, template: Bounds): boolean {
  return bounds.left >= template.left - EPSILON && bounds.right <= template.right + EPSILON &&
    bounds.bottom >= template.bottom - EPSILON && bounds.top <= template.top + EPSILON;
}

function orientation(a: Point, b: Point, c: Point): number {
  return (b.y - a.y) * (c.x - b.x) - (b.x - a.x) * (c.y - b.y);
}

function onSegment(a: Point, b: Point, c: Point): boolean {
  return b.x <= Math.max(a.x, c.x) + EPSILON && b.x >= Math.min(a.x, c.x) - EPSILON &&
    b.y <= Math.max(a.y, c.y) + EPSILON && b.y >= Math.min(a.y, c.y) - EPSILON;
}

function segmentsIntersect(p1: Point, q1: Point, p2: Point, q2: Point): boolean {
  const o1 = orientation(p1, q1, p2);
  const o2 = orientation(p1, q1, q2);
  const o3 = orientation(p2, q2, p1);
  const o4 = orientation(p2, q2, q1);
  if (o1 * o2 < 0 && o3 * o4 < 0) return true;
  if (Math.abs(o1) < EPSILON && onSegment(p1, p2, q1)) return true;
  if (Math.abs(o2) < EPSILON && onSegment(p1, q2, q1)) return true;
  if (Math.abs(o3) < EPSILON && onSegment(p2, p1, q2)) return true;
  if (Math.abs(o4) < EPSILON && onSegment(p2, q1, q2)) return true;
  return false;
}

function pointInPolygon(point: Point, polygon: Polygon): boolean {
  let inside = false;
  for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i, i += 1) {
    const pi = polygon[i];
    const pj = polygon[j];
    const intersect = ((pi.y > point.y) !== (pj.y > point.y)) &&
      point.x < (pj.x - pi.x) * (point.y - pi.y) / (pj.y - pi.y) + pi.x;
    if (intersect) inside = !inside;
  }
  return inside;
}

export function polygonsIntersect(a: Polygon, b: Polygon): boolean {
  if (!boundsIntersect(polygonBounds(a), polygonBounds(b))) return false;
  for (let i = 0; i < a.length; i += 1) {
    for (let j = 0; j < b.length; j += 1) {
      if (segmentsIntersect(a[i], a[(i + 1) % a.length], b[j], b[(j + 1) % b.length])) return true;
    }
  }
  return pointInPolygon(a[0], b) || pointInPolygon(b[0], a);
}

/** Legacy helper retained for callers; placement validation uses exact edge distance. */
export function makePackShape(polygon: Polygon, gap: number): Polygon {
  const bounds = polygonBounds(polygon);
  const center = { x: (bounds.left + bounds.right) / 2, y: (bounds.top + bounds.bottom) / 2 };
  return polygon.map((point) => {
    const dx = point.x - center.x;
    const dy = point.y - center.y;
    const length = Math.hypot(dx, dy) || 1;
    return { x: point.x + dx / length * gap / 2, y: point.y + dy / length * gap / 2 };
  });
}

function pointSegmentDistance(point: Point, start: Point, end: Point): number {
  const dx = end.x - start.x;
  const dy = end.y - start.y;
  const lengthSquared = dx * dx + dy * dy;
  if (lengthSquared < EPSILON) return Math.hypot(point.x - start.x, point.y - start.y);
  const t = Math.max(0, Math.min(1, ((point.x - start.x) * dx + (point.y - start.y) * dy) / lengthSquared));
  return Math.hypot(point.x - (start.x + t * dx), point.y - (start.y + t * dy));
}

function segmentDistance(a1: Point, a2: Point, b1: Point, b2: Point): number {
  if (segmentsIntersect(a1, a2, b1, b2)) return 0;
  return Math.min(
    pointSegmentDistance(a1, b1, b2), pointSegmentDistance(a2, b1, b2),
    pointSegmentDistance(b1, a1, a2), pointSegmentDistance(b2, a1, a2),
  );
}

function polygonsTooClose(a: Polygon, b: Polygon, gap: number): boolean {
  if (polygonsIntersect(a, b)) return true;
  for (let i = 0; i < a.length; i += 1) {
    for (let j = 0; j < b.length; j += 1) {
      if (segmentDistance(a[i], a[(i + 1) % a.length], b[j], b[(j + 1) % b.length]) < gap - EPSILON) return true;
    }
  }
  return false;
}

function normalizeAngle(angle: number): number {
  const normalized = angle % 360;
  return normalized < 0 ? normalized + 360 : normalized;
}

function longestEdgeAngle(polygon: Polygon): number {
  let bestLength = -1;
  let bestAngle = 0;
  for (let index = 0; index < polygon.length; index += 1) {
    const point = polygon[index];
    const next = polygon[(index + 1) % polygon.length];
    const length = Math.hypot(next.x - point.x, next.y - point.y);
    if (length > bestLength) {
      bestLength = length;
      bestAngle = Math.atan2(next.y - point.y, next.x - point.x) * 180 / Math.PI;
    }
  }
  return bestAngle;
}

function fastAngles(item: NestItem, placed: NestPlacement[]): number[] {
  const edgeAngle = longestEdgeAngle(item.polygon);
  const raw = [-edgeAngle, 180 - edgeAngle, 90 - edgeAngle, 270 - edgeAngle, 0, 90, 180, 270];
  // A few obstacle-alignment angles help irregular shapes without restoring a full sweep.
  for (const obstacle of placed.slice(-2)) raw.push(longestEdgeAngle(obstacle.polygon) - edgeAngle);
  const result: number[] = [];
  for (const angle of raw.map(normalizeAngle)) {
    if (!result.some((existing) => Math.abs(((existing - angle + 540) % 360) - 180) < 1)) result.push(angle);
  }
  return result.slice(0, 10);
}

function importantVertices(polygon: Polygon, maximum = 12): Point[] {
  if (polygon.length <= maximum) return polygon;
  const bounds = polygonBounds(polygon);
  const targets = [
    { x: bounds.left, y: bounds.top }, { x: bounds.right, y: bounds.top },
    { x: bounds.left, y: bounds.bottom }, { x: bounds.right, y: bounds.bottom },
  ];
  const selected: Point[] = [];
  for (const target of targets) {
    const nearest = polygon.reduce((best, point) =>
      Math.hypot(point.x - target.x, point.y - target.y) < Math.hypot(best.x - target.x, best.y - target.y) ? point : best);
    if (!selected.includes(nearest)) selected.push(nearest);
  }
  const edges = polygon.map((point, index) => ({
    start: point,
    end: polygon[(index + 1) % polygon.length],
    length: Math.hypot(polygon[(index + 1) % polygon.length].x - point.x, polygon[(index + 1) % polygon.length].y - point.y),
  })).sort((a, b) => b.length - a.length);
  for (const edge of edges) {
    for (const point of [edge.start, edge.end]) if (!selected.includes(point)) selected.push(point);
    if (selected.length >= maximum) break;
  }
  return selected.slice(0, maximum);
}

function candidateTranslations(rotated: Polygon, placed: NestPlacement[], template: Bounds, gap: number, maximum: number): Point[] {
  const box = polygonBounds(rotated);
  const candidates: Point[] = [
    { x: template.left - box.left, y: template.top - box.top },
    { x: template.right - box.right, y: template.top - box.top },
    { x: template.left - box.left, y: template.bottom - box.bottom },
    { x: template.right - box.right, y: template.bottom - box.bottom },
  ];
  for (const obstacle of placed) {
    candidates.push(
      { x: obstacle.bounds.right + gap - box.left, y: obstacle.bounds.top - box.top },
      { x: obstacle.bounds.left - gap - box.right, y: obstacle.bounds.top - box.top },
      { x: obstacle.bounds.left - box.left, y: obstacle.bounds.bottom - gap - box.top },
      { x: obstacle.bounds.left - box.left, y: obstacle.bounds.top + gap - box.bottom },
    );
  }
  const itemVertices = importantVertices(rotated);
  for (const obstacle of placed) {
    for (const obstacleVertex of importantVertices(obstacle.polygon)) {
      for (const itemVertex of itemVertices) {
        const x = obstacleVertex.x - itemVertex.x;
        const y = obstacleVertex.y - itemVertex.y;
        candidates.push(
          { x: x + gap, y }, { x: x - gap, y },
          { x, y: y + gap }, { x, y: y - gap },
        );
        if (candidates.length >= maximum * 2) break;
      }
      if (candidates.length >= maximum * 2) break;
    }
    if (candidates.length >= maximum * 2) break;
  }
  candidates.sort((a, b) => {
    const aBoxTop = box.top + a.y;
    const bBoxTop = box.top + b.y;
    return bBoxTop - aBoxTop || (box.left + a.x) - (box.left + b.x);
  });
  const unique: Point[] = [];
  for (const candidate of candidates) {
    if (!unique.some((point) => Math.abs(point.x - candidate.x) < 0.01 && Math.abs(point.y - candidate.y) < 0.01)) {
      unique.push(candidate);
      if (unique.length >= maximum) break;
    }
  }
  return unique;
}

function validPlacement(polygon: Polygon, bounds: Bounds, template: Bounds, placed: NestPlacement[], gap: number): boolean {
  if (!boundsInside(bounds, template)) return false;
  const searchBounds = expandBounds(bounds, gap);
  for (const obstacle of placed) {
    if (!boundsIntersect(searchBounds, obstacle.bounds)) continue;
    if (polygonsTooClose(polygon, obstacle.polygon, gap)) return false;
  }
  return true;
}

function makePlacement(item: NestItem, rotated: Polygon, angle: number, translation: Point,
  template: Bounds, placed: NestPlacement[], gap: number): NestPlacement | undefined {
  const polygon = translatePolygon(rotated, translation.x, translation.y);
  const bounds = polygonBounds(polygon);
  if (!validPlacement(polygon, bounds, template, placed, gap)) return undefined;
  // score is informational in first-fit mode; larger means closer to the preferred top-left.
  const score = -(template.top - bounds.top) * 10 - (bounds.left - template.left);
  return { id: item.id, angle, polygon, bounds, score };
}

function fallbackGridScan(item: NestItem, angles: number[], template: Bounds, placed: NestPlacement[],
  gap: number, step: number): NestPlacement | undefined {
  for (const angle of angles) {
    const rotated = rotatePolygon(item.polygon, angle);
    const box = polygonBounds(rotated);
    for (let top = template.top; top >= template.bottom + box.height - EPSILON; top -= step) {
      for (let left = template.left; left <= template.right - box.width + EPSILON; left += step) {
        const result = makePlacement(item, rotated, angle, { x: left - box.left, y: top - box.top }, template, placed, gap);
        if (result) return result;
      }
    }
  }
  return undefined;
}

export function nestItems(items: NestItem[], options: NestOptions): NestPlacement[] {
  if (options.gap < 0) throw new Error("gap must be non-negative");
  const maximum = options.maxCandidatesPerAngle ?? 500;
  const gridStep = options.fallbackGridStep ?? Math.max(options.gap, 1);
  const ordered = [...items].sort((left, right) =>
    right.sizeInch - left.sizeInch || polygonArea(right.polygon) - polygonArea(left.polygon) ||
    left.id.localeCompare(right.id, "en"));
  const placed: NestPlacement[] = [];

  for (const item of ordered) {
    const angles = fastAngles(item, placed);
    let result: NestPlacement | undefined;
    for (const angle of angles) {
      const rotated = rotatePolygon(item.polygon, angle);
      const candidates = candidateTranslations(rotated, placed, options.template, options.gap, maximum);
      for (const translation of candidates) {
        result = makePlacement(item, rotated, angle, translation, options.template, placed, options.gap);
        if (result) break;
      }
      if (result) break;
    }
    result ??= fallbackGridScan(item, angles, options.template, placed, options.gap, gridStep);
    if (!result) throw new Error(`Cannot place ${item.id}`);
    placed.push(result);
  }
  return placed;
}

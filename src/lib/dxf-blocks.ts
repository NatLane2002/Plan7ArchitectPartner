/**
 * DXF Primitive Helpers for ArchDraft Universal
 *
 * All entities include the AC1015-required subclass markers (group code 100).
 * Without these, strict parsers like Plan7Architect abort the ENTITIES section
 * and show a completely blank drawing on import.
 *
 * AC1015 entity structure:
 *   0    entity type
 *   5    handle (omitted — auto-assigned by importer)
 *   100  AcDbEntity          ← REQUIRED subclass marker
 *   8    layer name
 *   100  AcDb<EntityType>    ← REQUIRED subclass marker
 *   ... entity-specific group codes ...
 */

// ─────────────────────────────────────────────────────────────────────────────
// LINE
// ─────────────────────────────────────────────────────────────────────────────
export function dxfLine(
  x1: number, y1: number,
  x2: number, y2: number,
  layer: string
): string {
  return (
    `0\nLINE\n` +
    `100\nAcDbEntity\n` +
    `8\n${layer}\n` +
    `100\nAcDbLine\n` +
    `10\n${x1.toFixed(2)}\n` +
    `20\n${y1.toFixed(2)}\n` +
    `30\n0.0\n` +
    `11\n${x2.toFixed(2)}\n` +
    `21\n${y2.toFixed(2)}\n` +
    `31\n0.0\n`
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// LWPOLYLINE
// ─────────────────────────────────────────────────────────────────────────────
export function dxfLwpolyline(
  points: [number, number][],
  layer: string,
  closed: boolean
): string {
  const flags = closed ? 1 : 0;
  let out =
    `0\nLWPOLYLINE\n` +
    `100\nAcDbEntity\n` +
    `8\n${layer}\n` +
    `100\nAcDbPolyline\n` +
    `90\n${points.length}\n` +
    `70\n${flags}\n` +
    `43\n0.0\n`;          // constant width = 0
  for (const [x, y] of points) {
    out += `10\n${x.toFixed(2)}\n20\n${y.toFixed(2)}\n`;
  }
  return out;
}

// ─────────────────────────────────────────────────────────────────────────────
// TEXT  (single-line)
// ─────────────────────────────────────────────────────────────────────────────
export function dxfText(
  text: string,
  x: number, y: number,
  height: number,
  layer: string
): string {
  // Strip characters that corrupt DXF TEXT entities
  const safe = text.replace(/[\\%{}|<>]/g, "");
  return (
    `0\nTEXT\n` +
    `100\nAcDbEntity\n` +
    `8\n${layer}\n` +
    `100\nAcDbText\n` +
    `10\n${x.toFixed(2)}\n` +
    `20\n${y.toFixed(2)}\n` +
    `30\n0.0\n` +
    `40\n${height.toFixed(2)}\n` +
    `1\n${safe}\n` +
    `72\n1\n` +           // horizontal justification: center
    `11\n${x.toFixed(2)}\n` +
    `21\n${y.toFixed(2)}\n` +
    `31\n0.0\n` +
    `100\nAcDbText\n`     // second AcDbText subclass required by AC1015
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// HATCH  (solid fill, polyline boundary)
//
// AC1015 HATCH structure (polyline boundary path):
//   100 AcDbEntity
//   8   layer
//   100 AcDbHatch
//   10/20/30  elevation point (0,0,0)
//   210/220/230 extrusion (0,0,1)
//   2   pattern name
//   70  solid fill flag (1=solid)
//   71  associativity (0=non-associative)
//   91  number of boundary paths
//   --- boundary path ---
//   92  path type (2=polyline)
//   72  has_bulge (0)
//   73  is_closed (1)
//   93  vertex count
//   10/20 vertices (no closing duplicate)
//   97  source boundary objects (0)
//   --- end boundary ---
//   75  hatch style (1=normal)
//   76  hatch pattern type (1=predefined)
//   52  pattern angle (0)
//   41  pattern scale (1)
//   77  pattern double flag (0)
//   78  number of pattern definition lines (0 for SOLID)
// ─────────────────────────────────────────────────────────────────────────────
export function generateHatch(
  boundaryPoints: [number, number][],
  patternName: string = "SOLID",
  layer: string = "A-ROOM",
  color: number = 251
): string {
  // Remove closing duplicate vertex if caller included it
  const pts =
    boundaryPoints.length > 1 &&
    boundaryPoints[boundaryPoints.length - 1][0] === boundaryPoints[0][0] &&
    boundaryPoints[boundaryPoints.length - 1][1] === boundaryPoints[0][1]
      ? boundaryPoints.slice(0, -1)
      : boundaryPoints;

  let out =
    `0\nHATCH\n` +
    `100\nAcDbEntity\n` +
    `8\n${layer}\n` +
    `62\n${color}\n` +
    `100\nAcDbHatch\n` +
    `10\n0.0\n20\n0.0\n30\n0.0\n` +   // elevation point
    `210\n0.0\n220\n0.0\n230\n1.0\n` + // extrusion direction
    `2\n${patternName}\n` +
    `70\n1\n` +   // solid fill
    `71\n0\n` +   // non-associative
    `91\n1\n` +   // 1 boundary path
    `92\n2\n` +   // path type: polyline
    `72\n0\n` +   // has_bulge: no
    `73\n1\n` +   // is_closed: yes
    `93\n${pts.length}\n`;

  for (const [x, y] of pts) {
    out += `10\n${x.toFixed(2)}\n20\n${y.toFixed(2)}\n`;
  }

  out +=
    `97\n0\n` +   // source boundary objects: none
    `75\n1\n` +   // hatch style: normal
    `76\n1\n` +   // pattern type: predefined
    `52\n0.0\n` + // pattern angle
    `41\n1.0\n` + // pattern scale
    `77\n0\n` +   // pattern double: no
    `78\n0\n`;    // pattern definition lines: 0

  return out;
}

// ─────────────────────────────────────────────────────────────────────────────
// DIMENSION  (linear, no geometry block)
//
// We emit definition points only. The anonymous geometry block (group code 2)
// is intentionally omitted — referencing a non-existent block crashes parsers.
// Most CAD importers reconstruct the dimension value from the definition points.
// ─────────────────────────────────────────────────────────────────────────────
export function generateDimension(
  x1: number, y1: number,
  x2: number, y2: number,
  offsetDistance: number = 500,
  layer: string = "A-DIMS"
): string {
  const isHorizontal = Math.abs(y1 - y2) < 1;
  const midX = (x1 + x2) / 2;
  const midY = (y1 + y2) / 2;
  const dimX = isHorizontal ? midX        : x1 + offsetDistance;
  const dimY = isHorizontal ? y1 + offsetDistance : midY;

  return (
    `0\nDIMENSION\n` +
    `100\nAcDbEntity\n` +
    `8\n${layer}\n` +
    `100\nAcDbDimension\n` +
    `10\n${dimX.toFixed(2)}\n20\n${dimY.toFixed(2)}\n30\n0.0\n` +  // dim line point
    `11\n${dimX.toFixed(2)}\n21\n${dimY.toFixed(2)}\n31\n0.0\n` +  // text midpoint
    `70\n${isHorizontal ? 32 : 33}\n` +  // 32=horizontal aligned, 33=vertical aligned
    `1\n\n` +          // override text (empty = use measured value)
    `3\nSTANDARD\n` +  // dimension style
    `100\nAcDbAlignedDimension\n` +
    `13\n${x1.toFixed(2)}\n23\n${y1.toFixed(2)}\n33\n0.0\n` +  // defpoint 1
    `14\n${x2.toFixed(2)}\n24\n${y2.toFixed(2)}\n34\n0.0\n`    // defpoint 2
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Legacy exports kept for any remaining callers
// ─────────────────────────────────────────────────────────────────────────────
export function generateXData(
  roomId: string,
  roomName: string,
  areaSqft: number,
  level: number
): string {
  // XDATA is appended directly after an entity's regular data
  return (
    `1001\nARCHDRAFT\n` +
    `1000\nROOM_ID:${roomId}\n` +
    `1000\nROOM_NAME:${roomName}\n` +
    `1040\n${areaSqft.toFixed(2)}\n` +
    `1070\n${level}\n`
  );
}

export function generateBlocksSection(): string { return ""; }
export function insertBlock(
  _blockName: string, _x: number, _y: number,
  _rotation: number = 0, _layer: string = "0"
): string { return ""; }

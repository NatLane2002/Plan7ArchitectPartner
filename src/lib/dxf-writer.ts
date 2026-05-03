/**
 * DXF Writer for Plan 7 Architektur Pro
 *
 * Generates a properly layered DXF file with:
 * - EXTERIOR_WALLS layer (color 7 / white, 250mm thick polylines)
 * - INTERIOR_WALLS layer (color 8 / grey, 120mm thick polylines)
 * - DOORS layer (color 1 / red)
 * - WINDOWS layer (color 5 / blue)
 * - LABELS layer (color 3 / green)
 *
 * All geometry uses LWPOLYLINE for maximum CAD compatibility.
 * Units: millimeters.
 */

import type { FloorPlanGeometry, Rect, WallSegment, PlacedOpening } from "./bsp-engine";

// ── DXF Color Constants (AutoCAD Color Index) ──
const COLORS = {
  EXTERIOR_WALLS: 7,  // White
  INTERIOR_WALLS: 8,  // Grey
  DOORS: 1,           // Red
  WINDOWS: 5,         // Blue
  LABELS: 3,          // Green
  ROOM_FILL: 251,     // Light grey
} as const;

// ── Layer definitions ──
interface LayerDef {
  name: string;
  color: number;
  lineType: string;
}

const LAYERS: LayerDef[] = [
  { name: "EXTERIOR_WALLS", color: COLORS.EXTERIOR_WALLS, lineType: "CONTINUOUS" },
  { name: "INTERIOR_WALLS", color: COLORS.INTERIOR_WALLS, lineType: "CONTINUOUS" },
  { name: "DOORS", color: COLORS.DOORS, lineType: "CONTINUOUS" },
  { name: "WINDOWS", color: COLORS.WINDOWS, lineType: "DASHED" },
  { name: "LABELS", color: COLORS.LABELS, lineType: "CONTINUOUS" },
];

/**
 * Generate a complete DXF string from floor plan geometry
 */
export function generateDXF(geometry: FloorPlanGeometry): string {
  const sections: string[] = [];

  // HEADER section
  sections.push(generateHeader(geometry));

  // TABLES section (layers, line types, styles)
  sections.push(generateTables());

  // BLOCKS section (empty but required)
  sections.push(generateBlocks());

  // ENTITIES section (the actual geometry)
  sections.push(generateEntities(geometry));

  // End of file
  sections.push("0\nEOF\n");

  return sections.join("");
}

// ── HEADER ──

function generateHeader(geometry: FloorPlanGeometry): string {
  const { footprint } = geometry;
  return `0
SECTION
2
HEADER
9
$ACADVER
1
AC1015
9
$INSUNITS
70
4
9
$MEASUREMENT
70
1
9
$LUNITS
70
2
9
$LUPREC
70
0
9
$EXTMIN
10
0.0
20
0.0
30
0.0
9
$EXTMAX
10
${footprint.width.toFixed(1)}
20
${footprint.height.toFixed(1)}
30
0.0
0
ENDSEC
`;
}

// ── TABLES (Layers, LineTypes, Styles) ──

function generateTables(): string {
  let out = `0
SECTION
2
TABLES
`;

  // Line types table
  out += `0
TABLE
2
LTYPE
70
2
`;
  // CONTINUOUS
  out += `0
LTYPE
2
CONTINUOUS
70
0
3
Solid line
72
65
73
0
40
0.0
`;
  // DASHED
  out += `0
LTYPE
2
DASHED
70
0
3
Dashed line
72
65
73
2
40
12.0
49
8.0
49
-4.0
`;
  out += `0
ENDTAB
`;

  // Layers table
  out += `0
TABLE
2
LAYER
70
${LAYERS.length}
`;
  for (const layer of LAYERS) {
    out += `0
LAYER
2
${layer.name}
70
0
62
${layer.color}
6
${layer.lineType}
`;
  }
  out += `0
ENDTAB
`;

  // Text style table
  out += `0
TABLE
2
STYLE
70
1
0
STYLE
2
STANDARD
70
0
40
0.0
41
1.0
50
0.0
71
0
42
250.0
3
txt
4

0
ENDTAB
`;

  out += `0
ENDSEC
`;
  return out;
}

// ── BLOCKS ──

function generateBlocks(): string {
  return `0
SECTION
2
BLOCKS
0
ENDSEC
`;
}

// ── ENTITIES ──

function generateEntities(geometry: FloorPlanGeometry): string {
  let out = `0
SECTION
2
ENTITIES
`;

  const spacingX = geometry.footprint.width + 3000; // 3000mm spacing between levels
  const tx = (x: number, level: number) => x + (level - 1) * spacingX;

  // 1. Draw each room boundary
  for (const room of geometry.rooms) {
    const rx = tx(room.rect.x, room.level);
    out += drawRoomBoundary({ ...room.rect, x: rx }, "INTERIOR_WALLS");
  }

  // 2. Draw walls as thick polylines
  for (const wall of geometry.walls) {
    const w = { ...wall, x1: tx(wall.x1, wall.level), x2: tx(wall.x2, wall.level) };
    if (w.layer === "INTERIOR_WALLS") {
      out += drawWallLine(w);
    } else if (w.layer === "EXTERIOR_WALLS") {
      // Draw exterior walls identically, but on the exterior layer
      out += drawWallLine(w);
    }
  }

  // 3. Draw openings (doors and windows)
  for (const opening of geometry.openings) {
    const o = { ...opening, x: tx(opening.x, opening.level) };
    out += drawOpening(o);
  }

  // 4. Draw room labels
  for (const room of geometry.rooms) {
    const r = { ...room.rect, x: tx(room.rect.x, room.level) };
    out += drawLabel(room.name, r);
    out += drawAreaLabel(room.actual_area_sqft, r);
  }

  out += `0
ENDSEC
`;
  return out;
}

/**
 * Draw exterior wall as two concentric closed LWPOLYLINEs (outer + inner boundary)
 */
function drawWallPolyline(rect: Rect, thickness: number, layer: string): string {
  let out = "";

  // Outer boundary
  out += lwpolyline(
    [
      [rect.x, rect.y],
      [rect.x + rect.width, rect.y],
      [rect.x + rect.width, rect.y + rect.height],
      [rect.x, rect.y + rect.height],
    ],
    layer,
    true
  );

  // Inner boundary (offset inward by wall thickness)
  out += lwpolyline(
    [
      [rect.x + thickness, rect.y + thickness],
      [rect.x + rect.width - thickness, rect.y + thickness],
      [rect.x + rect.width - thickness, rect.y + rect.height - thickness],
      [rect.x + thickness, rect.y + rect.height - thickness],
    ],
    layer,
    true
  );

  return out;
}

/**
 * Draw room boundary as closed LWPOLYLINE
 */
function drawRoomBoundary(rect: Rect, layer: string): string {
  return lwpolyline(
    [
      [rect.x, rect.y],
      [rect.x + rect.width, rect.y],
      [rect.x + rect.width, rect.y + rect.height],
      [rect.x, rect.y + rect.height],
    ],
    layer,
    true
  );
}

/**
 * Draw an interior wall as a thick line (two parallel lines)
 */
function drawWallLine(wall: WallSegment): string {
  const halfT = wall.thickness / 2;
  const isVertical = Math.abs(wall.x1 - wall.x2) < 1;

  let out = "";

  if (isVertical) {
    // Vertical wall — offset in X
    out += lwpolyline(
      [
        [wall.x1 - halfT, wall.y1],
        [wall.x1 - halfT, wall.y2],
      ],
      wall.layer,
      false
    );
    out += lwpolyline(
      [
        [wall.x1 + halfT, wall.y1],
        [wall.x1 + halfT, wall.y2],
      ],
      wall.layer,
      false
    );
  } else {
    // Horizontal wall — offset in Y
    out += lwpolyline(
      [
        [wall.x1, wall.y1 - halfT],
        [wall.x2, wall.y1 - halfT],
      ],
      wall.layer,
      false
    );
    out += lwpolyline(
      [
        [wall.x1, wall.y1 + halfT],
        [wall.x2, wall.y1 + halfT],
      ],
      wall.layer,
      false
    );
  }

  return out;
}

/**
 * Draw door or window opening as a line on its respective layer
 */
function drawOpening(opening: PlacedOpening): string {
  let out = "";
  const isVertical = opening.angle === 90;

  if (isVertical) {
    out += lwpolyline(
      [
        [opening.x, opening.y],
        [opening.x, opening.y + opening.width],
      ],
      opening.layer,
      false
    );

    // For doors, draw the swing arc indicator
    if (opening.type === "door") {
      out += drawDoorSwing(opening.x, opening.y, opening.width, true);
    }
  } else {
    out += lwpolyline(
      [
        [opening.x, opening.y],
        [opening.x + opening.width, opening.y],
      ],
      opening.layer,
      false
    );

    if (opening.type === "door") {
      out += drawDoorSwing(opening.x, opening.y, opening.width, false);
    }
  }

  // For windows, draw the double-line symbol
  if (opening.type === "window") {
    out += drawWindowSymbol(opening);
  }

  return out;
}

/**
 * Draw a simple door swing arc using line segments
 */
function drawDoorSwing(x: number, y: number, width: number, vertical: boolean): string {
  const segments = 8;
  const points: [number, number][] = [];
  const radius = width;

  for (let i = 0; i <= segments; i++) {
    const angle = (Math.PI / 2) * (i / segments);
    if (vertical) {
      points.push([
        x + radius * Math.cos(angle),
        y + radius * Math.sin(angle),
      ]);
    } else {
      points.push([
        x + radius * Math.sin(angle),
        y + radius * Math.cos(angle),
      ]);
    }
  }

  return lwpolyline(points, "DOORS", false);
}

/**
 * Draw window symbol (double line)
 */
function drawWindowSymbol(opening: PlacedOpening): string {
  const offset = 40; // mm offset for double line
  const isVertical = opening.angle === 90;

  if (isVertical) {
    return lwpolyline(
      [
        [opening.x + offset, opening.y],
        [opening.x + offset, opening.y + opening.width],
      ],
      "WINDOWS",
      false
    ) + lwpolyline(
      [
        [opening.x - offset, opening.y],
        [opening.x - offset, opening.y + opening.width],
      ],
      "WINDOWS",
      false
    );
  } else {
    return lwpolyline(
      [
        [opening.x, opening.y + offset],
        [opening.x + opening.width, opening.y + offset],
      ],
      "WINDOWS",
      false
    ) + lwpolyline(
      [
        [opening.x, opening.y - offset],
        [opening.x + opening.width, opening.y - offset],
      ],
      "WINDOWS",
      false
    );
  }
}

/**
 * Draw room name label
 */
function drawLabel(text: string, rect: Rect): string {
  const centerX = rect.x + rect.width / 2;
  const centerY = rect.y + rect.height / 2 + 100; // slightly above center

  return `0
TEXT
8
LABELS
10
${centerX.toFixed(1)}
20
${centerY.toFixed(1)}
30
0.0
40
200.0
1
${text}
72
1
11
${centerX.toFixed(1)}
21
${centerY.toFixed(1)}
31
0.0
`;
}

/**
 * Draw area label below room name
 */
function drawAreaLabel(areaSqft: number, rect: Rect): string {
  const centerX = rect.x + rect.width / 2;
  const centerY = rect.y + rect.height / 2 - 200; // below center

  return `0
TEXT
8
LABELS
10
${centerX.toFixed(1)}
20
${centerY.toFixed(1)}
30
0.0
40
150.0
1
${areaSqft.toFixed(1)} sq ft
72
1
11
${centerX.toFixed(1)}
21
${centerY.toFixed(1)}
31
0.0
`;
}

// ── DXF Primitive: LWPOLYLINE ──

function lwpolyline(
  points: [number, number][],
  layer: string,
  closed: boolean
): string {
  let out = `0
LWPOLYLINE
8
${layer}
90
${points.length}
70
${closed ? 1 : 0}
`;

  for (const [x, y] of points) {
    out += `10
${x.toFixed(1)}
20
${y.toFixed(1)}
`;
  }

  return out;
}

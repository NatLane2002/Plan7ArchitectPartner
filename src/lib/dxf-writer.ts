/**
 * DXF Writer for ArchDraft Universal
 *
 * Generates a properly layered DXF file with:
 * - EXTERIOR_WALLS layer (color 7 / white, 250mm thick polylines)
 * - INTERIOR_WALLS layer (color 8 / grey, 120mm thick polylines)
 * - DOORS layer (color 1 / red)
 * - WINDOWS layer (color 5 / blue)
 * - LABELS layer (color 3 / green)
 * - DIMENSIONS layer (color 6 / magenta)
 * - ROOM_FILLS layer (color 251 / light grey)
 *
 * All geometry uses LWPOLYLINE for maximum CAD compatibility.
 * Professional features: BLOCK definitions, XDATA metadata, HATCH patterns, DIMENSION entities.
 * Units: millimeters.
 */

import type { FloorPlanGeometry, Rect, WallSegment, PlacedOpening } from "./bsp-engine";
import { generateBlocksSection, insertBlock, generateXData, generateHatch, generateDimension } from "./dxf-blocks";

// ── DXF Color Constants (AutoCAD Color Index) ──
const COLORS = {
  EXTERIOR_WALLS: 7,  // White
  INTERIOR_WALLS: 8,  // Grey
  DOORS: 1,           // Red
  WINDOWS: 5,         // Blue
  LABELS: 3,          // Green
  DIMENSIONS: 6,      // Magenta
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
  { name: "DIMENSIONS", color: COLORS.DIMENSIONS, lineType: "CONTINUOUS" },
  { name: "ROOM_FILLS", color: COLORS.ROOM_FILL, lineType: "CONTINUOUS" },
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

  // BLOCKS section (door and window symbols)
  sections.push(generateBlocksSection());

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

  // APPID table (for XDATA)
  out += `0
TABLE
2
APPID
70
1
0
APPID
2
ARCHDRAFT
70
0
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
  // Now handled by dxf-blocks.ts
  return "";
}

// ── ENTITIES ──

function generateEntities(geometry: FloorPlanGeometry): string {
  let out = `0
SECTION
2
ENTITIES
`;

  // Multi-level handling: Use Z-axis elevation instead of horizontal spacing
  const getZ = (level: number) => (level - 1) * 3000; // 3000mm per level

  // 1. Draw room fills with hatch patterns
  for (const room of geometry.rooms) {
    const z = getZ(room.level);
    const boundaryPoints: [number, number][] = [
      [room.rect.x, room.rect.y],
      [room.rect.x + room.rect.width, room.rect.y],
      [room.rect.x + room.rect.width, room.rect.y + room.rect.height],
      [room.rect.x, room.rect.y + room.rect.height],
      [room.rect.x, room.rect.y], // Close the loop
    ];

    // Add subtle hatch fill
    out += generateHatch(boundaryPoints, "SOLID", "ROOM_FILLS", 251);
  }

  // 2. Draw each room boundary with XDATA metadata
  for (const room of geometry.rooms) {
    const z = getZ(room.level);
    out += drawRoomBoundaryWithMetadata(room, "INTERIOR_WALLS", z);
  }

  // 3. Draw walls as thick polylines
  for (const wall of geometry.walls) {
    const z = getZ(wall.level);
    out += drawWallLineWithZ(wall, z);
  }

  // 4. Draw openings using block inserts
  for (const opening of geometry.openings) {
    const z = getZ(opening.level);
    out += drawOpeningWithBlocks(opening, z);
  }

  // 5. Draw room labels
  for (const room of geometry.rooms) {
    const z = getZ(room.level);
    out += drawLabel(room.name, room.rect, z);
    out += drawAreaLabel(room.actual_area_sqft, room.rect, z);
  }

  // 6. Draw dimensions for major rooms
  for (const room of geometry.rooms) {
    const z = getZ(room.level);
    if (room.actual_area_sqft > 100) { // Only dimension larger rooms
      out += drawRoomDimensions(room.rect, z);
    }
  }

  out += `0
ENDSEC
`;
  return out;
}

/**
 * Draw room boundary with XDATA metadata
 */
function drawRoomBoundaryWithMetadata(room: any, layer: string, z: number): string {
  let out = lwpolylineWithZ(
    [
      [room.rect.x, room.rect.y],
      [room.rect.x + room.rect.width, room.rect.y],
      [room.rect.x + room.rect.width, room.rect.y + room.rect.height],
      [room.rect.x, room.rect.y + room.rect.height],
    ],
    layer,
    true,
    z
  );

  // Attach XDATA
  out += generateXData(room.id, room.name, room.actual_area_sqft, room.level);

  return out;
}

/**
 * Draw wall line with Z-axis elevation
 */
function drawWallLineWithZ(wall: WallSegment, z: number): string {
  const halfT = wall.thickness / 2;
  const isVertical = Math.abs(wall.x1 - wall.x2) < 1;

  let out = "";

  if (isVertical) {
    // Vertical wall — offset in X
    out += lwpolylineWithZ(
      [
        [wall.x1 - halfT, wall.y1],
        [wall.x1 - halfT, wall.y2],
      ],
      wall.layer,
      false,
      z
    );
    out += lwpolylineWithZ(
      [
        [wall.x1 + halfT, wall.y1],
        [wall.x1 + halfT, wall.y2],
      ],
      wall.layer,
      false,
      z
    );
  } else {
    // Horizontal wall — offset in Y
    out += lwpolylineWithZ(
      [
        [wall.x1, wall.y1 - halfT],
        [wall.x2, wall.y1 - halfT],
      ],
      wall.layer,
      false,
      z
    );
    out += lwpolylineWithZ(
      [
        [wall.x1, wall.y1 + halfT],
        [wall.x2, wall.y1 + halfT],
      ],
      wall.layer,
      false,
      z
    );
  }

  return out;
}

/**
 * Draw opening using block inserts
 */
function drawOpeningWithBlocks(opening: PlacedOpening, z: number): string {
  let out = "";
  const isVertical = opening.angle === 90;
  const rotation = isVertical ? 90 : 0;

  if (opening.type === "door" || opening.type === "sliding_door" || opening.type === "double_door") {
    // Use DOOR_SWING block
    out += insertBlock("DOOR_SWING", opening.x, opening.y, rotation, "DOORS");
  } else if (opening.type === "window") {
    // Use WINDOW_SINGLE or WINDOW_DOUBLE block
    const blockName = opening.width > 1500 ? "WINDOW_DOUBLE" : "WINDOW_SINGLE";
    out += insertBlock(blockName, opening.x, opening.y, rotation, "WINDOWS");
  } else {
    // Fallback to line drawing for other types
    if (isVertical) {
      out += lwpolylineWithZ(
        [
          [opening.x, opening.y],
          [opening.x, opening.y + opening.width],
        ],
        opening.layer,
        false,
        z
      );
    } else {
      out += lwpolylineWithZ(
        [
          [opening.x, opening.y],
          [opening.x + opening.width, opening.y],
        ],
        opening.layer,
        false,
        z
      );
    }
  }

  return out;
}

/**
 * Draw dimensions for a room
 */
function drawRoomDimensions(rect: Rect, z: number): string {
  let out = "";

  // Horizontal dimension (width)
  out += generateDimension(
    rect.x,
    rect.y,
    rect.x + rect.width,
    rect.y,
    -500, // Offset above
    "DIMENSIONS"
  );

  // Vertical dimension (height)
  out += generateDimension(
    rect.x,
    rect.y,
    rect.x,
    rect.y + rect.height,
    -500, // Offset to left
    "DIMENSIONS"
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
 * Draw room name label
 */
function drawLabel(text: string, rect: Rect, z: number = 0): string {
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
${z.toFixed(1)}
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
${z.toFixed(1)}
`;
}

/**
 * Draw area label below room name
 */
function drawAreaLabel(areaSqft: number, rect: Rect, z: number = 0): string {
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
${z.toFixed(1)}
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
${z.toFixed(1)}
`;
}

// ── DXF Primitive: LWPOLYLINE with Z-axis support ──

function lwpolylineWithZ(
  points: [number, number][],
  layer: string,
  closed: boolean,
  z: number = 0
): string {
  let out = `0
LWPOLYLINE
8
${layer}
38
${z.toFixed(1)}
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

// ── DXF Primitive: LWPOLYLINE ──

function lwpolyline(
  points: [number, number][],
  layer: string,
  closed: boolean
): string {
  return lwpolylineWithZ(points, layer, closed, 0);
}

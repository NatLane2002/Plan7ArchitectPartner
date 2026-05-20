/**
 * DXF Block Definitions for ArchDraft Universal
 * 
 * Reusable CAD symbol blocks for professional-grade DXF output.
 * Blocks are defined once and instantiated multiple times via INSERT entities.
 */

/**
 * Generate the BLOCKS section with reusable door and window symbols.
 */
export function generateBlocksSection(): string {
  let out = `0
SECTION
2
BLOCKS
`;

  // ── DOOR_SWING Block ──
  out += `0
BLOCK
8
0
2
DOOR_SWING
70
0
10
0.0
20
0.0
30
0.0
`;

  // Door swing arc (90-degree arc from origin)
  // Represented as polyline segments for maximum compatibility
  const arcSegments = 12;
  const arcPoints: [number, number][] = [];
  for (let i = 0; i <= arcSegments; i++) {
    const angle = (Math.PI / 2) * (i / arcSegments);
    arcPoints.push([
      900 * Math.cos(angle), // 900mm radius (standard door width)
      900 * Math.sin(angle),
    ]);
  }

  out += `0
LWPOLYLINE
8
DOORS
90
${arcPoints.length}
70
0
`;
  for (const [x, y] of arcPoints) {
    out += `10
${x.toFixed(1)}
20
${y.toFixed(1)}
`;
  }

  // Door leaf line (from origin to arc end)
  out += `0
LINE
8
DOORS
10
0.0
20
0.0
30
0.0
11
${arcPoints[arcPoints.length - 1][0].toFixed(1)}
21
${arcPoints[arcPoints.length - 1][1].toFixed(1)}
31
0.0
`;

  out += `0
ENDBLK
8
0
`;

  // ── WINDOW_SINGLE Block ──
  out += `0
BLOCK
8
0
2
WINDOW_SINGLE
70
0
10
0.0
20
0.0
30
0.0
`;

  // Window represented as two parallel lines (double-line symbol)
  out += `0
LINE
8
WINDOWS
10
0.0
20
-40.0
30
0.0
11
1200.0
21
-40.0
31
0.0
0
LINE
8
WINDOWS
10
0.0
20
40.0
30
0.0
11
1200.0
21
40.0
31
0.0
`;

  out += `0
ENDBLK
8
0
`;

  // ── WINDOW_DOUBLE Block (wider) ──
  out += `0
BLOCK
8
0
2
WINDOW_DOUBLE
70
0
10
0.0
20
0.0
30
0.0
`;

  out += `0
LINE
8
WINDOWS
10
0.0
20
-40.0
30
0.0
11
1800.0
21
-40.0
31
0.0
0
LINE
8
WINDOWS
10
0.0
20
40.0
30
0.0
11
1800.0
21
40.0
31
0.0
`;

  out += `0
ENDBLK
8
0
`;

  out += `0
ENDSEC
`;
  return out;
}

/**
 * Generate an INSERT entity for a block at a specific position and rotation.
 */
export function insertBlock(
  blockName: string,
  x: number,
  y: number,
  rotation: number = 0,
  layer: string = "0"
): string {
  return `0
INSERT
8
${layer}
2
${blockName}
10
${x.toFixed(1)}
20
${y.toFixed(1)}
30
0.0
50
${rotation.toFixed(1)}
`;
}

/**
 * Generate XDATA (Extended Entity Data) for a room.
 * Requires APPID registration in TABLES section.
 */
export function generateXData(
  roomId: string,
  roomName: string,
  areaSqft: number,
  level: number
): string {
  return `1001
ARCHDRAFT
1000
ROOM_ID:${roomId}
1000
ROOM_NAME:${roomName}
1040
${areaSqft.toFixed(2)}
1070
${level}
`;
}

/**
 * Generate HATCH entity for room fill patterns.
 */
export function generateHatch(
  boundaryPoints: [number, number][],
  patternName: string = "SOLID",
  layer: string = "ROOM_FILLS",
  color: number = 251
): string {
  let out = `0
HATCH
8
${layer}
62
${color}
70
1
71
0
91
1
92
7
72
1
73
1
93
${boundaryPoints.length}
`;

  for (const [x, y] of boundaryPoints) {
    out += `10
${x.toFixed(1)}
20
${y.toFixed(1)}
`;
  }

  out += `97
0
75
1
76
1
2
${patternName}
`;

  if (patternName !== "SOLID") {
    out += `41
1.0
77
0
78
0
`;
  }

  return out;
}

/**
 * Generate DIMENSION entity for room measurements.
 */
export function generateDimension(
  x1: number,
  y1: number,
  x2: number,
  y2: number,
  offsetDistance: number = 500,
  layer: string = "DIMENSIONS"
): string {
  const isHorizontal = Math.abs(y1 - y2) < 1;
  const midX = (x1 + x2) / 2;
  const midY = (y1 + y2) / 2;

  return `0
DIMENSION
8
${layer}
2
*D
10
${midX.toFixed(1)}
20
${(isHorizontal ? midY + offsetDistance : midY).toFixed(1)}
30
0.0
11
${(isHorizontal ? midX : x1 - offsetDistance).toFixed(1)}
21
${(isHorizontal ? y1 + offsetDistance : midY).toFixed(1)}
31
0.0
13
${x1.toFixed(1)}
23
${y1.toFixed(1)}
33
0.0
14
${x2.toFixed(1)}
24
${y2.toFixed(1)}
34
0.0
70
${isHorizontal ? 0 : 1}
`;
}

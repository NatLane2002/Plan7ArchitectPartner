/**
 * DXF Writer for ArchDraft Universal
 *
 * Produces a fully spec-compliant AC1015 (AutoCAD 2000) DXF file.
 *
 * KEY FIX: Every entity and table record now includes the required AC1015
 * subclass markers (group code 100). Without these, strict parsers such as
 * Plan7Architect abort the ENTITIES section and display a completely blank
 * drawing on import.
 *
 * PLAN7ARCHITECT WORKFLOW:
 * The DXF imports as a 2D reference drawing. The user traces over it with
 * Plan7Architect's wall/door/window tools to build the native 3D model.
 * The drawing is optimised for this workflow:
 *   - Closed LWPOLYLINE wall outlines (full thickness) for snap targets
 *   - Dashed centerlines on A-WALL-CNTR for wall placement reference
 *   - LINE openings on typed layers (A-DOOR, A-GLAZ, A-DOOR-GAR, etc.)
 *   - Room labels and dimension lines for spatial reference
 *   - All geometry at Z=0; multi-story floors offset horizontally
 *
 * Units: millimeters ($INSUNITS = 4).
 */

import type { FloorPlanGeometry, Rect, WallSegment, PlacedOpening, PlacedRoom } from "./bsp-engine";
import { dxfLine, dxfLwpolyline, dxfText, generateHatch, generateDimension } from "./dxf-blocks";

// ── AutoCAD Color Index (ACI) ──────────────────────────────────────────────
const ACI = {
  WHITE:   7,
  GREY:    8,
  RED:     1,
  YELLOW:  2,
  GREEN:   3,
  CYAN:    4,
  BLUE:    5,
  MAGENTA: 6,
  LTGREY:  251,
} as const;

// ── Layer table ────────────────────────────────────────────────────────────
interface LayerDef { name: string; color: number; lineType: string; }

const LAYERS: LayerDef[] = [
  { name: "A-WALL-EXTR", color: ACI.WHITE,   lineType: "CONTINUOUS" },
  { name: "A-WALL-INTR", color: ACI.GREY,    lineType: "CONTINUOUS" },
  { name: "A-WALL-CNTR", color: ACI.CYAN,    lineType: "DASHED"     },
  { name: "A-DOOR",      color: ACI.RED,     lineType: "CONTINUOUS" },
  { name: "A-DOOR-DBL",  color: ACI.MAGENTA, lineType: "CONTINUOUS" },
  { name: "A-DOOR-GAR",  color: ACI.YELLOW,  lineType: "CONTINUOUS" },
  { name: "A-GLAZ",      color: ACI.BLUE,    lineType: "DASHED"     },
  { name: "A-ROOM",      color: ACI.LTGREY,  lineType: "CONTINUOUS" },
  { name: "A-TEXT",      color: ACI.GREEN,   lineType: "CONTINUOUS" },
  { name: "A-DIMS",      color: ACI.CYAN,    lineType: "CONTINUOUS" },
];

function openingLayer(type: string): string {
  if (type === "window")      return "A-GLAZ";
  if (type === "garage_door") return "A-DOOR-GAR";
  if (type === "double_door") return "A-DOOR-DBL";
  return "A-DOOR";
}

function wallLayer(seg: WallSegment): string {
  return seg.layer === "EXTERIOR_WALLS" ? "A-WALL-EXTR" : "A-WALL-INTR";
}

// ═══════════════════════════════════════════════════════════════════════════
// PUBLIC API
// ═══════════════════════════════════════════════════════════════════════════

export function generateDXFPerLevel(geometry: FloorPlanGeometry): Map<number, string> {
  const levels = [...new Set(geometry.rooms.map(r => r.level))].sort();
  const result = new Map<number, string>();
  for (const level of levels) {
    result.set(level, buildDXF({
      ...geometry,
      rooms:    geometry.rooms.filter(r => r.level === level),
      walls:    geometry.walls.filter(w => w.level === level),
      openings: geometry.openings.filter(o => o.level === level),
    }));
  }
  return result;
}

export function generateDXF(geometry: FloorPlanGeometry): string {
  const levels = [...new Set(geometry.rooms.map(r => r.level))].sort();
  if (levels.length === 1) return buildDXF(geometry);

  const gap     = 5000;
  const offsetX = geometry.footprint.width + gap;

  const flatRooms: PlacedRoom[] = geometry.rooms.map(r => ({
    ...r,
    rect: { ...r.rect, x: r.rect.x + (r.level - 1) * offsetX },
    level: 1,
  }));
  const flatWalls: WallSegment[] = geometry.walls.map(w => ({
    ...w,
    x1: w.x1 + (w.level - 1) * offsetX,
    x2: w.x2 + (w.level - 1) * offsetX,
    level: 1,
  }));
  const flatOpenings: PlacedOpening[] = geometry.openings.map(o => ({
    ...o,
    x: o.x + (o.level - 1) * offsetX,
    level: 1,
  }));

  const levelTitles = levels.map(level => ({
    label: `LEVEL ${level}`,
    x: (level - 1) * offsetX + geometry.footprint.width / 2,
    y: -1500,
  }));

  return buildDXF(
    {
      ...geometry,
      footprint: { ...geometry.footprint, width: geometry.footprint.width * levels.length + gap * (levels.length - 1) },
      rooms: flatRooms,
      walls: flatWalls,
      openings: flatOpenings,
    },
    levelTitles
  );
}

// ═══════════════════════════════════════════════════════════════════════════
// INTERNAL BUILDER
// ═══════════════════════════════════════════════════════════════════════════

function buildDXF(
  geometry: FloorPlanGeometry,
  levelTitles?: Array<{ label: string; x: number; y: number }>
): string {
  return [
    buildHeader(geometry),
    buildTables(),
    buildBlocks(),
    buildEntities(geometry, levelTitles),
    "0\nEOF\n",
  ].join("");
}

// ── HEADER ─────────────────────────────────────────────────────────────────

function buildHeader(geometry: FloorPlanGeometry): string {
  const { footprint } = geometry;
  const margin = 2000;
  const xMin = (-margin).toFixed(2);
  const yMin = (-margin).toFixed(2);
  const xMax = (footprint.width  + margin).toFixed(2);
  const yMax = (footprint.height + margin).toFixed(2);

  return (
    `0\nSECTION\n2\nHEADER\n` +
    `9\n$ACADVER\n1\nAC1015\n` +
    `9\n$DWGCODEPAGE\n3\nANSI_1252\n` +
    `9\n$INSUNITS\n70\n4\n` +          // 4 = millimeters
    `9\n$MEASUREMENT\n70\n1\n` +        // 1 = metric
    `9\n$LUNITS\n70\n2\n` +             // 2 = decimal
    `9\n$LUPREC\n70\n0\n` +
    `9\n$AUNITS\n70\n0\n` +
    `9\n$AUPREC\n70\n0\n` +
    `9\n$LTSCALE\n40\n1000.0\n` +
    `9\n$DIMSCALE\n40\n1.0\n` +
    `9\n$DIMASZ\n40\n250.0\n` +
    `9\n$DIMTXT\n40\n200.0\n` +
    `9\n$EXTMIN\n10\n${xMin}\n20\n${yMin}\n30\n0.0\n` +
    `9\n$EXTMAX\n10\n${xMax}\n20\n${yMax}\n30\n0.0\n` +
    `9\n$LIMMIN\n10\n${xMin}\n20\n${yMin}\n` +
    `9\n$LIMMAX\n10\n${xMax}\n20\n${yMax}\n` +
    `9\n$CLAYER\n8\n0\n` +
    `9\n$CELTYPE\n6\nBYLAYER\n` +
    `9\n$CECOLOR\n62\n256\n` +          // 256 = BYLAYER
    `0\nENDSEC\n`
  );
}

// ── TABLES ─────────────────────────────────────────────────────────────────
// Every table entry requires:
//   100  AcDbSymbolTableRecord
//   100  AcDb<SpecificRecord>

function buildTables(): string {
  let out = `0\nSECTION\n2\nTABLES\n`;

  // ── VPORT ──
  out += `0\nTABLE\n100\nAcDbSymbolTable\n2\nVPORT\n70\n1\n`;
  out +=
    `0\nVPORT\n` +
    `100\nAcDbSymbolTableRecord\n` +
    `100\nAcDbViewportTableRecord\n` +
    `2\n*ACTIVE\n70\n0\n` +
    `10\n0.0\n20\n0.0\n` +   // lower-left corner
    `11\n1.0\n21\n1.0\n` +   // upper-right corner
    `12\n0.0\n22\n0.0\n` +   // view center
    `13\n0.0\n23\n0.0\n` +   // snap base
    `14\n10.0\n24\n10.0\n` + // snap spacing
    `15\n10.0\n25\n10.0\n` + // grid spacing
    `16\n0.0\n26\n0.0\n36\n1.0\n` + // view direction
    `17\n0.0\n27\n0.0\n37\n0.0\n` + // view target
    `40\n1.0\n` +   // view height
    `41\n1.0\n` +   // viewport aspect ratio
    `42\n50.0\n` +  // lens length
    `43\n0.0\n44\n0.0\n` +
    `50\n0.0\n51\n0.0\n` +
    `71\n0\n72\n1000\n73\n1\n74\n3\n75\n0\n76\n0\n77\n0\n78\n0\n`;
  out += `0\nENDTAB\n`;

  // ── LTYPE ──
  out += `0\nTABLE\n100\nAcDbSymbolTable\n2\nLTYPE\n70\n3\n`;
  // BYLAYER
  out +=
    `0\nLTYPE\n100\nAcDbSymbolTableRecord\n100\nAcDbLinetypeTableRecord\n` +
    `2\nBYLAYER\n70\n0\n3\n\n72\n65\n73\n0\n40\n0.0\n`;
  // CONTINUOUS
  out +=
    `0\nLTYPE\n100\nAcDbSymbolTableRecord\n100\nAcDbLinetypeTableRecord\n` +
    `2\nCONTINUOUS\n70\n0\n3\nSolid line\n72\n65\n73\n0\n40\n0.0\n`;
  // DASHED  (800mm dash, 400mm gap — readable at mm scale)
  out +=
    `0\nLTYPE\n100\nAcDbSymbolTableRecord\n100\nAcDbLinetypeTableRecord\n` +
    `2\nDASHED\n70\n0\n3\nDashed __ __ __\n72\n65\n73\n2\n40\n1200.0\n` +
    `49\n800.0\n74\n0\n49\n-400.0\n74\n0\n`;
  out += `0\nENDTAB\n`;

  // ── LAYER ──
  out += `0\nTABLE\n100\nAcDbSymbolTable\n2\nLAYER\n70\n${LAYERS.length + 1}\n`;
  // Layer 0 (required)
  out +=
    `0\nLAYER\n100\nAcDbSymbolTableRecord\n100\nAcDbLayerTableRecord\n` +
    `2\n0\n70\n0\n62\n7\n6\nCONTINUOUS\n`;
  for (const layer of LAYERS) {
    out +=
      `0\nLAYER\n100\nAcDbSymbolTableRecord\n100\nAcDbLayerTableRecord\n` +
      `2\n${layer.name}\n70\n0\n62\n${layer.color}\n6\n${layer.lineType}\n`;
  }
  out += `0\nENDTAB\n`;

  // ── STYLE ──
  out += `0\nTABLE\n100\nAcDbSymbolTable\n2\nSTYLE\n70\n1\n`;
  out +=
    `0\nSTYLE\n100\nAcDbSymbolTableRecord\n100\nAcDbTextStyleTableRecord\n` +
    `2\nSTANDARD\n70\n0\n40\n0.0\n41\n1.0\n50\n0.0\n71\n0\n42\n250.0\n3\ntxt\n4\n\n`;
  out += `0\nENDTAB\n`;

  // ── VIEW ──
  out += `0\nTABLE\n100\nAcDbSymbolTable\n2\nVIEW\n70\n0\n0\nENDTAB\n`;

  // ── UCS ──
  out += `0\nTABLE\n100\nAcDbSymbolTable\n2\nUCS\n70\n0\n0\nENDTAB\n`;

  // ── APPID ──
  out += `0\nTABLE\n100\nAcDbSymbolTable\n2\nAPPID\n70\n1\n`;
  out +=
    `0\nAPPID\n100\nAcDbSymbolTableRecord\n100\nAcDbRegAppTableRecord\n` +
    `2\nACCAD\n70\n0\n`;
  out += `0\nENDTAB\n`;

  // ── DIMSTYLE ──
  out += `0\nTABLE\n100\nAcDbSymbolTable\n2\nDIMSTYLE\n70\n1\n`;
  out +=
    `0\nDIMSTYLE\n100\nAcDbSymbolTableRecord\n100\nAcDbDimStyleTableRecord\n` +
    `2\nSTANDARD\n70\n0\n` +
    `3\n\n4\n\n5\n\n6\n\n7\n\n` +
    `40\n1.0\n41\n2.5\n42\n0.625\n43\n3.75\n44\n1.25\n` +
    `140\n2.5\n141\n0.09\n143\n25.4\n144\n1.0\n146\n1.0\n147\n0.625\n` +
    `71\n0\n72\n0\n73\n0\n74\n0\n75\n0\n76\n0\n77\n0\n78\n0\n` +
    `170\n0\n171\n2\n172\n0\n173\n0\n174\n0\n175\n0\n176\n0\n177\n0\n178\n0\n`;
  out += `0\nENDTAB\n`;

  // ── BLOCK_RECORD ──
  out += `0\nTABLE\n100\nAcDbSymbolTable\n2\nBLOCK_RECORD\n70\n2\n`;
  out +=
    `0\nBLOCK_RECORD\n100\nAcDbSymbolTableRecord\n100\nAcDbBlockTableRecord\n` +
    `2\n*MODEL_SPACE\n`;
  out +=
    `0\nBLOCK_RECORD\n100\nAcDbSymbolTableRecord\n100\nAcDbBlockTableRecord\n` +
    `2\n*PAPER_SPACE\n`;
  out += `0\nENDTAB\n`;

  out += `0\nENDSEC\n`;
  return out;
}

// ── BLOCKS ─────────────────────────────────────────────────────────────────
// AC1015 requires *MODEL_SPACE and *PAPER_SPACE block definitions.
// BLOCK/ENDBLK also need subclass markers.

function buildBlocks(): string {
  let out = `0\nSECTION\n2\nBLOCKS\n`;

  // *MODEL_SPACE
  out +=
    `0\nBLOCK\n` +
    `100\nAcDbEntity\n8\n0\n` +
    `100\nAcDbBlockBegin\n` +
    `2\n*MODEL_SPACE\n70\n0\n` +
    `10\n0.0\n20\n0.0\n30\n0.0\n` +
    `3\n*MODEL_SPACE\n1\n\n`;
  out += `0\nENDBLK\n100\nAcDbEntity\n8\n0\n100\nAcDbBlockEnd\n`;

  // *PAPER_SPACE
  out +=
    `0\nBLOCK\n` +
    `100\nAcDbEntity\n8\n0\n` +
    `100\nAcDbBlockBegin\n` +
    `2\n*PAPER_SPACE\n70\n0\n` +
    `10\n0.0\n20\n0.0\n30\n0.0\n` +
    `3\n*PAPER_SPACE\n1\n\n`;
  out += `0\nENDBLK\n100\nAcDbEntity\n8\n0\n100\nAcDbBlockEnd\n`;

  out += `0\nENDSEC\n`;
  return out;
}

// ── ENTITIES ───────────────────────────────────────────────────────────────

function buildEntities(
  geometry: FloorPlanGeometry,
  levelTitles?: Array<{ label: string; x: number; y: number }>
): string {
  let out = `0\nSECTION\n2\nENTITIES\n`;

  // 1. Room fills
  for (const room of geometry.rooms) {
    out += buildRoomHatch(room);
  }

  // 2. Wall outlines (closed LWPOLYLINE — primary snap target)
  for (const wall of geometry.walls) {
    out += buildWallOutline(wall);
  }

  // 3. Wall centerlines (dashed — tracing reference)
  for (const wall of geometry.walls) {
    out += dxfLine(wall.x1, wall.y1, wall.x2, wall.y2, "A-WALL-CNTR");
  }

  // 4. Openings (LINE segments — door/window snap targets)
  for (const opening of geometry.openings) {
    out += buildOpening(opening);
  }

  // 5. Room labels
  for (const room of geometry.rooms) {
    const cx = room.rect.x + room.rect.width  / 2;
    const cy = room.rect.y + room.rect.height / 2;
    out += dxfText(room.name, cx, cy + 150, 200, "A-TEXT");
    out += dxfText(`${room.actual_area_sqft.toFixed(0)} sq ft`, cx, cy - 200, 150, "A-TEXT");
  }

  // 6. Dimension lines (rooms ≥ 50 sqft)
  for (const room of geometry.rooms) {
    if (room.actual_area_sqft >= 50) {
      out += generateDimension(
        room.rect.x, room.rect.y,
        room.rect.x + room.rect.width, room.rect.y,
        -600, "A-DIMS"
      );
      out += generateDimension(
        room.rect.x, room.rect.y,
        room.rect.x, room.rect.y + room.rect.height,
        -600, "A-DIMS"
      );
    }
  }

  // 7. Level titles (multi-story)
  if (levelTitles) {
    for (const t of levelTitles) {
      out += dxfText(t.label, t.x, t.y, 500, "A-TEXT");
    }
  }

  out += `0\nENDSEC\n`;
  return out;
}

// ── Wall outline ────────────────────────────────────────────────────────────

function buildWallOutline(wall: WallSegment): string {
  const halfT = wall.thickness / 2;
  const layer = wallLayer(wall);
  const isVertical = Math.abs(wall.x1 - wall.x2) < 1;

  let pts: [number, number][];
  if (isVertical) {
    const yMin = Math.min(wall.y1, wall.y2);
    const yMax = Math.max(wall.y1, wall.y2);
    pts = [
      [wall.x1 - halfT, yMin],
      [wall.x1 + halfT, yMin],
      [wall.x1 + halfT, yMax],
      [wall.x1 - halfT, yMax],
    ];
  } else {
    const xMin = Math.min(wall.x1, wall.x2);
    const xMax = Math.max(wall.x1, wall.x2);
    pts = [
      [xMin, wall.y1 - halfT],
      [xMax, wall.y1 - halfT],
      [xMax, wall.y1 + halfT],
      [xMin, wall.y1 + halfT],
    ];
  }

  return dxfLwpolyline(pts, layer, true);
}

// ── Opening ─────────────────────────────────────────────────────────────────

function buildOpening(opening: PlacedOpening): string {
  const layer = openingLayer(opening.type);
  if (opening.angle === 90) {
    return dxfLine(opening.x, opening.y, opening.x, opening.y + opening.width, layer);
  }
  return dxfLine(opening.x, opening.y, opening.x + opening.width, opening.y, layer);
}

// ── Room hatch ──────────────────────────────────────────────────────────────

function buildRoomHatch(room: PlacedRoom): string {
  const pts: [number, number][] = [
    [room.rect.x,                    room.rect.y],
    [room.rect.x + room.rect.width,  room.rect.y],
    [room.rect.x + room.rect.width,  room.rect.y + room.rect.height],
    [room.rect.x,                    room.rect.y + room.rect.height],
  ];
  return generateHatch(pts, "SOLID", "A-ROOM", ACI.LTGREY);
}

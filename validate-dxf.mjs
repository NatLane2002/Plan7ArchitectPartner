/**
 * DXF Validation Script
 * Generates a real DXF from a minimal floor plan and validates its structure.
 */

import { execSync } from 'child_process';
import { writeFileSync, readFileSync } from 'fs';

// Write a tiny TS runner script
const runner = `
import { generateDXF } from './src/lib/dxf-writer';
import type { FloorPlanGeometry } from './src/lib/bsp-engine';

const geometry: FloorPlanGeometry = {
  footprint: { x: 0, y: 0, width: 9144, height: 6096 },
  rooms: [
    {
      id: 'living_room',
      name: 'Living Room',
      rect: { x: 0, y: 0, width: 4572, height: 6096 },
      level: 1,
      target_area_sqft: 300,
      actual_area_sqft: 300,
    },
    {
      id: 'bedroom',
      name: 'Bedroom',
      rect: { x: 4572, y: 0, width: 4572, height: 6096 },
      level: 1,
      target_area_sqft: 300,
      actual_area_sqft: 300,
    },
  ],
  walls: [
    { x1: 0, y1: 0, x2: 9144, y2: 0, thickness: 250, level: 1, layer: 'EXTERIOR_WALLS' },
    { x1: 0, y1: 6096, x2: 9144, y2: 6096, thickness: 250, level: 1, layer: 'EXTERIOR_WALLS' },
    { x1: 0, y1: 0, x2: 0, y2: 6096, thickness: 250, level: 1, layer: 'EXTERIOR_WALLS' },
    { x1: 9144, y1: 0, x2: 9144, y2: 6096, thickness: 250, level: 1, layer: 'EXTERIOR_WALLS' },
    { x1: 4572, y1: 0, x2: 4572, y2: 6096, thickness: 120, level: 1, layer: 'INTERIOR_WALLS' },
  ],
  openings: [
    { type: 'door', x: 4572, y: 2500, width: 900, height: 2100, angle: 90, level: 1, layer: 'DOORS', room1: 'living_room', room2: 'bedroom' },
    { type: 'window', x: 1000, y: 0, width: 1200, height: 1200, angle: 0, level: 1, layer: 'WINDOWS', room1: 'living_room', room2: 'exterior' },
    { type: 'garage_door', x: 5500, y: 0, width: 2400, height: 2100, angle: 0, level: 1, layer: 'GARAGE_DOORS', room1: 'bedroom', room2: 'exterior' },
  ],
  exterior_wall_thickness: 250,
  interior_wall_thickness: 120,
};

const dxf = generateDXF(geometry);
process.stdout.write(dxf);
`;

writeFileSync('_dxf_test_runner.ts', runner);

try {
  const dxf = execSync(
    'npx ts-node --project tsconfig.json _dxf_test_runner.ts',
    { cwd: process.cwd(), timeout: 30000 }
  ).toString();

  writeFileSync('_test_output.dxf', dxf);
  console.log(`\nDXF generated: ${dxf.length} bytes\n`);

  // ── Structural validation ──
  const lines = dxf.split('\n').map(l => l.trim());
  const errors = [];
  const warnings = [];
  const checks = [];

  // 1. Starts with 0 / SECTION
  if (lines[0] === '0' && lines[1] === 'SECTION') {
    checks.push('✓ Starts with 0/SECTION');
  } else {
    errors.push('✗ Does NOT start with 0/SECTION');
  }

  // 2. Ends with 0 / EOF
  const lastLines = lines.filter(l => l.length > 0).slice(-2);
  if (lastLines[0] === '0' && lastLines[1] === 'EOF') {
    checks.push('✓ Ends with 0/EOF');
  } else {
    errors.push(`✗ Does NOT end with 0/EOF — last lines: ${JSON.stringify(lastLines)}`);
  }

  // 3. Required sections present
  for (const section of ['HEADER', 'TABLES', 'BLOCKS', 'ENTITIES']) {
    if (dxf.includes(`\n2\n${section}\n`)) {
      checks.push(`✓ Section ${section} present`);
    } else {
      errors.push(`✗ Section ${section} MISSING`);
    }
  }

  // 4. AC1015 version
  if (dxf.includes('AC1015')) {
    checks.push('✓ AC1015 version declared');
  } else {
    errors.push('✗ AC1015 version MISSING');
  }

  // 5. Subclass markers on entities
  const entityTypes = ['LINE', 'LWPOLYLINE', 'TEXT', 'HATCH', 'DIMENSION'];
  for (const etype of entityTypes) {
    const idx = dxf.indexOf(`\n0\n${etype}\n`);
    if (idx === -1) {
      warnings.push(`⚠ Entity type ${etype} not found in output`);
      continue;
    }
    // Check that AcDbEntity appears within 200 chars after the entity type
    const snippet = dxf.substring(idx, idx + 200);
    if (snippet.includes('AcDbEntity')) {
      checks.push(`✓ ${etype} has AcDbEntity subclass marker`);
    } else {
      errors.push(`✗ ${etype} is MISSING AcDbEntity subclass marker`);
    }
  }

  // 6. HATCH-specific: check for AcDbHatch
  if (dxf.includes('AcDbHatch')) {
    checks.push('✓ HATCH has AcDbHatch subclass marker');
  } else {
    errors.push('✗ HATCH missing AcDbHatch subclass marker');
  }

  // 7. LWPOLYLINE-specific: check for AcDbPolyline
  if (dxf.includes('AcDbPolyline')) {
    checks.push('✓ LWPOLYLINE has AcDbPolyline subclass marker');
  } else {
    errors.push('✗ LWPOLYLINE missing AcDbPolyline subclass marker');
  }

  // 8. Layer table entries
  const layerNames = ['A-WALL-EXTR', 'A-WALL-INTR', 'A-WALL-CNTR', 'A-DOOR', 'A-DOOR-GAR', 'A-GLAZ'];
  for (const ln of layerNames) {
    if (dxf.includes(ln)) {
      checks.push(`✓ Layer ${ln} defined`);
    } else {
      errors.push(`✗ Layer ${ln} MISSING`);
    }
  }

  // 9. MODEL_SPACE block
  if (dxf.includes('*MODEL_SPACE')) {
    checks.push('✓ *MODEL_SPACE block present');
  } else {
    errors.push('✗ *MODEL_SPACE block MISSING');
  }

  // 10. INSUNITS = 4 (millimeters)
  if (dxf.includes('$INSUNITS') && dxf.includes('\n4\n')) {
    checks.push('✓ $INSUNITS present');
  } else {
    warnings.push('⚠ $INSUNITS may not be set to 4');
  }

  // 11. No invalid *D block reference
  if (dxf.includes('\n2\n*D\n')) {
    errors.push('✗ Invalid *D block reference found in DIMENSION entity');
  } else {
    checks.push('✓ No invalid *D block reference');
  }

  // 12. HATCH boundary path type = 2 (polyline), not 7
  const hatchIdx = dxf.indexOf('AcDbHatch');
  if (hatchIdx !== -1) {
    const hatchSnippet = dxf.substring(hatchIdx, hatchIdx + 500);
    if (hatchSnippet.includes('\n92\n2\n')) {
      checks.push('✓ HATCH boundary path type = 2 (polyline, correct)');
    } else if (hatchSnippet.includes('\n92\n7\n')) {
      errors.push('✗ HATCH boundary path type = 7 (INVALID — causes parser failure)');
    } else {
      warnings.push('⚠ HATCH boundary path type could not be verified');
    }
  }

  // 13. AcDbLayerTableRecord present
  if (dxf.includes('AcDbLayerTableRecord')) {
    checks.push('✓ Layer table records have AcDbLayerTableRecord subclass');
  } else {
    errors.push('✗ Layer table records MISSING AcDbLayerTableRecord subclass');
  }

  // 14. BLOCK definitions have subclass markers
  if (dxf.includes('AcDbBlockBegin')) {
    checks.push('✓ BLOCK definitions have AcDbBlockBegin subclass');
  } else {
    errors.push('✗ BLOCK definitions MISSING AcDbBlockBegin subclass');
  }

  // 15. Count entities in ENTITIES section
  const entitiesSection = dxf.split('2\nENTITIES\n')[1]?.split('0\nENDSEC\n')[0] || '';
  const lineCount = (entitiesSection.match(/\n0\nLINE\n/g) || []).length;
  const polyCount = (entitiesSection.match(/\n0\nLWPOLYLINE\n/g) || []).length;
  const textCount = (entitiesSection.match(/\n0\nTEXT\n/g) || []).length;
  const hatchCount = (entitiesSection.match(/\n0\nHATCH\n/g) || []).length;
  checks.push(`✓ ENTITIES section: ${lineCount} LINE, ${polyCount} LWPOLYLINE, ${textCount} TEXT, ${hatchCount} HATCH`);

  // ── Report ──
  console.log('═══════════════════════════════════════════════');
  console.log('DXF VALIDATION REPORT');
  console.log('═══════════════════════════════════════════════');
  checks.forEach(c => console.log(c));
  if (warnings.length) {
    console.log('\nWARNINGS:');
    warnings.forEach(w => console.log(w));
  }
  if (errors.length) {
    console.log('\nERRORS:');
    errors.forEach(e => console.log(e));
    console.log(`\n✗ FAILED — ${errors.length} error(s) found`);
  } else {
    console.log(`\n✓ ALL CHECKS PASSED — DXF is structurally valid`);
  }

} catch (err) {
  console.error('Generation failed:', err.message);
  if (err.stdout) console.log('stdout:', err.stdout.toString());
  if (err.stderr) console.log('stderr:', err.stderr.toString());
} finally {
  // Cleanup temp files
  try { execSync('del _dxf_test_runner.ts', { cwd: process.cwd() }); } catch {}
}

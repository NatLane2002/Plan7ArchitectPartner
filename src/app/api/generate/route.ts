import { NextRequest, NextResponse } from "next/server";
import { FloorPlanSchema } from "@/lib/schemas";
import { generateFloorPlanGeometry } from "@/lib/bsp-engine";
import { generateDXF } from "@/lib/dxf-writer";
import { generateSVGPreview } from "@/lib/svg-preview";
import { formatValidationErrors } from "@/lib/validators";

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();

    // Determine if this is a preview request or DXF download
    const isPreview = body._preview === true;
    delete body._preview;

    // Phase 2: Validate the Gemini JSON input directly
    const parseResult = FloorPlanSchema.safeParse(body);
    if (!parseResult.success) {
      const zodErrors = parseResult.error.flatten();
      const formattedErrors = parseResult.error.errors.map(e => `${e.path.join('.')}: ${e.message}`).join('\n');
      
      return NextResponse.json(
        {
          error: "Validation failed on AI JSON output",
          message: formattedErrors || "The floor plan contains structural or geometric errors.",
          details: zodErrors.fieldErrors,
        },
        { status: 400 }
      );
    }

    const floorPlan = parseResult.data;

    // Phase 3: Generate geometry via BSP engine
    const geometry = generateFloorPlanGeometry(floorPlan);

    if (isPreview) {
      // Return SVG preview + metadata
      const svgPreview = generateSVGPreview(geometry, 700, 460);

      return NextResponse.json({
        success: true,
        preview: svgPreview,
        metadata: {
          project_title: floorPlan.project_title,
          architectural_style: floorPlan.architectural_style,
          footprint: {
            width_mm: geometry.footprint.width,
            length_mm: geometry.footprint.height,
            width_ft: (geometry.footprint.width / 304.8).toFixed(1),
            length_ft: (geometry.footprint.height / 304.8).toFixed(1),
            total_sqft: floorPlan.footprint_dimensions.total_area_sqft_calculated,
          },
          room_count: geometry.rooms.length,
          rooms: geometry.rooms.map((r) => ({
            name: r.name,
            target_sqft: r.target_area_sqft,
            actual_sqft: Math.round(r.actual_area_sqft),
            level: r.level || 1,
          })),
          wall_count: geometry.walls.length,
          opening_count: geometry.openings.length,
          layers: [
            "EXTERIOR_WALLS",
            "INTERIOR_WALLS",
            "DOORS",
            "WINDOWS",
            "LABELS",
            "DIMENSIONS",
            "ROOM_FILLS",
          ],
        },
      });
    }

    // Phase 4: Generate DXF file
    const dxfContent = generateDXF(geometry);

    // Return as DXF download
    return new NextResponse(dxfContent, {
      status: 200,
      headers: {
        "Content-Type": "application/dxf",
        "Content-Disposition": `attachment; filename="floor-plan-${Date.now()}.dxf"`,
        "Cache-Control": "no-cache",
      },
    });
  } catch (error) {
    console.error("Floor plan generation error:", error);
    return NextResponse.json(
      {
        error: "Generation failed",
        message: error instanceof Error ? error.message : "Unknown error occurred",
      },
      { status: 500 }
    );
  }
}

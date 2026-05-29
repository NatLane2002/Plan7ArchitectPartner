"use client";

import { useState, useEffect, useRef } from "react";
import { getPromptSystemInstruction } from "@/lib/schemas";

// ── Types ──
interface RoomMeta {
  name: string;
  target_sqft: number;
  actual_sqft: number;
  level: number;
}

interface PreviewData {
  preview: string;
  metadata: {
    project_title: string;
    architectural_style: string;
    footprint: {
      width_mm: number;
      length_mm: number;
      width_ft: string;
      length_ft: string;
      total_sqft: number;
    };
    room_count: number;
    rooms: RoomMeta[];
    wall_count: number;
    opening_count: number;
    layers: string[];
  };
}

type AppStatus = "idle" | "generating" | "preview" | "downloading" | "error";

// ── Legend Item Component ──
interface LegendItemProps {
  color: string;
  strokeWidth: number;
  label: string;
  dashed?: boolean;
}

function LegendItem({ color, strokeWidth, label, dashed = false }: LegendItemProps) {
  return (
    <div className="canvas-legend-item">
      <svg width="24" height="12" viewBox="0 0 24 12" aria-hidden="true">
        <line
          x1="0"
          y1="6"
          x2="24"
          y2="6"
          stroke={color}
          strokeWidth={strokeWidth}
          strokeLinecap="round"
          strokeDasharray={dashed ? "4 3" : undefined}
        />
      </svg>
      <span className="canvas-legend-label" style={{ color }}>{label}</span>
    </div>
  );
}

export default function Home() {
  // ── State ──
  const [naturalLanguage, setNaturalLanguage] = useState(
    "I need a 1500 sqft Modern Farmhouse with 3 bedrooms, 2 bathrooms, an open layout kitchen, and an office. Master bedroom needs a walk-in closet."
  );

  // ── Input mode: text description vs. image-based blueprint ──
  type InputMode = "text" | "image";
  const [inputMode, setInputMode] = useState<InputMode>("text");

  const [generatedPrompt, setGeneratedPrompt] = useState("");
  const [pastedJson, setPastedJson] = useState("");
  const [status, setStatus] = useState<AppStatus>("idle");
  const [error, setError] = useState<string | null>(null);
  const [previewData, setPreviewData] = useState<PreviewData | null>(null);
  const [elapsedTime, setElapsedTime] = useState(0);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [copyState, setCopyState] = useState<"idle" | "copied">("idle");
  const copyTimerRef = useRef<NodeJS.Timeout | null>(null);
  const timerRef = useRef<NodeJS.Timeout | null>(null);
  const canvasRef = useRef<HTMLDivElement | null>(null);
  const roomItemRefs = useRef<Map<string, HTMLDivElement>>(new Map());
  const [highlightedRoomKey, setHighlightedRoomKey] = useState<string | null>(null);
  const highlightTimerRef = useRef<NodeJS.Timeout | null>(null);

  // ── Timer for loading state ──
  useEffect(() => {
    if (status === "generating" || status === "downloading") {
      setElapsedTime(0);
      timerRef.current = setInterval(() => {
        setElapsedTime((prev) => prev + 1);
      }, 1000);
    } else {
      if (timerRef.current) clearInterval(timerRef.current);
    }
    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
    };
  }, [status]);

  // ── SVG room click → scroll Space Breakdown to that room ──
  function handleSvgClick(e: React.MouseEvent<HTMLDivElement>) {
    const target = e.target as Element;
    // Hit-area rects are bare <rect class="room-hit-area"> with data-room-key
    const key = target.getAttribute("data-room-key");
    if (!key) return;

    // Scroll the sidebar room item into view
    const el = roomItemRefs.current.get(key);
    if (el) {
      el.scrollIntoView({ behavior: "smooth", block: "center" });
    }

    // Flash the sidebar item highlight
    if (highlightTimerRef.current) clearTimeout(highlightTimerRef.current);
    setHighlightedRoomKey(key);
    highlightTimerRef.current = setTimeout(() => setHighlightedRoomKey(null), 1200);

    // Flash the SVG room fill (the <g> with matching data-room-key)
    if (canvasRef.current) {
      const svgGroup = canvasRef.current.querySelector<SVGGElement>(`.preview-room-group[data-room-key="${CSS.escape(key)}"]`);
      if (svgGroup) {
        svgGroup.classList.remove("room-flashing");
        void (svgGroup as unknown as HTMLElement).offsetWidth;
        svgGroup.classList.add("room-flashing");
        svgGroup.addEventListener("animationend", () => svgGroup.classList.remove("room-flashing"), { once: true });
      }
    }
  }

  // ── Generate AI Prompt ──
  function handleGeneratePrompt() {
    const schemaInstructions = getPromptSystemInstruction();

    if (inputMode === "image") {
      const prompt = `--- AI ARCHITECT INSTRUCTIONS ---
${schemaInstructions}

--- TASK: EXTRACT FLOOR PLAN FROM IMAGE ---
I am attaching an image of a house floor plan, blueprint, or layout sketch.

Your task is to analyze the image with full architectural precision and convert it into the exact JSON schema defined above. This JSON will be fed directly into a CAD pre-processor — every field must be correct.

════════════════════════════════════════════════════════════
EXTRACTION PROCESS (follow in order)
════════════════════════════════════════════════════════════

STEP 1 — IDENTIFY ALL SPACES
Catalog every distinct space visible: bedrooms, bathrooms, kitchen, living areas, dining, hallways, entry, garage, utility rooms, closets, offices, outdoor areas. Include every labeled or implied space, no matter how small.

STEP 2 — EXTRACT OR ESTIMATE DIMENSIONS
- If the image has a scale bar or labeled dimensions (e.g. "12' × 14'"), use those exact values for width_ft and length_ft.
- If no dimensions are labeled, estimate proportionally: identify the largest room, assign it a realistic size (e.g. a master bedroom is typically 12–16 ft wide), then scale all other rooms relative to it.
- All width_ft and length_ft values must be integers ≥ 3.

STEP 3 — ASSIGN GRID COORDINATES
Place every room on the 1-foot Cartesian grid (grid_x = left→right, grid_y = top→bottom):
- Start at grid_x=0, grid_y=0 for the top-left room.
- Rooms must tile perfectly: if Room A is at grid_x=0 with width_ft=14, the room directly to its right starts at grid_x=14.
- No two rooms on the same level may share any grid cell.
- No gaps between adjacent rooms — edges must touch exactly.
- Use hallway rooms (room_type: "hallway") to fill any circulation space between rooms.

STEP 4 — MULTI-STORY HANDLING
- If the image shows multiple floors (labeled "First Floor", "Second Floor", etc.), assign level=1 to ground floor rooms and level=2 to upper floor rooms.
- Level 2 rooms use the SAME grid coordinate space as Level 1 (they stack vertically, not side-by-side).
- Any stairwell must appear on BOTH levels with identical grid_x, grid_y, width_ft, length_ft.
- Set stories to the total number of floors shown.

STEP 5 — MAP ALL OPENINGS
For every door, window, archway, or garage door visible:
- Assign the correct type: "door", "window", "sliding_door", "double_door", "archway", "pocket_door", or "garage_door".
- Set connecting to the two room IDs it links, or ["room_id", "exterior"] for exterior openings.
- Windows ALWAYS connect to "exterior" — never between two interior rooms.
- Garage openings to the outside MUST use type "garage_door", never "door".
- Use "double_door" for grand entries or any opening wider than 1500mm.
- Every interior room must be reachable via at least one door or archway.

STEP 6 — INFER METADATA
- project_title: derive from any visible label, or use a descriptive name like "Extracted 3-Bedroom Ranch".
- architectural_style: infer from the layout shape, room arrangement, and any visible labels (e.g. "Ranch", "Colonial", "Craftsman", "Contemporary").
- footprint_dimensions.width and .length: total exterior bounding box in millimeters (1 ft = 304.8 mm).
- footprint_dimensions.total_area_sqft_calculated: must equal the exact sum of (width_ft × length_ft) for every room listed.
- exterior_wall_thickness_mm: use 250 unless the image indicates otherwise.
- interior_wall_thickness_mm: use 120 unless the image indicates otherwise.

════════════════════════════════════════════════════════════
SELF-CHECK BEFORE OUTPUTTING
════════════════════════════════════════════════════════════
□ Does total_area_sqft_calculated equal the exact sum of all (width_ft × length_ft)?
□ Are all room IDs unique snake_case strings?
□ Are all opening IDs unique snake_case strings?
□ Do any two rooms on the same level share a grid cell? (They must not.)
□ Does every interior room connect to at least one adjacent room via a door or archway?
□ Do all windows connect only to "exterior"?
□ Does every garage room have a "garage_door" (not "door") to "exterior"?
□ Are all enum values spelled exactly as listed in the schema?
□ Is the output raw JSON with zero markdown, zero explanation?

Output ONLY the raw JSON object. Nothing before it, nothing after it.`;
      setGeneratedPrompt(prompt);
    } else {
      const prompt = `--- AI ARCHITECT INSTRUCTIONS ---
${schemaInstructions}

--- CLIENT REQUEST ---
Please generate the JSON floor plan based exactly on this client requirement:
"${naturalLanguage}"
`;
      setGeneratedPrompt(prompt);
    }
  }

  // ── Copy to Clipboard ──
  function handleCopyPrompt() {
    navigator.clipboard.writeText(generatedPrompt).then(() => {
      if (copyTimerRef.current) clearTimeout(copyTimerRef.current);
      setCopyState("copied");
      copyTimerRef.current = setTimeout(() => setCopyState("idle"), 2000);
    });
  }

  // ── Reset workspace ──
  function handleReset() {
    setGeneratedPrompt("");
    setPastedJson("");
    setPreviewData(null);
    setStatus("idle");
    setError(null);
    setHighlightedRoomKey(null);
  }

  // ── Strip markdown fences from AI JSON output ──
  function stripMarkdownFences(raw: string): string {
    return raw
      .replace(/^```(?:json)?\s*/i, "")
      .replace(/\s*```\s*$/, "")
      .trim();
  }

  // ── Generate Preview from pasted JSON ──
  async function handlePreview() {
    if (!pastedJson.trim()) {
      setError("Please paste the JSON output from AI first.");
      return;
    }
    setStatus("generating");
    setError(null);
    setPreviewData(null);

    let parsedBody;
    try {
      parsedBody = JSON.parse(stripMarkdownFences(pastedJson));
      parsedBody._preview = true;
    } catch (e) {
      setStatus("error");
      setError("Invalid JSON format. Please ensure you copied the exact JSON structure from the AI (markdown code fences are stripped automatically).");
      return;
    }

    try {
      const res = await fetch("/api/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(parsedBody),
      });

      if (!res.ok) {
        const errData = await res.json();
        throw new Error(errData.message || errData.error || "Generation failed");
      }

      const data: PreviewData = await res.json();
      setPreviewData(data);
      setStatus("preview");
    } catch (err) {
      setError(err instanceof Error ? err.message : "An error occurred");
      setStatus("error");
    }
  }

  // ── Download DXF ──
  async function handleDownload() {
    if (!pastedJson.trim()) return;
    setStatus("downloading");
    setError(null);

    let parsedBody;
    try {
      parsedBody = JSON.parse(stripMarkdownFences(pastedJson));
      parsedBody._preview = false;
    } catch (e) {
      setStatus("error");
      setError("Invalid JSON format.");
      return;
    }

    try {
      const res = await fetch("/api/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(parsedBody),
      });

      if (!res.ok) {
        const errData = await res.json();
        throw new Error(errData.message || errData.error || "Download failed");
      }

      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `archdraft-${Date.now()}.dxf`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);

      setStatus("preview");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Download failed");
      setStatus("error");
    }
  }

  // ── Status badge ──
  function renderStatusBadge() {
    const configs: Record<AppStatus, { label: string; class: string; icon: string }> = {
      idle: { label: "Ready", class: "status-badge-idle", icon: "○" },
      generating: { label: `Processing ${elapsedTime}s`, class: "status-badge-working", icon: "◉" },
      preview: { label: "Preview Ready", class: "status-badge-done", icon: "✓" },
      downloading: { label: `Exporting ${elapsedTime}s`, class: "status-badge-working", icon: "◉" },
      error: { label: "Error", class: "status-badge-error", icon: "✕" },
    };
    const cfg = configs[status];
    return (
      <span className={`status-badge ${cfg.class}`}>
        <span className="status-icon">{cfg.icon}</span>
        {cfg.label}
      </span>
    );
  }

  return (
    <>
    <div className="workspace-container">
      {/* Ambient glow orbs */}
      <div className="glow-orb glow-orb-1" />
      <div className="glow-orb glow-orb-2" />

      {/* ── Header ── */}
      <header className="workspace-header">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-lg bg-gradient-to-br from-indigo-500 to-purple-600 flex items-center justify-center shadow-lg">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <rect x="3" y="3" width="7" height="7" />
              <rect x="14" y="3" width="7" height="7" />
              <rect x="3" y="14" width="7" height="7" />
              <rect x="14" y="14" width="7" height="7" />
            </svg>
          </div>
          <div>
            <h1 className="text-base font-semibold text-zinc-50 tracking-tight leading-none">
              ArchDraft <span className="text-indigo-400">Universal</span>
            </h1>
            <p className="text-[10px] text-zinc-500 tracking-widest uppercase font-medium mt-0.5">
              Universal CAD Pre-Processor
            </p>
          </div>
        </div>
        <div className="flex items-center gap-4">
          {renderStatusBadge()}
        </div>
      </header>

      {/* ── 3-Pane Workspace Layout ── */}
      <main className="workspace-main">
        
        {/* ─── LEFT SIDEBAR: Input/Workflow Pane ─── */}
        <aside className="workspace-sidebar-left">
          <div className="sidebar-content">
            
            {/* Step 1: Describe */}
            <section className="workflow-section">
              <div className="section-header">
                <div className="step-badge step-badge-1">1</div>
                <h2 className="section-title">Describe Floor Plan</h2>
              </div>

              {/* Mode Toggle */}
              <div className="input-mode-toggle" role="group" aria-label="Input mode">
                <button
                  type="button"
                  className={`mode-toggle-btn ${inputMode === "text" ? "mode-toggle-btn-active" : ""}`}
                  onClick={() => { setInputMode("text"); setGeneratedPrompt(""); }}
                  aria-pressed={inputMode === "text"}
                >
                  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                    <path d="M17 6.1H3M21 12.1H3M15.1 18H3" />
                  </svg>
                  Text
                </button>
                <button
                  type="button"
                  className={`mode-toggle-btn ${inputMode === "image" ? "mode-toggle-btn-active" : ""}`}
                  onClick={() => { setInputMode("image"); setGeneratedPrompt(""); }}
                  aria-pressed={inputMode === "image"}
                >
                  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                    <rect x="3" y="3" width="18" height="18" rx="2" />
                    <circle cx="8.5" cy="8.5" r="1.5" />
                    <polyline points="21 15 16 10 5 21" />
                  </svg>
                  From Image
                </button>
              </div>

              {inputMode === "text" ? (
                <>
                  <textarea
                    className="workflow-textarea"
                    value={naturalLanguage}
                    onChange={(e) => setNaturalLanguage(e.target.value)}
                    placeholder="Describe your floor plan in plain English..."
                    rows={4}
                    aria-label="Floor plan description"
                  />
                  {/* Style quick-picks */}
                  <div className="style-chips" role="group" aria-label="Architectural style quick-picks">
                    {["Modern Farmhouse", "Mid-Century Modern", "Colonial", "Craftsman", "Contemporary", "Ranch"].map((style) => (
                      <button
                        key={style}
                        type="button"
                        className="style-chip"
                        onClick={() => {
                          setNaturalLanguage((prev) => {
                            const cleaned = prev.replace(/,?\s*(Modern Farmhouse|Mid-Century Modern|Colonial|Craftsman|Contemporary|Ranch)\s*style/gi, "").trim();
                            return cleaned ? `${cleaned}, ${style} style` : `${style} style`;
                          });
                        }}
                        aria-label={`Apply ${style} style`}
                      >
                        {style}
                      </button>
                    ))}
                  </div>
                </>
              ) : (
                <div className="image-mode-info">
                  <div className="image-mode-info-icon" aria-hidden="true">
                    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                      <rect x="3" y="3" width="18" height="18" rx="2" />
                      <circle cx="8.5" cy="8.5" r="1.5" />
                      <polyline points="21 15 16 10 5 21" />
                    </svg>
                  </div>
                  <p className="image-mode-info-title">Blueprint / Layout Image</p>
                  <p className="image-mode-info-body">
                    Click <strong>Generate LLM Prompt</strong> to get a precision extraction prompt. Then paste it into a vision-capable AI — Gemini, GPT-4o, or Claude — along with your image.
                  </p>
                  <ul className="image-mode-info-list" aria-label="Accepted image types">
                    <li>Floor plan sketches</li>
                    <li>Architectural blueprints</li>
                    <li>Real estate listing layouts</li>
                    <li>Hand-drawn or digital plans</li>
                  </ul>
                </div>
              )}

              <button
                type="button"
                className="workflow-button workflow-button-secondary"
                onClick={handleGeneratePrompt}
                disabled={inputMode === "text" && !naturalLanguage.trim()}
              >
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z" />
                </svg>
                Generate LLM Prompt
              </button>
            </section>

            {/* Step 2: Copy Prompt */}
            {generatedPrompt && (
              <section className="workflow-section animate-fade-in">
                <div className="section-header">
                  <div className="step-badge step-badge-2">2</div>
                  <h2 className="section-title">Take to AI Assistant</h2>
                </div>
                <textarea
                  readOnly
                  value={generatedPrompt}
                  className="workflow-textarea workflow-textarea-readonly"
                  rows={6}
                  aria-label="Generated AI prompt"
                />
                <button
                  type="button"
                  onClick={handleCopyPrompt}
                  className={`workflow-button ${copyState === "copied" ? "workflow-button-copied" : "workflow-button-copy"}`}
                  aria-live="polite"
                >
                  {copyState === "copied" ? (
                    <>
                      <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                        <polyline points="20 6 9 17 4 12" />
                      </svg>
                      Copied!
                    </>
                  ) : (
                    <>
                      <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                        <rect x="9" y="9" width="13" height="13" rx="2" />
                        <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" />
                      </svg>
                      Copy Prompt
                    </>
                  )}
                </button>
                <p className="workflow-hint">
                  {inputMode === "image"
                    ? "Paste prompt + attach your image into Gemini, GPT-4o, or Claude"
                    : "Paste into Gemini, ChatGPT, or Claude"}
                </p>
              </section>
            )}

            {/* Step 3: Paste JSON */}
            <section className="workflow-section animate-fade-in">
              <div className="section-header">
                <div className="step-badge step-badge-3">3</div>
                <h2 className="section-title">Paste AI JSON Result</h2>
              </div>
              <div className="json-input-wrapper">
                <textarea
                  className="workflow-textarea workflow-textarea-code"
                  value={pastedJson}
                  onChange={(e) => setPastedJson(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" && (e.ctrlKey || e.metaKey)) {
                      e.preventDefault();
                      if (pastedJson.trim() && status !== "generating" && status !== "downloading") {
                        handlePreview();
                      }
                    }
                  }}
                  placeholder={'{\n  "project_title": "...",\n  "rooms": [...]\n}'}
                  rows={10}
                  spellCheck={false}
                  aria-label="AI JSON output — press Ctrl+Enter to validate"
                />
                {pastedJson.trim() && (
                  <div className="json-meta-bar">
                    <span className="json-meta-chars">{pastedJson.trim().length.toLocaleString()} chars</span>
                    {pastedJson.trim().startsWith("```") && (
                      <span className="json-meta-strip">Markdown fences will be auto-stripped</span>
                    )}
                    <span className="json-meta-hint">Ctrl+Enter to validate</span>
                  </div>
                )}
              </div>
              
              <button
                type="button"
                className="workflow-button workflow-button-primary"
                onClick={handlePreview}
                disabled={status === "generating" || status === "downloading" || !pastedJson.trim()}
              >
                {status === "generating" ? (
                  <>
                    <div className="pulse-loader">
                      <span></span><span></span><span></span>
                    </div>
                    Processing...
                  </>
                ) : (
                  <>
                    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                      <polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2" />
                    </svg>
                    Validate & Generate
                  </>
                )}
              </button>
            </section>

            {/* Error Display */}
            {error && (
              <div className="error-card animate-fade-in">
                <div className="flex items-start gap-3">
                  <span className="text-red-400 text-base flex-shrink-0">⚠</span>
                  <div>
                    <p className="text-sm font-semibold text-red-400">Validation Error</p>
                    <p className="text-xs text-zinc-400 mt-1 break-words">{error}</p>
                  </div>
                </div>
              </div>
            )}
          </div>
        </aside>

        {/* ─── CENTER CANVAS: The Hero Visualizer ─── */}
        <section className="workspace-canvas">
          <div className="canvas-header">
            <div className="flex items-center gap-2">
              <div className="w-5 h-5 rounded bg-amber-500/20 flex items-center justify-center">
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="#f59e0b" strokeWidth="2.5">
                  <rect x="2" y="3" width="20" height="14" rx="2" />
                  <line x1="8" y1="21" x2="16" y2="21" />
                  <line x1="12" y1="17" x2="12" y2="21" />
                </svg>
              </div>
              <h2 className="canvas-title">Floor Plan Visualizer</h2>
            </div>
            {previewData && (
              <div className="flex items-center gap-3">
                <span className="text-[10px] text-zinc-500 font-mono tracking-wide">
                  {previewData.metadata.footprint.width_ft}&apos; × {previewData.metadata.footprint.length_ft}&apos;
                </span>
                <button
                  type="button"
                  onClick={handleReset}
                  className="p-1.5 rounded hover:bg-white/5 transition-colors text-zinc-600 hover:text-zinc-400"
                  title="Reset workspace"
                  aria-label="Reset workspace"
                >
                  <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M3 12a9 9 0 1 0 9-9 9.75 9.75 0 0 0-6.74 2.74L3 8"/>
                    <path d="M3 3v5h5"/>
                  </svg>
                </button>
                <button
                  type="button"
                  onClick={() => setIsFullscreen(true)}
                  className="p-1.5 rounded hover:bg-white/5 transition-colors text-zinc-500 hover:text-zinc-300"
                  title="Enter Fullscreen"
                >
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M8 3H5a2 2 0 0 0-2 2v3m18 0V5a2 2 0 0 0-2-2h-3m0 18h3a2 2 0 0 0 2-2v-3M3 16v3a2 2 0 0 0 2 2h3"/>
                  </svg>
                </button>
              </div>
            )}
          </div>

          <div className="canvas-viewport">
            {!previewData && status !== "generating" && (
              <div className="canvas-empty-state">
                <svg className="opacity-20" width="64" height="64" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1">
                  <rect x="3" y="3" width="7" height="7" />
                  <rect x="14" y="3" width="7" height="7" />
                  <rect x="3" y="14" width="7" height="7" />
                  <rect x="14" y="14" width="7" height="7" />
                </svg>
                <p className="text-sm text-zinc-500 mt-4">Your floor plan will appear here</p>
                <p className="text-xs text-zinc-600 mt-1">Paste valid JSON and click Validate</p>
              </div>
            )}

            {status === "generating" && (
              <div className="canvas-loading-state">
                <div className="relative">
                  <div className="w-16 h-16 rounded-2xl bg-gradient-to-br from-indigo-500 to-purple-600 animate-pulse opacity-40" />
                  <div className="absolute inset-0 flex items-center justify-center">
                    <div className="pulse-loader">
                      <span></span><span></span><span></span>
                    </div>
                  </div>
                </div>
                <p className="text-sm text-zinc-400 mt-4">Running BSP subdivision...</p>
                <p className="text-xs text-zinc-600 font-mono mt-1">{elapsedTime}s elapsed</p>
              </div>
            )}

            {previewData && (
              <div
                className="canvas-preview"
                onClick={handleSvgClick}
              >
                <div className="canvas-overlay-label">
                  {previewData.metadata.project_title} - {previewData.metadata.architectural_style}
                </div>
                <div ref={canvasRef} dangerouslySetInnerHTML={{ __html: previewData.preview }} className="canvas-svg-wrapper" />
              </div>
            )}
          </div>

          {/* ── Floor Plan Legend — lives BELOW the SVG, never overlaps ── */}
          {previewData && (
            <div className="canvas-legend" role="legend" aria-label="Floor plan legend">
              <LegendItem color="#e4e4e7" strokeWidth={3} label="Exterior Walls" />
              <div className="canvas-legend-divider" />
              <LegendItem color="#a1a1aa" strokeWidth={2} label="Interior Walls" />
              <div className="canvas-legend-divider" />
              <LegendItem color="#b91c1c" strokeWidth={2} label="Doors" />
              <div className="canvas-legend-divider" />
              <LegendItem color="#c026d3" strokeWidth={3} label="Double Doors" />
              <div className="canvas-legend-divider" />
              <LegendItem color="#60a5fa" strokeWidth={2.5} label="Windows" dashed />
              <div className="canvas-legend-divider" />
              <LegendItem color="#f59e0b" strokeWidth={3.5} label="Garage Doors" />
            </div>
          )}
        </section>

        {/* ─── RIGHT SIDEBAR: Inspector & Export Pane ─── */}
        <aside className="workspace-sidebar-right">
          <div className="sidebar-content">
            
            {previewData ? (
              <>
                {/* Room Breakdown */}
                <section className="inspector-section">
                  <div className="inspector-header">
                    <h3 className="inspector-title">Space Breakdown</h3>
                    <span className="inspector-badge">
                      {previewData.metadata.room_count} ROOMS
                    </span>
                  </div>
                  <div className="inspector-list">
                    {[...new Set(previewData.metadata.rooms.map((r) => r.level))].sort().map((level) => (
                      <div key={level} className="space-y-2">
                        <div className="level-label">LEVEL {level}</div>
                        {previewData.metadata.rooms.filter(r => r.level === level).map((room, i) => {
                          const key = `${room.name}__L${room.level}`;
                          const isHighlighted = highlightedRoomKey === key;
                          return (
                            <div
                              key={i}
                              ref={(el) => {
                                if (el) roomItemRefs.current.set(key, el);
                                else roomItemRefs.current.delete(key);
                              }}
                              className={`room-item cursor-pointer rounded transition-all duration-300 ${
                                isHighlighted
                                  ? "bg-indigo-500/20 ring-1 ring-indigo-500/50"
                                  : "hover:bg-white/5"
                              }`}
                              onClick={() => {
                                // Sidebar click → flash the SVG room
                                if (canvasRef.current) {
                                  const svgGroup = canvasRef.current.querySelector<SVGGElement>(`.preview-room-group[data-room-key="${CSS.escape(key)}"]`);
                                  if (svgGroup) {
                                    svgGroup.classList.remove("room-flashing");
                                    void (svgGroup as unknown as HTMLElement).offsetWidth;
                                    svgGroup.classList.add("room-flashing");
                                    svgGroup.addEventListener("animationend", () => svgGroup.classList.remove("room-flashing"), { once: true });
                                  }
                                }
                              }}
                            >
                              <span className="room-name">{room.name}</span>
                              <div className="room-metrics">
                                <div className="room-metrics-row">
                                  <span className="room-metric-label">Target</span>
                                  <span className="room-metric-label">Actual</span>
                                </div>
                                <div className="room-metrics-row">
                                  <span className="room-metric-value">{room.target_sqft} ft²</span>
                                  <span className={`room-metric-value ${
                                    room.actual_sqft === 0 ? "text-zinc-600" :
                                    Math.abs(room.actual_sqft - room.target_sqft) / Math.max(room.target_sqft, 1) < 0.05 ? "text-emerald-400" :
                                    Math.abs(room.actual_sqft - room.target_sqft) / Math.max(room.target_sqft, 1) < 0.15 ? "text-amber-400" :
                                    "text-red-400"
                                  }`}>{room.actual_sqft} ft²</span>
                                </div>
                                {/* Accuracy bar */}
                                <div className="room-accuracy-bar-track" aria-hidden="true">
                                  <div
                                    className={`room-accuracy-bar-fill ${
                                      Math.abs(room.actual_sqft - room.target_sqft) / Math.max(room.target_sqft, 1) < 0.05 ? "room-accuracy-bar-good" :
                                      Math.abs(room.actual_sqft - room.target_sqft) / Math.max(room.target_sqft, 1) < 0.15 ? "room-accuracy-bar-warn" :
                                      "room-accuracy-bar-bad"
                                    }`}
                                    style={{ width: `${Math.min(100, (room.actual_sqft / Math.max(room.target_sqft, 1)) * 100).toFixed(1)}%` }}
                                  />
                                </div>
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    ))}
                  </div>
                </section>

                {/* DXF Integrity */}
                <section className="inspector-section">
                  <div className="inspector-header">
                    <h3 className="inspector-title">DXF Payload</h3>
                  </div>
                  <div className="inspector-data">
                    <div className="data-row">
                      <span className="data-label">Format</span>
                      <span className="data-value font-mono text-xs">AC1015</span>
                    </div>
                    <div className="data-row">
                      <span className="data-label">Total SQFT</span>
                      <span className="data-value font-mono text-emerald-400 font-semibold">{previewData.metadata.footprint.total_sqft}</span>
                    </div>
                    <div className="data-row">
                      <span className="data-label">Walls</span>
                      <span className="data-value font-mono">{previewData.metadata.wall_count}</span>
                    </div>
                    <div className="data-row">
                      <span className="data-label">Openings</span>
                      <span className="data-value font-mono">{previewData.metadata.opening_count}</span>
                    </div>
                    <div className="data-layers">
                      {previewData.metadata.layers.map((layer) => (
                        <span key={layer} className="layer-tag">{layer}</span>
                      ))}
                    </div>
                  </div>
                </section>

                {/* Download CTA */}
                <button
                  type="button"
                  className="download-button"
                  onClick={handleDownload}
                  disabled={status === "downloading"}
                >
                  {status === "downloading" ? (
                    <>
                      <div className="pulse-loader">
                        <span></span><span></span><span></span>
                      </div>
                      Exporting...
                    </>
                  ) : (
                    <>
                      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                        <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
                        <polyline points="7 10 12 15 17 10" />
                        <line x1="12" y1="15" x2="12" y2="3" />
                      </svg>
                      Download DXF
                    </>
                  )}
                </button>
              </>
            ) : (
              <div className="inspector-empty">
                <svg className="opacity-10" width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1">
                  <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
                  <polyline points="14 2 14 8 20 8" />
                  <line x1="12" y1="18" x2="12" y2="12" />
                  <line x1="9" y1="15" x2="15" y2="15" />
                </svg>
                <p className="text-xs text-zinc-600 mt-3">Inspector data will appear here</p>
              </div>
            )}
          </div>
        </aside>
      </main>
    </div>

    {/* Fullscreen Modal */}
    {isFullscreen && previewData && (
      <>
        <div className="fullscreen-backdrop" onClick={() => setIsFullscreen(false)} />
        <div className="fullscreen-modal">
          <div className="fullscreen-header">
            <div className="flex items-center gap-2">
              <div className="w-5 h-5 rounded bg-amber-500/20 flex items-center justify-center">
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="#f59e0b" strokeWidth="2.5">
                  <rect x="2" y="3" width="20" height="14" rx="2" />
                  <line x1="8" y1="21" x2="16" y2="21" />
                  <line x1="12" y1="17" x2="12" y2="21" />
                </svg>
              </div>
              <h2 className="canvas-title">Fullscreen Visualizer</h2>
            </div>
            <div className="flex items-center gap-3">
              <span className="text-[10px] text-zinc-500 font-mono">
                {previewData.metadata.footprint.width_ft}&apos; × {previewData.metadata.footprint.length_ft}&apos;
              </span>
              <button
                type="button"
                onClick={() => setIsFullscreen(false)}
                className="p-1.5 rounded hover:bg-white/5 transition-colors text-zinc-500 hover:text-zinc-300"
                title="Exit Fullscreen"
              >
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M8 3v3a2 2 0 0 1-2 2H3m18 0h-3a2 2 0 0 1-2-2V3m0 18v-3a2 2 0 0 1 2-2h3M3 16h3a2 2 0 0 1 2 2v3"/>
                </svg>
              </button>
            </div>
          </div>
          <div className="fullscreen-content">
            <div className="canvas-overlay-label">
              {previewData.metadata.project_title} - {previewData.metadata.architectural_style}
            </div>
            <div
              dangerouslySetInnerHTML={{ __html: previewData.preview }}
              className="w-full h-full [&>svg]:w-full [&>svg]:h-full"
            />
          </div>
          {/* Legend in fullscreen — same HTML bar, never overlaps */}
          <div className="canvas-legend canvas-legend-fullscreen" role="legend" aria-label="Floor plan legend">
            <LegendItem color="#e4e4e7" strokeWidth={3} label="Exterior Walls" />
            <div className="canvas-legend-divider" />
            <LegendItem color="#a1a1aa" strokeWidth={2} label="Interior Walls" />
            <div className="canvas-legend-divider" />
            <LegendItem color="#b91c1c" strokeWidth={2} label="Doors" />
            <div className="canvas-legend-divider" />
            <LegendItem color="#c026d3" strokeWidth={3} label="Double Doors" />
            <div className="canvas-legend-divider" />
            <LegendItem color="#60a5fa" strokeWidth={2.5} label="Windows" dashed />
            <div className="canvas-legend-divider" />
            <LegendItem color="#f59e0b" strokeWidth={3.5} label="Garage Doors" />
          </div>
        </div>
      </>
    )}
    </>
  );
}

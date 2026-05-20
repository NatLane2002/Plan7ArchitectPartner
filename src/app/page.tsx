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

export default function Home() {
  // ── State ──
  const [naturalLanguage, setNaturalLanguage] = useState(
    "I need a 1500 sqft Modern Farmhouse with 3 bedrooms, 2 bathrooms, an open layout kitchen, and an office. Master bedroom needs a walk-in closet."
  );
  
  const [generatedPrompt, setGeneratedPrompt] = useState("");
  const [pastedJson, setPastedJson] = useState("");
  const [status, setStatus] = useState<AppStatus>("idle");
  const [error, setError] = useState<string | null>(null);
  const [previewData, setPreviewData] = useState<PreviewData | null>(null);
  const [elapsedTime, setElapsedTime] = useState(0);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const timerRef = useRef<NodeJS.Timeout | null>(null);

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

  // ── Generate AI Prompt ──
  function handleGeneratePrompt() {
    const schemaInstructions = getPromptSystemInstruction();
    const prompt = `--- AI ARCHITECT INSTRUCTIONS ---
${schemaInstructions}

--- CLIENT REQUEST ---
Please generate the JSON floor plan based exactly on this client requirement:
"${naturalLanguage}"
`;
    setGeneratedPrompt(prompt);
  }

  // ── Copy to Clipboard ──
  function handleCopyPrompt() {
    navigator.clipboard.writeText(generatedPrompt);
    alert("Prompt copied to clipboard! Paste this into Gemini.");
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
      parsedBody = JSON.parse(pastedJson);
      parsedBody._preview = true;
    } catch (e) {
      setStatus("error");
      setError("Invalid JSON format. Please ensure you copied the exact JSON structure from Gemini.");
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
      parsedBody = JSON.parse(pastedJson);
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
              <textarea
                className="workflow-textarea"
                value={naturalLanguage}
                onChange={(e) => setNaturalLanguage(e.target.value)}
                placeholder="Describe your floor plan in plain English..."
                rows={4}
                aria-label="Floor plan description"
              />
              <button
                type="button"
                className="workflow-button workflow-button-secondary"
                onClick={handleGeneratePrompt}
                disabled={!naturalLanguage.trim()}
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
                <div className="relative">
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
                    className="absolute top-2 right-2 px-3 py-1.5 bg-indigo-500 hover:bg-indigo-600 text-white text-xs font-semibold rounded-md shadow-sm transition-colors"
                  >
                    Copy
                  </button>
                </div>
                <p className="workflow-hint">
                  Paste into Gemini, ChatGPT, or Claude
                </p>
              </section>
            )}

            {/* Step 3: Paste JSON */}
            <section className="workflow-section animate-fade-in">
              <div className="section-header">
                <div className="step-badge step-badge-3">3</div>
                <h2 className="section-title">Paste AI JSON Result</h2>
              </div>
              <textarea
                className="workflow-textarea workflow-textarea-code"
                value={pastedJson}
                onChange={(e) => setPastedJson(e.target.value)}
                placeholder='{\n  "project_title": "...",\n  "rooms": [...]\n}'
                rows={10}
                spellCheck={false}
                aria-label="AI JSON output"
              />
              
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
              <div className="canvas-preview">
                <div className="canvas-overlay-label">
                  {previewData.metadata.project_title} - {previewData.metadata.architectural_style}
                </div>
                <div dangerouslySetInnerHTML={{ __html: previewData.preview }} className="w-full h-full" />
              </div>
            )}
          </div>
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
                        {previewData.metadata.rooms.filter(r => r.level === level).map((room, i) => (
                          <div key={i} className="room-item">
                            <span className="room-name">{room.name}</span>
                            <div className="room-metrics">
                              <span className="room-metric-label">Target: {room.target_sqft} ft²</span>
                              <span className="room-metric-value">{room.actual_sqft} ft²</span>
                            </div>
                          </div>
                        ))}
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
            <div dangerouslySetInnerHTML={{ __html: previewData.preview }} className="w-full h-full [&>svg]:w-full [&>svg]:h-full" />
          </div>
        </div>
      </>
    )}
    </>
  );
}

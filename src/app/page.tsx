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
      a.download = `plan7-${Date.now()}.dxf`;
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
      generating: { label: `Translating JSON... ${elapsedTime}s`, class: "status-badge-working", icon: "◉" },
      preview: { label: "Preview Ready", class: "status-badge-done", icon: "✓" },
      downloading: { label: `Exporting DXF... ${elapsedTime}s`, class: "status-badge-working", icon: "◉" },
      error: { label: "Error", class: "status-badge-error", icon: "✕" },
    };
    const cfg = configs[status];
    return (
      <span className={`status-badge ${cfg.class}`}>
        <span>{cfg.icon}</span>
        {cfg.label}
      </span>
    );
  }

  return (
    <>
    <div className="min-h-screen relative overflow-hidden">
      {/* Ambient glow orbs */}
      <div className="glow-orb glow-orb-1" />
      <div className="glow-orb glow-orb-2" />

      {/* ── Header ── */}
      <header className="relative z-10 border-b border-[var(--color-border)] bg-[var(--color-bg-primary)]/80 backdrop-blur-md">
        <div className="max-w-7xl mx-auto px-6 py-4 flex items-center justify-between">
          <div className="flex items-center gap-4">
            {/* Logo */}
            <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-[#6366f1] to-[#a855f7] flex items-center justify-center shadow-lg shadow-[var(--color-accent-glow)]">
              <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <rect x="3" y="3" width="7" height="7" />
                <rect x="14" y="3" width="7" height="7" />
                <rect x="3" y="14" width="7" height="7" />
                <rect x="14" y="14" width="7" height="7" />
              </svg>
            </div>
            <div>
              <h1 className="text-lg font-bold text-[var(--color-text-primary)] tracking-tight">
                Plan7 Architect<span className="text-[var(--color-accent)]">Partner</span>
              </h1>
              <p className="text-xs text-[var(--color-text-muted)] tracking-wide">
                AI-ENHANCED · DXF CAD GENERATOR
              </p>
            </div>
          </div>
          <div className="flex items-center gap-4">
            {renderStatusBadge()}
          </div>
        </div>
      </header>

      {/* ── Main Content ── */}
      <main className="relative z-10 max-w-7xl mx-auto px-6 py-8">
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-8">
          
          {/* ─── Left Panel: AI Workflow Workspace ─── */}
          <div className="lg:col-span-5 space-y-6 animate-fade-in">
            
            {/* Step 1: Create prompt */}
            <div className="glass-card p-6">
              <div className="flex items-center gap-2 mb-4">
                <div className="w-6 h-6 rounded-md bg-[var(--color-accent)]/20 flex items-center justify-center">
                  <span className="text-xs font-bold text-[var(--color-accent)]">1</span>
                </div>
                <h2 className="text-sm font-semibold text-[var(--color-text-primary)] uppercase tracking-wider">
                  Describe Floor Plan
                </h2>
              </div>
              <textarea
                className="textarea-field min-h-[100px]"
                value={naturalLanguage}
                onChange={(e) => setNaturalLanguage(e.target.value)}
                placeholder="Describe your floor plan in plain English..."
                rows={3}
              />
              <button
                className="btn-secondary w-full mt-4 flex items-center justify-center gap-2"
                onClick={handleGeneratePrompt}
                disabled={!naturalLanguage.trim()}
              >
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z" />
                </svg>
                Generate LLM Prompt
              </button>
            </div>

            {/* Step 2: Copy Prompt */}
            {generatedPrompt && (
              <div className="glass-card p-6 animate-fade-in">
                <div className="flex items-center gap-2 mb-4">
                  <div className="w-6 h-6 rounded-md bg-[var(--color-cyan)]/20 flex items-center justify-center">
                    <span className="text-xs font-bold text-[var(--color-cyan)]">2</span>
                  </div>
                  <h2 className="text-sm font-semibold text-[var(--color-text-primary)] uppercase tracking-wider">
                    Take to Google Gemini
                  </h2>
                </div>
                <div className="relative">
                  <textarea
                    readOnly
                    value={generatedPrompt}
                    className="textarea-field text-xs font-mono h-32 overflow-y-auto bg-black/30 border-black shadow-inner"
                  />
                  <div className="absolute top-2 right-2">
                    <button onClick={handleCopyPrompt} className="px-3 py-1.5 bg-[var(--color-accent)] hover:bg-[var(--color-accent-hover)] text-white text-xs font-bold rounded shadow transition-colors">
                      Copy Prompt
                    </button>
                  </div>
                </div>
                <p className="mt-3 text-xs text-[var(--color-text-muted)] text-center">
                  Copy the above and run it in Google Gemini, ChatGPT, or Claude.
                </p>
              </div>
            )}

            {/* Step 3: Paste JSON */}
            <div className="glass-card p-6 animate-fade-in animate-fade-in-delay-1">
              <div className="flex items-center gap-2 mb-4">
                <div className="w-6 h-6 rounded-md bg-[var(--color-success)]/20 flex items-center justify-center">
                  <span className="text-xs font-bold text-[var(--color-success)]">3</span>
                </div>
                <h2 className="text-sm font-semibold text-[var(--color-text-primary)] uppercase tracking-wider">
                  Paste AI JSON Result
                </h2>
              </div>
              <textarea
                className="textarea-field font-mono text-xs mb-4"
                value={pastedJson}
                onChange={(e) => setPastedJson(e.target.value)}
                placeholder='{\n  "project_title": "...",\n  "rooms": [...]\n}'
                rows={8}
                spellCheck={false}
              />
              
              <button
                className="btn-primary w-full"
                onClick={handlePreview}
                disabled={status === "generating" || status === "downloading" || !pastedJson.trim()}
              >
                <span className="flex items-center justify-center gap-2">
                  {status === "generating" ? (
                    <>
                      <div className="pulse-loader">
                        <span></span><span></span><span></span>
                      </div>
                      Validating & Processing...
                    </>
                  ) : (
                    <>
                      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                        <polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2" />
                      </svg>
                      Validate & Generate Floor Plan
                    </>
                  )}
                </span>
              </button>
            </div>

            {/* Error Display */}
            {error && (
              <div className="bg-[var(--color-danger)]/10 border border-[var(--color-danger)]/30 rounded-xl p-4 animate-fade-in">
                <div className="flex items-start gap-3">
                  <span className="text-[var(--color-danger)] text-lg">⚠</span>
                  <div className="w-full truncate whitespace-normal">
                    <p className="text-sm font-medium text-[var(--color-danger)]">Validation Error</p>
                    <p className="text-xs text-[var(--color-text-secondary)] mt-1 break-words whitespace-pre-wrap">{error}</p>
                  </div>
                </div>
              </div>
            )}
          </div>

          {/* ─── Right Panel: Preview & Results ─── */}
          <div className="lg:col-span-7 space-y-6 animate-fade-in animate-fade-in-delay-1">
            {/* Preview Area */}
            <div className="glass-card overflow-hidden">
              <div className="flex items-center justify-between px-6 py-4 border-b border-[var(--color-border)]">
                <div className="flex items-center gap-2">
                  <div className="w-6 h-6 rounded-md bg-[#f59e0b]/20 flex items-center justify-center">
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#f59e0b" strokeWidth="2">
                      <rect x="2" y="3" width="20" height="14" rx="2" ry="2" />
                      <line x1="8" y1="21" x2="16" y2="21" />
                      <line x1="12" y1="17" x2="12" y2="21" />
                    </svg>
                  </div>
                  <h2 className="text-sm font-semibold text-[var(--color-text-primary)] uppercase tracking-wider">
                    Real-time Floor Plan Visualizer
                  </h2>
                </div>
                <div className="flex items-center gap-4">
                  {previewData && (
                    <span className="text-xs text-[var(--color-text-muted)] font-mono">
                       Footprint: {previewData.metadata.footprint.width_ft}&apos; × {previewData.metadata.footprint.length_ft}&apos;
                    </span>
                  )}
                  {previewData && (
                     <button
                        onClick={() => setIsFullscreen(true)}
                        className="flex items-center justify-center p-2 rounded-md hover:bg-white/10 transition-colors text-[var(--color-text-muted)] hover:text-white border border-[var(--color-border)] bg-[var(--color-bg-input)]"
                        title="Enter Fullscreen"
                     >
                        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M8 3H5a2 2 0 0 0-2 2v3m18 0V5a2 2 0 0 0-2-2h-3m0 18h3a2 2 0 0 0 2-2v-3M3 16v3a2 2 0 0 0 2 2h3"/></svg>
                     </button>
                  )}
                </div>
              </div>

              <div className="floor-plan-preview" style={{ minHeight: "460px" }}>
                {!previewData && status !== "generating" && (
                  <div className="flex items-center justify-center h-[460px] text-[var(--color-text-muted)]">
                    <div className="text-center space-y-3">
                      <svg className="mx-auto opacity-30" width="64" height="64" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1">
                        <rect x="3" y="3" width="7" height="7" />
                        <rect x="14" y="3" width="7" height="7" />
                        <rect x="3" y="14" width="7" height="7" />
                        <rect x="14" y="14" width="7" height="7" />
                      </svg>
                      <p className="text-sm">Your AI geometry preview will appear here</p>
                      <p className="text-xs opacity-60">Paste the valid JSON and click Validate</p>
                    </div>
                  </div>
                )}

                {status === "generating" && (
                  <div className="flex items-center justify-center h-[460px]">
                    <div className="text-center space-y-4">
                      <div className="relative">
                        <div className="w-16 h-16 mx-auto rounded-2xl bg-gradient-to-br from-[var(--color-accent)] to-[var(--color-accent-hover)] animate-pulse opacity-50" />
                        <div className="absolute inset-0 flex items-center justify-center">
                          <div className="pulse-loader">
                            <span></span><span></span><span></span>
                          </div>
                        </div>
                      </div>
                      <p className="text-sm text-[var(--color-text-secondary)]">
                        Running BSP subdivision constraints...
                      </p>
                      <p className="text-xs text-[var(--color-text-muted)] font-mono">
                        {elapsedTime}s elapsed
                      </p>
                    </div>
                  </div>
                )}

                {previewData && (
                  <div
                    className="w-full h-full relative block"
                  >
                     <div className="absolute top-2 left-4 text-white text-xs opacity-60 shadow-lg px-2 rounded-lg py-1 bg-black/40 border border-white/10 z-20 pointer-events-none">
                       {previewData.metadata.project_title} - {previewData.metadata.architectural_style}
                     </div>
                     <div dangerouslySetInnerHTML={{ __html: previewData.preview }} className="w-full h-full" style={{ display: 'block' }} />
                  </div>
                )}
              </div>
            </div>

            {/* Fullscreen Backdrop previously here is moved out to react portal equivalent layer */}

            {/* Metadata Panel */}
            {previewData && (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4 animate-fade-in">
                {/* Room List */}
                <div className="glass-card p-5">
                  <div className="flex justify-between items-center mb-3">
                    <h3 className="text-xs font-semibold text-[var(--color-text-muted)] uppercase tracking-wider">
                      Calculated Space Breakdown
                    </h3>
                    <span className="text-[10px] bg-black/30 px-2 py-1 rounded-md text-[var(--color-accent)] font-mono font-bold">
                      {previewData.metadata.room_count} ROOMS TOTAL
                    </span>
                  </div>
                  <div className="space-y-4 max-h-[260px] overflow-y-auto pr-2">
                    {[...new Set(previewData.metadata.rooms.map((r) => r.level))].sort().map((level) => (
                      <div key={level} className="space-y-2">
                        <div className="text-[10px] tracking-widest text-[#a855f7] font-bold border-b border-[#a855f7]/20 pb-1 mb-2">
                          LEVEL {level}
                        </div>
                        {previewData.metadata.rooms.filter(r => r.level === level).map((room, i) => (
                          <div
                            key={i}
                            className="flex items-center justify-between py-2 px-3 rounded-lg bg-[var(--color-bg-input)] hover:bg-[var(--color-bg-card-hover)] transition-colors"
                          >
                            <span className="text-sm text-[var(--color-text-primary)]">
                              {room.name}
                            </span>
                            <div className="flex flex-col items-end gap-1">
                              <span className="text-[10px] text-[var(--color-text-muted)] font-mono">
                                Target: {room.target_sqft} ft²
                              </span>
                              <span className="text-xs text-[var(--color-cyan)] font-mono font-bold">
                                Actual: {room.actual_sqft} ft²
                              </span>
                            </div>
                          </div>
                        ))}
                      </div>
                    ))}
                  </div>
                </div>

                {/* DXF Details + Download */}
                <div className="glass-card p-5 flex flex-col justify-between">
                  <div>
                    <h3 className="text-xs font-semibold text-[var(--color-text-muted)] uppercase tracking-wider mb-3">
                      DXF Payload Integrity
                    </h3>
                    <div className="space-y-3">
                      <div className="flex justify-between text-sm">
                        <span className="text-[var(--color-text-secondary)]">Format</span>
                        <span className="text-[var(--color-text-primary)] font-mono">AutoCAD DXF AC1015</span>
                      </div>
                      <div className="flex justify-between text-sm">
                        <span className="text-[var(--color-text-secondary)]">Total SQFT</span>
                        <span className="text-[var(--color-success)] font-mono font-bold">{previewData.metadata.footprint.total_sqft}</span>
                      </div>
                      <div className="flex justify-between text-sm">
                        <span className="text-[var(--color-text-secondary)]">Walls Drawn</span>
                        <span className="text-[var(--color-text-primary)] font-mono">{previewData.metadata.wall_count}</span>
                      </div>
                      <div className="flex justify-between text-sm">
                        <span className="text-[var(--color-text-secondary)]">Openings</span>
                        <span className="text-[var(--color-text-primary)] font-mono">{previewData.metadata.opening_count}</span>
                      </div>
                      <div className="flex flex-wrap gap-2 mt-4 pt-3 border-t border-[var(--color-border)]">
                        {previewData.metadata.layers.map((layer) => (
                          <span
                            key={layer}
                            className="px-2 py-1 text-[10px] font-mono rounded-md bg-[var(--color-bg-input)] text-[var(--color-text-muted)] border border-[var(--color-border)]"
                          >
                            {layer}
                          </span>
                        ))}
                      </div>
                    </div>
                  </div>
                  
                  <div className="mt-4">
                    <button
                      id="download-dxf-btn"
                      className="btn-primary w-full"
                      onClick={handleDownload}
                      disabled={status === "downloading"}
                    >
                      <span className="flex items-center justify-center gap-2">
                        {status === "downloading" ? (
                          <>
                            <div className="pulse-loader"><span></span><span></span><span></span></div>
                            Exporting...
                          </>
                        ) : (
                          <>
                            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                              <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
                              <polyline points="7 10 12 15 17 10" />
                              <line x1="12" y1="15" x2="12" y2="3" />
                            </svg>
                            Download strictly layered .DXF
                          </>
                        )}
                      </span>
                    </button>
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>
      </main>
    </div>

    {isFullscreen && previewData && (
      <>
        <div className="fixed inset-0 bg-black/90 z-[998] cursor-pointer" onClick={() => setIsFullscreen(false)} />
        <div className="fixed inset-4 z-[999] flex flex-col bg-[var(--color-bg-primary)] p-4 rounded-xl border border-[var(--color-border)] shadow-2xl">
           <div className="flex items-center justify-between px-6 py-4 border-b border-[var(--color-border)]">
              <div className="flex items-center gap-2">
                <div className="w-6 h-6 rounded-md bg-[#f59e0b]/20 flex items-center justify-center">
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#f59e0b" strokeWidth="2">
                    <rect x="2" y="3" width="20" height="14" rx="2" ry="2" />
                    <line x1="8" y1="21" x2="16" y2="21" />
                    <line x1="12" y1="17" x2="12" y2="21" />
                  </svg>
                </div>
                <h2 className="text-sm font-semibold text-[var(--color-text-primary)] uppercase tracking-wider">
                  Fullscreen Visualizer
                </h2>
              </div>
              <div className="flex items-center gap-4">
                <span className="text-xs text-[var(--color-text-muted)] font-mono">
                   Footprint: {previewData.metadata.footprint.width_ft}&apos; × {previewData.metadata.footprint.length_ft}&apos;
                </span>
                <button
                   onClick={() => setIsFullscreen(false)}
                   className="flex items-center justify-center p-2 rounded-md hover:bg-white/10 transition-colors text-[var(--color-text-muted)] hover:text-white border border-[var(--color-border)] bg-[var(--color-bg-input)]"
                   title="Exit Fullscreen"
                >
                   <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M8 3v3a2 2 0 0 1-2 2H3m18 0h-3a2 2 0 0 1-2-2V3m0 18v-3a2 2 0 0 1 2-2h3M3 16h3a2 2 0 0 1 2 2v3"/></svg>
                </button>
              </div>
            </div>

            <div className="w-full h-full relative block flex-1 max-h-none">
               <div className="absolute top-2 left-4 text-white text-xs opacity-60 shadow-lg px-2 rounded-lg py-1 bg-black/40 border border-white/10 z-20 pointer-events-none">
                 {previewData.metadata.project_title} - {previewData.metadata.architectural_style}
               </div>
               <div dangerouslySetInnerHTML={{ __html: previewData.preview }} className="w-full h-full [&>svg]:w-full [&>svg]:h-full" style={{ display: 'block' }} />
            </div>
        </div>
      </>
    )}
    </>
  );
}

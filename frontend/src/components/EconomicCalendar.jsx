/**
 * EconomicCalendar.jsx — Full-screen economic events calendar.
 *
 * Data: Nasdaq public economic events API (free, no key needed).
 * Impact classification: curated keyword map in the MCP server.
 *
 * Features:
 *  - Week navigation (prev / current / next)
 *  - Day-column grid layout (Mon–Fri)
 *  - Filter chips: impact level + country/region
 *  - Color-coded impact dots (red = high, yellow = medium, green = low)
 *  - Shows Actual · Forecast · Previous for each event
 *  - Click X or press Escape to close
 */

import { useState, useEffect, useCallback } from "react";

const MCP_BASE = import.meta.env.VITE_MCP_URL ?? "/mcp";

// ─── helpers ─────────────────────────────────────────────────────────────────

function getMonday(date) {
  const d = new Date(date);
  const day = d.getDay();
  const diff = day === 0 ? -6 : 1 - day;
  d.setDate(d.getDate() + diff);
  d.setHours(0, 0, 0, 0);
  return d;
}

function addDays(date, n) {
  const d = new Date(date);
  d.setDate(d.getDate() + n);
  return d;
}

function isoDate(date) {
  return date.toISOString().slice(0, 10);
}

function fmtWeekRange(monday) {
  const friday = addDays(monday, 4);
  const opts = { month: "short", day: "numeric" };
  if (monday.getFullYear() !== friday.getFullYear()) {
    return `${monday.toLocaleDateString("en-US", { ...opts, year: "numeric" })} – ${friday.toLocaleDateString("en-US", { ...opts, year: "numeric" })}`;
  }
  if (monday.getMonth() !== friday.getMonth()) {
    return `${monday.toLocaleDateString("en-US", opts)} – ${friday.toLocaleDateString("en-US", { ...opts, year: "numeric" })}`;
  }
  return `${monday.toLocaleDateString("en-US", opts)} – ${friday.getDate()}, ${friday.getFullYear()}`;
}

function fmtDayHeader(date) {
  return date.toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric" });
}

function isToday(dateStr) {
  return dateStr === isoDate(new Date());
}

function fmtTime(gmtStr) {
  if (!gmtStr) return "All Day";
  try {
    const [h, m] = gmtStr.split(":").map(Number);
    const d = new Date();
    d.setUTCHours(h, m, 0, 0);
    return d.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit", hour12: true });
  } catch {
    return gmtStr;
  }
}

// Flag emoji by country name
const COUNTRY_FLAGS = {
  "United States": "🇺🇸", "Euro Zone": "🇪🇺", "Germany": "🇩🇪",
  "France": "🇫🇷", "United Kingdom": "🇬🇧", "Japan": "🇯🇵",
  "China": "🇨🇳", "Canada": "🇨🇦", "Australia": "🇦🇺",
  "Switzerland": "🇨🇭", "New Zealand": "🇳🇿", "Brazil": "🇧🇷",
  "South Korea": "🇰🇷", "Singapore": "🇸🇬", "Italy": "🇮🇹",
  "Spain": "🇪🇸", "Netherlands": "🇳🇱", "Sweden": "🇸🇪",
  "Norway": "🇳🇴", "Denmark": "🇩🇰", "India": "🇮🇳",
  "Mexico": "🇲🇽", "Poland": "🇵🇱", "Russia": "🇷🇺",
  "South Africa": "🇿🇦", "Turkey": "🇹🇷",
};

const IMPACT_CONFIG = {
  high:   { dot: "bg-red-500",    badge: "text-red-400 bg-red-950 border-red-900",    label: "High"   },
  medium: { dot: "bg-yellow-400", badge: "text-yellow-400 bg-yellow-950 border-yellow-900", label: "Med" },
  low:    { dot: "bg-green-500",  badge: "text-green-400 bg-green-950 border-green-900",    label: "Low" },
};

// Countries to surface prominently in the filter
const MAJOR_COUNTRIES = [
  "United States", "Euro Zone", "United Kingdom", "Japan",
  "Germany", "China", "Canada", "Australia",
];

// ─── Sub-components ───────────────────────────────────────────────────────────

function ImpactDot({ impact, size = "md" }) {
  const cfg = IMPACT_CONFIG[impact] || IMPACT_CONFIG.low;
  const sz = size === "sm" ? "w-1.5 h-1.5" : "w-2 h-2";
  return (
    <span className={`inline-block rounded-full shrink-0 ${sz} ${cfg.dot}`} />
  );
}

function EventCard({ event }) {
  const [expanded, setExpanded] = useState(false);
  const cfg = IMPACT_CONFIG[event.impact] || IMPACT_CONFIG.low;
  const flag = COUNTRY_FLAGS[event.country] || "🌐";
  const isReleased = !!event.actual;

  return (
    <div
      className={`rounded-lg border px-2.5 py-2 cursor-pointer transition-colors
        ${event.impact === "high"
          ? "bg-red-950/20 border-red-900/40 hover:border-red-700/60"
          : event.impact === "medium"
          ? "bg-yellow-950/10 border-yellow-900/30 hover:border-yellow-700/50"
          : "bg-[#0d1424] border-[#1f2937] hover:border-[#374151]"
        }`}
      onClick={() => setExpanded(v => !v)}
    >
      {/* Top row: dot + time + flag */}
      <div className="flex items-center gap-1.5 mb-1">
        <ImpactDot impact={event.impact} />
        <span className="text-[10px] text-gray-500 font-mono">{fmtTime(event.time_gmt)}</span>
        <span className="text-[10px] ml-auto">{flag}</span>
      </div>

      {/* Event name */}
      <p className="text-xs text-gray-200 leading-tight font-medium mb-1.5 line-clamp-2">
        {event.event}
      </p>

      {/* Values row */}
      <div className="flex gap-2 flex-wrap">
        {isReleased && (
          <span className={`text-[10px] font-semibold px-1.5 py-0.5 rounded border ${cfg.badge}`}>
            A: {event.actual}
          </span>
        )}
        {event.forecast && (
          <span className="text-[10px] text-blue-400 bg-blue-950/30 border border-blue-900/40 px-1.5 py-0.5 rounded">
            F: {event.forecast}
          </span>
        )}
        {event.previous && (
          <span className="text-[10px] text-gray-500 bg-white/5 border border-white/8 px-1.5 py-0.5 rounded">
            P: {event.previous}
          </span>
        )}
      </div>

      {/* Expandable description */}
      {expanded && event.description && (
        <p className="text-[10px] text-gray-500 mt-2 leading-relaxed border-t border-white/8 pt-2">
          {event.description.slice(0, 300)}{event.description.length > 300 ? "…" : ""}
        </p>
      )}
    </div>
  );
}

// ─── Earnings event card ──────────────────────────────────────────────────────

function EarningsCard({ ev }) {
  const fmtEst = (n) => n != null ? `$${n.toFixed(2)}` : null;
  const fmtRev = (n) => {
    if (n == null) return null;
    if (n >= 1e9) return `$${(n / 1e9).toFixed(1)}B`;
    if (n >= 1e6) return `$${(n / 1e6).toFixed(0)}M`;
    return `$${n}`;
  };
  return (
    <div className="rounded-lg border bg-blue-950/20 border-blue-900/40 px-2.5 py-2">
      <div className="flex items-center justify-between gap-1 mb-1">
        <span className="text-xs font-mono font-bold text-blue-300">{ev.ticker}</span>
        <span className="text-[9px] text-blue-600 bg-blue-950 px-1.5 py-0.5 rounded">Earnings</span>
      </div>
      {ev.company_name && (
        <p className="text-[10px] text-gray-400 truncate mb-1">{ev.company_name}</p>
      )}
      <div className="flex gap-2 flex-wrap text-[10px]">
        {fmtEst(ev.eps_estimate) && (
          <span className="text-gray-500">EPS est: <span className="text-gray-300">{fmtEst(ev.eps_estimate)}</span></span>
        )}
        {fmtRev(ev.revenue_estimate) && (
          <span className="text-gray-500">Rev est: <span className="text-gray-300">{fmtRev(ev.revenue_estimate)}</span></span>
        )}
      </div>
    </div>
  );
}

// ─── Main Component ───────────────────────────────────────────────────────────

export default function EconomicCalendar({ onClose }) {
  const [weekStart, setWeekStart] = useState(() => getMonday(new Date()));
  const [calendarMode, setCalendarMode] = useState("macro"); // "macro" | "earnings"

  // Macro events
  const [events, setEvents] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [impactFilter, setImpactFilter] = useState("all");
  const [countryFilter, setCountryFilter] = useState("all");

  // Earnings events
  const [earningsEvents, setEarningsEvents] = useState([]);
  const [earningsLoading, setEarningsLoading] = useState(false);
  const [earningsError, setEarningsError] = useState(null);

  // Close on Escape
  useEffect(() => {
    const handler = (e) => { if (e.key === "Escape") onClose?.(); };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [onClose]);

  // Fetch macro calendar when week changes
  useEffect(() => {
    const friday = addDays(weekStart, 4);
    const from = isoDate(weekStart);
    const to = isoDate(friday);
    setLoading(true);
    setError(null);

    fetch(`${MCP_BASE}/calendar/economic?date_from=${from}&date_to=${to}`)
      .then((r) => { if (!r.ok) throw new Error(`HTTP ${r.status}`); return r.json(); })
      .then((data) => { setEvents(data.events || []); setLoading(false); })
      .catch((e) => { setError(e.message); setLoading(false); });
  }, [weekStart]);

  // Fetch earnings calendar (lazy — only when tab is opened first time)
  useEffect(() => {
    if (calendarMode !== "earnings" || earningsEvents.length > 0 || earningsLoading) return;
    setEarningsLoading(true);
    setEarningsError(null);
    fetch(`${MCP_BASE}/earnings/calendar`)
      .then(r => { if (!r.ok) throw new Error(`HTTP ${r.status}`); return r.json(); })
      .then(d => { setEarningsEvents(d.events || []); setEarningsLoading(false); })
      .catch(e => { setEarningsError(e.message); setEarningsLoading(false); });
  }, [calendarMode]);

  const prevWeek = useCallback(() => setWeekStart(d => addDays(d, -7)), []);
  const nextWeek = useCallback(() => setWeekStart(d => addDays(d, 7)), []);
  const thisWeek = useCallback(() => setWeekStart(getMonday(new Date())), []);

  // Build day columns
  const days = Array.from({ length: 5 }, (_, i) => addDays(weekStart, i));

  // Group earnings events by date, filtered to current week
  const earningsByDate = {};
  for (const day of days) {
    const key = isoDate(day);
    earningsByDate[key] = earningsEvents.filter(e => e.earnings_date === key);
  }

  // Derive unique countries for filter (major ones first, then others alphabetically)
  const eventCountries = [...new Set(events.map(e => e.country))];
  const filterCountries = [
    ...MAJOR_COUNTRIES.filter(c => eventCountries.includes(c)),
    ...eventCountries.filter(c => !MAJOR_COUNTRIES.includes(c)).sort(),
  ];

  // Apply filters
  const filtered = events.filter(e => {
    if (impactFilter !== "all" && e.impact !== impactFilter) return false;
    if (countryFilter !== "all" && e.country !== countryFilter) return false;
    return true;
  });

  // Group by date
  const byDate = {};
  for (const day of days) {
    const key = isoDate(day);
    byDate[key] = filtered.filter(e => e.date === key);
  }

  const totalHigh = filtered.filter(e => e.impact === "high").length;

  return (
    <div className="fixed inset-0 z-50 bg-[#0a0f1e]/95 backdrop-blur-sm flex flex-col">

      {/* ── Top bar ────────────────────────────────────────────────────────── */}
      <div className="flex-shrink-0 border-b border-[#1f2937] bg-[#0d1117] px-6 py-4">
        <div className="flex items-center justify-between gap-4">

          {/* Title + mode toggle */}
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-indigo-500 to-purple-600 flex items-center justify-center flex-shrink-0">
              <svg className="w-4 h-4 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                  d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
              </svg>
            </div>
            <div>
              <h2 className="text-white font-semibold text-base leading-tight">
                {calendarMode === "macro" ? "Economic Calendar" : "Earnings Calendar"}
              </h2>
              <p className="text-gray-500 text-xs">
                {calendarMode === "macro" ? "Global macro events · Nasdaq Data" : "Upcoming earnings · Top S&P 500 · yfinance"}
              </p>
            </div>
            {/* Mode toggle */}
            <div className="flex gap-1 ml-2 bg-[#0d1117] border border-[#1f2937] rounded-lg p-0.5">
              {[
                { id: "macro",    label: "📊 Macro"    },
                { id: "earnings", label: "💰 Earnings" },
              ].map(m => (
                <button key={m.id} onClick={() => setCalendarMode(m.id)}
                  className={`px-3 py-1 rounded-md text-xs font-medium transition-colors ${
                    calendarMode === m.id
                      ? "bg-[#1f2937] text-white"
                      : "text-gray-500 hover:text-gray-300"
                  }`}>
                  {m.label}
                </button>
              ))}
            </div>
          </div>

          {/* Week navigator */}
          <div className="flex items-center gap-2">
            <button onClick={prevWeek}
              className="w-7 h-7 flex items-center justify-center rounded-md text-gray-400 hover:text-white hover:bg-[#1f2937] transition-colors">
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
              </svg>
            </button>
            <button onClick={thisWeek}
              className="px-3 h-7 text-xs font-medium text-gray-300 bg-[#1f2937] hover:bg-[#374151] rounded-md transition-colors min-w-[160px] text-center">
              {fmtWeekRange(weekStart)}
            </button>
            <button onClick={nextWeek}
              className="w-7 h-7 flex items-center justify-center rounded-md text-gray-400 hover:text-white hover:bg-[#1f2937] transition-colors">
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
              </svg>
            </button>
          </div>

          {/* Stats + close */}
          <div className="flex items-center gap-3">
            {!loading && (
              <span className="text-xs text-gray-500">
                {filtered.length} events
                {totalHigh > 0 && (
                  <span className="ml-2 text-red-400 font-medium">· {totalHigh} high impact</span>
                )}
              </span>
            )}
            <button onClick={onClose}
              className="w-7 h-7 flex items-center justify-center rounded-md text-gray-500 hover:text-white hover:bg-[#1f2937] transition-colors"
              aria-label="Close calendar">
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>
        </div>

        {/* ── Filter row ──────────────────────────────────────────────────── */}
        <div className="flex items-center gap-3 mt-3 flex-wrap">
          {/* Impact filter */}
          <div className="flex items-center gap-1">
            {[
              { id: "all",    label: "All Impact" },
              { id: "high",   label: "🔴 High"   },
              { id: "medium", label: "🟡 Med"    },
              { id: "low",    label: "🟢 Low"    },
            ].map(f => (
              <button key={f.id} onClick={() => setImpactFilter(f.id)}
                className={`px-2.5 py-1 rounded-md text-xs font-medium transition-colors ${
                  impactFilter === f.id
                    ? "bg-[#1f2937] text-white"
                    : "text-gray-500 hover:text-gray-300"
                }`}>
                {f.label}
              </button>
            ))}
          </div>

          <div className="w-px h-4 bg-[#1f2937]" />

          {/* Country filter — scrollable */}
          <div className="flex items-center gap-1 overflow-x-auto pb-0.5 flex-1 min-w-0">
            <button onClick={() => setCountryFilter("all")}
              className={`shrink-0 px-2.5 py-1 rounded-md text-xs font-medium transition-colors ${
                countryFilter === "all" ? "bg-[#1f2937] text-white" : "text-gray-500 hover:text-gray-300"
              }`}>
              🌍 All
            </button>
            {filterCountries.map(c => (
              <button key={c} onClick={() => setCountryFilter(c)}
                className={`shrink-0 px-2.5 py-1 rounded-md text-xs font-medium transition-colors whitespace-nowrap ${
                  countryFilter === c ? "bg-[#1f2937] text-white" : "text-gray-500 hover:text-gray-300"
                }`}>
                {COUNTRY_FLAGS[c] || "🌐"} {c === "United States" ? "USA" : c === "United Kingdom" ? "UK" : c === "Euro Zone" ? "EU" : c}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* ── Calendar grid ──────────────────────────────────────────────────── */}
      <div className="flex-1 overflow-hidden">
        {calendarMode === "earnings" ? (
          earningsLoading ? (
            <div className="flex items-center justify-center h-full">
              <div className="flex flex-col items-center gap-3">
                <div className="flex gap-1">
                  {[0,1,2].map(i => (
                    <div key={i} className="w-2 h-2 rounded-full bg-blue-500 animate-bounce"
                      style={{ animationDelay: `${i * 0.15}s` }} />
                  ))}
                </div>
                <p className="text-gray-500 text-sm">Loading earnings…</p>
                <p className="text-gray-600 text-xs">Fetching dates for ~60 major tickers</p>
              </div>
            </div>
          ) : earningsError ? (
            <div className="flex items-center justify-center h-full">
              <p className="text-red-400 text-sm">Could not load earnings: {earningsError}</p>
            </div>
          ) : (
            <div className="grid grid-cols-5 h-full divide-x divide-[#1f2937]">
              {days.map((day) => {
                const key = isoDate(day);
                const dayEarnings = earningsByDate[key] || [];
                const today = isToday(key);
                return (
                  <div key={key} className="flex flex-col overflow-hidden">
                    <div className={`flex-shrink-0 px-3 py-2.5 border-b border-[#1f2937] ${
                      today ? "bg-blue-950/30" : "bg-[#0d1117]"
                    }`}>
                      <p className={`text-xs font-semibold ${today ? "text-blue-400" : "text-gray-400"}`}>
                        {fmtDayHeader(day)}
                        {today && <span className="ml-1.5 text-[10px] font-normal text-blue-500">Today</span>}
                      </p>
                      <p className="text-[10px] text-gray-600 mt-0.5">
                        {dayEarnings.length} earning{dayEarnings.length !== 1 ? "s" : ""}
                      </p>
                    </div>
                    <div className="flex-1 overflow-y-auto px-2 py-2 space-y-2">
                      {dayEarnings.length === 0 ? (
                        <p className="text-center text-gray-700 text-xs py-8">No earnings</p>
                      ) : (
                        dayEarnings.map((ev, i) => <EarningsCard key={i} ev={ev} />)
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          )
        ) : loading ? (
          <div className="flex items-center justify-center h-full">
            <div className="flex flex-col items-center gap-3">
              <div className="flex gap-1">
                {[0,1,2].map(i => (
                  <div key={i} className="w-2 h-2 rounded-full bg-blue-500 animate-bounce"
                    style={{ animationDelay: `${i * 0.15}s` }} />
                ))}
              </div>
              <p className="text-gray-500 text-sm">Loading calendar…</p>
            </div>
          </div>
        ) : error ? (
          <div className="flex items-center justify-center h-full">
            <p className="text-red-400 text-sm">Could not load calendar: {error}</p>
          </div>
        ) : (
          <div className="grid grid-cols-5 h-full divide-x divide-[#1f2937]">
            {days.map((day) => {
              const key = isoDate(day);
              const dayEvents = byDate[key] || [];
              const today = isToday(key);
              return (
                <div key={key} className="flex flex-col overflow-hidden">
                  {/* Day header */}
                  <div className={`flex-shrink-0 px-3 py-2.5 border-b border-[#1f2937] ${
                    today ? "bg-blue-950/30" : "bg-[#0d1117]"
                  }`}>
                    <p className={`text-xs font-semibold ${today ? "text-blue-400" : "text-gray-400"}`}>
                      {fmtDayHeader(day)}
                      {today && <span className="ml-1.5 text-[10px] font-normal text-blue-500">Today</span>}
                    </p>
                    <p className="text-[10px] text-gray-600 mt-0.5">
                      {dayEvents.length} event{dayEvents.length !== 1 ? "s" : ""}
                      {dayEvents.filter(e => e.impact === "high").length > 0 && (
                        <span className="text-red-500 ml-1">
                          · {dayEvents.filter(e => e.impact === "high").length} high
                        </span>
                      )}
                    </p>
                  </div>

                  {/* Events */}
                  <div className="flex-1 overflow-y-auto px-2 py-2 space-y-2">
                    {dayEvents.length === 0 ? (
                      <p className="text-center text-gray-700 text-xs py-8">No events</p>
                    ) : (
                      dayEvents.map((event, i) => (
                        <EventCard key={i} event={event} />
                      ))
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}
        )}
      </div>

      {/* ── Footer ─────────────────────────────────────────────────────────── */}
      <div className="flex-shrink-0 border-t border-[#1f2937] px-6 py-2 bg-[#0d1117]">
        <p className="text-[10px] text-gray-600 text-center">
          {calendarMode === "macro"
            ? "Data: Nasdaq Economic Calendar · Times shown in local browser time · Click any event for details · Press Esc to close"
            : "Data: Yahoo Finance · Top S&P 500 earnings dates · EPS & Revenue estimates · Press Esc to close"
          }
        </p>
      </div>
    </div>
  );
}

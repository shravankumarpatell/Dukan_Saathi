/**
 * Premium Dark/Light Mode Color Rewrite
 * 
 * Color Theory Approach — "Warm Obsidian":
 * 
 * Drawing from Linear, Notion, Arc, and Apple's Human Interface Guidelines:
 * 
 * DARK MODE PALETTE:
 * ┌─────────────────────────────────────────────────────────────┐
 * │ Layer 0 — Page Background:   #111113  (very dark, tiny warm tint)
 * │ Layer 1 — Card / Sidebar:    #1C1C1E  (iOS elevated surface)
 * │ Layer 2 — Input / Hover:     #2C2C2E  (subtle lift)
 * │ Layer 3 — Active / Pressed:  #3A3A3C  (touch feedback)
 * │ 
 * │ Border — default:            #2C2C2E  (same as layer 2, vanishing)
 * │ Border — prominent:          #3A3A3C  (for cards that need edges)
 * │ 
 * │ Text — primary:              #F5F5F7  (Apple primary text)
 * │ Text — secondary:            #A1A1A6  (balanced muted)
 * │ Text — tertiary:             #6E6E73  (subtle captions)
 * │ 
 * │ Accent — brand/CTA:          #818CF8  (indigo-400, vibrant but comfortable)
 * │ Accent — action/orange:      #FB923C  (orange-400, warm actionable)
 * │ Accent — success:            #34D399  (emerald-400)
 * │ Accent — danger:             #FB7185  (rose-400)
 * │ Accent — warning:            #FBBF24  (amber-400)
 * └─────────────────────────────────────────────────────────────┘
 * 
 * LIGHT MODE PALETTE (refined):
 * ┌─────────────────────────────────────────────────────────────┐
 * │ Page Background:             #F8F8FA  (warm off-white)
 * │ Card / Surface:              #FFFFFF
 * │ Border:                      #E8E8EC  (softer than slate-200)
 * │ Text — primary:              #1C1C1E
 * │ Text — secondary:            #6E6E73
 * │ Accent — brand:              #4F46E5  (indigo-600)
 * │ Accent — action:             #EA580C  (orange-600)
 * └─────────────────────────────────────────────────────────────┘
 */

const fs = require('fs');
const path = require('path');

function walk(dir) {
  let results = [];
  const list = fs.readdirSync(dir);
  list.forEach(function(file) {
    file = path.join(dir, file);
    const stat = fs.statSync(file);
    if (stat && stat.isDirectory()) {
      results = results.concat(walk(file));
    } else if (file.endsWith('.jsx') || file.endsWith('.js')) {
      results.push(file);
    }
  });
  return results;
}

const files = walk('./src');

// Replace patterns in order of specificity (longer/more specific first)
const replacements = [
  // ─── BACKGROUNDS ───
  // Layer 0 — page backgrounds
  ['dark:bg-zinc-900', 'dark:bg-[#111113]'],
  ['dark:bg-[#1f1e1d]', 'dark:bg-[#111113]'],
  ['dark:bg-[#000000]', 'dark:bg-[#111113]'],
  ['dark:bg-[#0a0a0a]', 'dark:bg-[#1C1C1E]'],
  
  // Layer 1 — cards, sidebar, elevated panels
  ['dark:bg-zinc-800', 'dark:bg-[#1C1C1E]'],
  ['dark:bg-[#2b2a29]', 'dark:bg-[#1C1C1E]'],
  ['dark:bg-[#2b2a29]/90', 'dark:bg-[#1C1C1E]/90'],
  ['dark:bg-[#2b2a29]/95', 'dark:bg-[#1C1C1E]/95'],
  
  // Layer 2 — inputs, hover states, muted surfaces
  ['dark:bg-white/5', 'dark:bg-[#2C2C2E]'],
  ['dark:bg-white/10', 'dark:bg-[#3A3A3C]'],
  ['dark:bg-slate-800', 'dark:bg-[#2C2C2E]'],
  ['dark:bg-slate-700', 'dark:bg-[#3A3A3C]'],
  ['dark:bg-slate-600', 'dark:bg-[#3A3A3C]'],
  ['dark:active:bg-slate-800', 'dark:active:bg-[#2C2C2E]'],
  ['dark:hover:bg-white/5', 'dark:hover:bg-[#2C2C2E]'],
  ['dark:hover:bg-slate-800', 'dark:hover:bg-[#2C2C2E]'],
  ['dark:focus:bg-slate-800', 'dark:focus:bg-[#2C2C2E]'],
  
  // Primary button — keep indigo but refined
  ['dark:bg-indigo-500 dark:text-white hover:dark:bg-indigo-400', 'dark:bg-[#818CF8] dark:text-[#111113]'],
  ['dark:bg-white dark:text-zinc-950 hover:dark:bg-zinc-200', 'dark:bg-[#818CF8] dark:text-[#111113]'],
  ['dark:bg-white dark:text-black hover:dark:bg-zinc-200', 'dark:bg-[#818CF8] dark:text-[#111113]'],
  
  // Accent backgrounds (brand)
  ['dark:bg-[#d97757]', 'dark:bg-[#818CF8]'],
  ['dark:bg-[#c4694a]', 'dark:bg-[#6366F1]'],
  ['hover:dark:bg-[#c4694a]', 'hover:dark:bg-[#6366F1]'],
  
  // Semantic muted backgrounds
  ['dark:bg-indigo-900/20', 'dark:bg-[#818CF8]/10'],
  ['dark:bg-indigo-900/30', 'dark:bg-[#818CF8]/10'],
  ['dark:bg-indigo-900/40', 'dark:bg-[#818CF8]/10'],
  ['dark:bg-teal-900/30', 'dark:bg-[#34D399]/10'],
  ['dark:bg-teal-900/40', 'dark:bg-[#34D399]/10'],
  ['dark:bg-rose-900/20', 'dark:bg-[#FB7185]/10'],
  ['dark:bg-rose-900/30', 'dark:bg-[#FB7185]/10'],
  ['dark:bg-rose-900/50', 'dark:bg-[#FB7185]/15'],
  ['dark:bg-amber-900/20', 'dark:bg-[#FBBF24]/10'],
  ['dark:bg-amber-900/40', 'dark:bg-[#FBBF24]/10'],
  ['dark:bg-amber-900/50', 'dark:bg-[#FBBF24]/15'],
  ['dark:bg-violet-900/20', 'dark:bg-[#A78BFA]/10'],
  ['dark:bg-violet-900/40', 'dark:bg-[#A78BFA]/10'],
  ['dark:bg-emerald-900/30', 'dark:bg-[#34D399]/10'],
  
  // Status accent backgrounds (keep branded)
  ['dark:bg-amber-950/90', 'dark:bg-[#1C1C1E]/95'],
  ['dark:bg-amber-600', 'dark:bg-[#FBBF24]'],
  ['dark:bg-orange-500', 'dark:bg-[#FB923C]'],
  ['dark:bg-emerald-500', 'dark:bg-[#34D399]'],
  
  // ─── BORDERS ───
  ['dark:border-zinc-700', 'dark:border-[#2C2C2E]'],
  ['dark:border-white/10', 'dark:border-[#2C2C2E]'],
  ['dark:border-[#3e3c3a]', 'dark:border-[#2C2C2E]'],
  ['dark:border-indigo-500', 'dark:border-[#818CF8]/40'],
  ['dark:border-indigo-600', 'dark:border-[#818CF8]/30'],
  ['dark:border-indigo-800', 'dark:border-[#818CF8]/20'],
  ['dark:border-teal-700', 'dark:border-[#34D399]/30'],
  ['dark:border-amber-800', 'dark:border-[#FBBF24]/30'],
  ['dark:divide-slate-800', 'dark:divide-[#2C2C2E]'],
  ['dark:hover:border-indigo-600', 'dark:hover:border-[#818CF8]/40'],
  ['dark:border-amber-600', 'dark:border-[#FBBF24]/30'],
  
  // ─── TEXT — Primary (headings, values) ───
  ['dark:text-zinc-100', 'dark:text-[#F5F5F7]'],
  ['dark:text-stone-100', 'dark:text-[#F5F5F7]'],
  ['dark:text-white', 'dark:text-[#F5F5F7]'],
  
  // ─── TEXT — Secondary (body, labels) ───
  ['dark:text-zinc-300', 'dark:text-[#A1A1A6]'],
  ['dark:text-stone-300', 'dark:text-[#A1A1A6]'],
  ['dark:text-zinc-400', 'dark:text-[#A1A1A6]'],
  ['dark:text-stone-400', 'dark:text-[#A1A1A6]'],
  ['dark:text-slate-200', 'dark:text-[#A1A1A6]'],
  ['dark:text-slate-300', 'dark:text-[#A1A1A6]'],
  ['dark:text-slate-400', 'dark:text-[#A1A1A6]'],
  ['dark:hover:text-slate-200', 'dark:hover:text-[#F5F5F7]'],
  ['dark:hover:text-slate-300', 'dark:hover:text-[#F5F5F7]'],
  
  // ─── TEXT — Tertiary (captions, muted) ───
  ['dark:text-zinc-500', 'dark:text-[#6E6E73]'],
  ['dark:text-stone-500', 'dark:text-[#6E6E73]'],
  ['dark:text-slate-500', 'dark:text-[#6E6E73]'],
  ['dark:text-slate-600', 'dark:text-[#6E6E73]'],
  ['dark:placeholder-slate-500', 'dark:placeholder-[#6E6E73]'],
  ['dark:placeholder:text-slate-500', 'dark:placeholder:text-[#6E6E73]'],
  
  // ─── TEXT — Semantic accent colors ───
  ['dark:text-indigo-300', 'dark:text-[#818CF8]'],
  ['dark:text-indigo-400', 'dark:text-[#818CF8]'],
  ['dark:text-indigo-500', 'dark:text-[#818CF8]'],
  ['dark:text-orange-400', 'dark:text-[#FB923C]'],
  ['dark:text-orange-500', 'dark:text-[#FB923C]'],
  ['dark:text-emerald-300', 'dark:text-[#34D399]'],
  ['dark:text-emerald-400', 'dark:text-[#34D399]'],
  ['dark:text-rose-300', 'dark:text-[#FB7185]'],
  ['dark:text-rose-400', 'dark:text-[#FB7185]'],
  ['dark:text-amber-300', 'dark:text-[#FBBF24]'],
  ['dark:text-amber-400', 'dark:text-[#FBBF24]'],
  ['dark:text-amber-100', 'dark:text-[#FBBF24]'],
  ['dark:text-amber-200', 'dark:text-[#FBBF24]'],
  ['dark:text-amber-50', 'dark:text-[#F5F5F7]'],
  ['dark:text-amber-500/50', 'dark:text-[#FBBF24]/40'],
  ['dark:text-teal-300', 'dark:text-[#34D399]'],
  ['dark:text-violet-300', 'dark:text-[#A78BFA]'],
  ['dark:text-violet-400', 'dark:text-[#A78BFA]'],
  ['dark:hover:text-red-400', 'dark:hover:text-[#FB7185]'],
  
  // ─── HOVER / FOCUS ───
  ['dark:hover:bg-red-950', 'dark:hover:bg-[#FB7185]/10'],
  ['dark:hover:bg-rose-950/50', 'dark:hover:bg-[#FB7185]/10'],
  ['dark:hover:bg-orange-400', 'dark:hover:bg-[#FB923C]'],
  ['dark:hover:bg-emerald-400', 'dark:hover:bg-[#34D399]'],
  ['dark:focus:border-slate-600', 'dark:focus:border-[#3A3A3C]'],
  
  // ─── RING ───
  ['dark:ring-orange-500/30', 'dark:ring-[#FB923C]/25'],
  
  // ─── MISC ───
  ['dark:border-t-indigo-400', 'dark:border-t-[#818CF8]'],
];

let totalReplacements = 0;

files.forEach(file => {
  let content = fs.readFileSync(file, 'utf8');
  let modified = false;
  
  replacements.forEach(([from, to]) => {
    // Use word-boundary-aware replacement (not regex, just exact string)
    if (content.includes(from)) {
      // Split on the from string and rejoin with to — handles all occurrences
      const parts = content.split(from);
      const count = parts.length - 1;
      if (count > 0) {
        content = parts.join(to);
        totalReplacements += count;
        modified = true;
      }
    }
  });
  
  if (modified) {
    fs.writeFileSync(file, content);
  }
});

console.log(`✅ Premium "Warm Obsidian" palette applied: ${totalReplacements} replacements across ${files.length} files.`);

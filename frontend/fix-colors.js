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

files.forEach(file => {
  let content = fs.readFileSync(file, 'utf8');
  
  // Premium Backgrounds
  // Main background (deep black)
  content = content.replace(/dark:bg-slate-950/g, 'dark:bg-[#000000]');
  // Elevated surfaces (cards/modals)
  content = content.replace(/dark:bg-slate-900/g, 'dark:bg-[#0a0a0a]');
  
  // Premium subtle borders (white/10)
  content = content.replace(/dark:border-slate-800/g, 'dark:border-white/10');
  content = content.replace(/dark:border-slate-700/g, 'dark:border-white/10');
  content = content.replace(/dark:border-slate-600/g, 'dark:border-white/10');
  
  // Refined Typography (zinc)
  content = content.replace(/dark:text-slate-100/g, 'dark:text-zinc-100');
  content = content.replace(/dark:text-slate-200/g, 'dark:text-zinc-300');
  content = content.replace(/dark:text-slate-300/g, 'dark:text-zinc-400');
  content = content.replace(/dark:text-slate-400/g, 'dark:text-zinc-400');
  content = content.replace(/dark:text-slate-500/g, 'dark:text-zinc-500');
  
  // Muted surfaces (inputs, hover states)
  content = content.replace(/dark:bg-slate-800/g, 'dark:bg-white/5');
  content = content.replace(/dark:bg-slate-700/g, 'dark:bg-white/10');
  content = content.replace(/dark:hover:bg-slate-800/g, 'dark:hover:bg-white/5');
  content = content.replace(/dark:active:bg-slate-800/g, 'dark:active:bg-white/5');
  
  // Redesigning primary actions (indigo) for a premium monochrome look
  // Convert primary buttons to white buttons with black text in dark mode
  content = content.replace(/dark:bg-indigo-600/g, 'dark:bg-white dark:text-black hover:dark:bg-zinc-200');
  content = content.replace(/dark:text-indigo-400/g, 'dark:text-zinc-100');
  
  // Secondary muted highlights
  content = content.replace(/dark:bg-indigo-900\/30/g, 'dark:bg-white/5');
  content = content.replace(/dark:bg-indigo-900\/40/g, 'dark:bg-white/5');
  content = content.replace(/dark:bg-indigo-900\/20/g, 'dark:bg-white/5');
  content = content.replace(/dark:border-indigo-800/g, 'dark:border-white/10');
  content = content.replace(/dark:border-indigo-700/g, 'dark:border-white/10');
  
  // Mute other bright colors for dark mode to make it look sophisticated
  // Orange (action buttons) -> more subtle or keep vibrant but with zinc text
  // Let's keep orange as the accent color but make sure it doesn't clash.
  
  fs.writeFileSync(file, content);
});

console.log("Colors updated for premium dark mode.");

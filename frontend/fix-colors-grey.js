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
  
  // Main background (greyish dark) -> zinc-900
  content = content.replace(/dark:bg-\[#000000\]/g, 'dark:bg-zinc-900');
  
  // Elevated surfaces (cards/modals) -> zinc-800
  content = content.replace(/dark:bg-\[#0a0a0a\]/g, 'dark:bg-zinc-800');
  
  // Borders (make them slightly lighter so they show up on gray) -> zinc-700
  content = content.replace(/dark:border-white\/10/g, 'dark:border-zinc-700');
  
  // Restore primary buttons to a soft indigo instead of pure white which might look weird on gray
  content = content.replace(/dark:bg-white dark:text-black hover:dark:bg-zinc-200/g, 'dark:bg-indigo-500 dark:text-white hover:dark:bg-indigo-400');
  
  fs.writeFileSync(file, content);
});

console.log("Colors updated for greyish dark mode.");

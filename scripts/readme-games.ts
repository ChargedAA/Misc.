// Rebuilds the README's game tables from the drill definitions, so they never drift.
//   node scripts/readme-games.ts
import { readFileSync, writeFileSync } from 'node:fs';
import { MINIS } from '../src/minis/index.ts';
import { SKILLS } from '../src/minis/kit.ts';
import { GUIDES } from '../src/minis/groups.ts';

const file = 'README.md';
const md = readFileSync(file, 'utf8');
const start = md.indexOf('## Games');
const end = md.indexOf('## Why these games');
if (start < 0 || end < 0) throw new Error('README sections not found');

// The three original games are not mini-games; keep their rows as they are.
const keep: Record<string, string> = {};
for (const line of md.slice(start, end).split('\n')) {
  const m = /^\| (Reflex|Burst|Climb) \|/.exec(line);
  if (m) keep[m[1]!] = line;
}
const home: Record<string, string> = { Reflex: 'reaction', Burst: 'speed', Climb: 'coordination' };

const input = (e: (typeof MINIS)[number]) =>
  e.input === 'keys' ? `keys${e.minKeys && e.minKeys > 1 ? `, ${e.minKeys}+ keys` : ''}` : e.input === 'both' ? 'keys or tap' : e.input === 'pointer' ? 'mouse or tap' : 'keyboard';

let out = `## Games\n\n${MINIS.length + 3} drills across ${SKILLS.length} skills. Each skill's drills are listed in the order of its groups.\n\n`;
for (const k of SKILLS) {
  out += `### ${k.name}\n\n${GUIDES[k.id].about}\n\n| Game | What it is | Input |\n| --- | --- | --- |\n`;
  for (const [name, row] of Object.entries(keep)) if (home[name] === k.id) out += `${row}\n`;
  const seen = new Set<string>();
  for (const g of GUIDES[k.id].groups) {
    for (const id of g.ids) {
      const e = MINIS.find((m) => m.id === id);
      if (!e || seen.has(id)) continue;
      seen.add(id);
      out += `| ${e.name} | ${e.blurb.replace(/\|/g, '/')} | ${input(e)} |\n`;
    }
  }
  // Anything of this skill not yet in a group still gets a row.
  for (const e of MINIS.filter((m) => m.skill === k.id && !seen.has(m.id))) out += `| ${e.name} | ${e.blurb.replace(/\|/g, '/')} | ${input(e)} |\n`;
  out += '\n';
}
writeFileSync(file, md.slice(0, start) + out + md.slice(end));
console.log(`README: ${MINIS.length + 3} drills in ${SKILLS.length} skills`);

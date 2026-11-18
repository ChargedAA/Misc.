// Prints the README's game list from the registry: node scripts/games-md.ts
import { ENTRIES } from '../src/minis/index.ts';
import { SKILLS } from '../src/minis/kit.ts';

const input = (i: string) => (i === 'pointer' ? 'tap or click' : i === 'both' ? 'keys or tap' : 'keys');
for (const sk of SKILLS) {
  const games = ENTRIES.filter((e) => e.skill === sk.id);
  console.log(`### ${sk.name}\n`);
  console.log('| Game | What it is | Input |\n| --- | --- | --- |');
  for (const g of games) console.log(`| ${g.name} | ${g.blurb} | ${input(g.input)}${g.minKeys && g.minKeys > 1 ? `, ${g.minKeys}+ keys` : ''} |`);
  console.log('');
}

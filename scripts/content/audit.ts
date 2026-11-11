// Prints the bank coverage grid and any audit problems (package L2).
// Run: npm run audit:content. It exits with 1 when a problem is found; thin cells are listed
// but do not fail yet (the bank is still being filled).
import { auditBank, coverageGrid, type AuditItem } from '../../content/audit';
import { validateItem } from '../../content/schema';
import { ALL_QUESTION_TYPES, GRAMMAR_TOPICS } from '../../constants';
import { bankAuditItems } from '../../content/bankItems';

const items: AuditItem[] = bankAuditItems();
const topics = GRAMMAR_TOPICS.filter((t) => t !== 'My own choice');
const cells = coverageGrid(items, topics, ALL_QUESTION_TYPES);

console.log(`Bank: ${items.length} items\n`);
for (const type of ALL_QUESTION_TYPES) {
  console.log(`== ${type} ==`);
  console.log(['Topic'.padEnd(18), 'A1', 'A2', 'B1', 'B2', 'C1', 'C2'].join(' '));
  for (const topic of topics) {
    const row = cells.filter((c) => c.type === type && c.topic === topic).map((c) => String(c.count).padStart(2));
    console.log([topic.padEnd(18), ...row].join(' '));
  }
  console.log('');
}
const thin = cells.filter((c) => c.count < 4);
console.log(`Cells with fewer than 4 items: ${thin.length} of ${cells.length} (${cells.filter((c) => c.count === 0).length} empty)`);

const problems = [
  ...auditBank(items),
  ...items.flatMap((i) => validateItem(i, i.type).errors.map((problem) => ({ type: i.type, text: i.text, problem }))),
];
problems.forEach((p) => console.log(`PROBLEM [${p.type}] ${p.text}\n  ${p.problem}`));
console.log(problems.length ? `\n${problems.length} problem(s).` : '\nNo problems.');
process.exit(problems.length ? 1 : 0);

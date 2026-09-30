import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
const actual = createHash('sha256').update(readFileSync('docs/original-interview-question.md')).digest('hex');
const expected = 'c837475ae6b6564bc46c2e6c7f17756e375ec903cf67938a438ef81c18ec9c75';
if (actual !== expected) throw new Error(`Original requirements integrity failed: ${actual}`);
console.log(`Original requirements intact: ${actual}`);

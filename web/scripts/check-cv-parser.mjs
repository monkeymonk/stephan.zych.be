// Unit-level coverage for web/lib/cvContent.js's parser: check-cv-drift.mjs
// only compares already-parsed output against real content files, so it
// never exercises parseCVFile() against a synthetic fixture and never
// proves the malformed-<sz-tag> build-failure path actually throws. This
// script does both, against throwaway fixture files (not real content).
import { writeFileSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const cvContentPath = path.join(__dirname, '..', 'lib', 'cvContent.js');
const { parseCVFile } = await import(cvContentPath);

const failures = [];
const dir = mkdtempSync(path.join(tmpdir(), 'cv-parser-test-'));

function fixture(name, body) {
  const filePath = path.join(dir, name);
  writeFileSync(filePath, body, 'utf8');
  return filePath;
}

function expect(label, actual, expected) {
  const a = JSON.stringify(actual);
  const e = JSON.stringify(expected);
  if (a !== e) failures.push(`✗ ${label}: got ${a}, want ${e}`);
}

// 1. Well-formed file: front matter scalars, a Core expertise group, a
// Work experience job block, and a paired <sz-tag> all parse correctly.
const wellFormed = fixture(
  'well-formed.md',
  `---
name: Jane Doe
tagline: Staff Engineer
slug: test
label: Test Role
---

Summary paragraph mentioning <sz-tag>Kubernetes</sz-tag> in passing.

## Work experience

### Staff Engineer — Acme Corp
*Ghent, Belgium · 2020 – Present*

Led the platform team.

## Core expertise

### Backend
- Go
- PostgreSQL
`
);
try {
  const parsed = parseCVFile(wellFormed);
  expect('well-formed name', parsed.name, 'Jane Doe');
  expect('well-formed tagline', parsed.tagline, 'Staff Engineer');
  expect('well-formed slug', parsed.slug, 'test');
  expect('well-formed label', parsed.label, 'Test Role');
  expect('well-formed summary count', parsed.summary?.length, 1);
  if (!parsed.summary?.[0]?.includes('<sz-tag>Kubernetes</sz-tag>')) {
    failures.push(`✗ well-formed summary lost its <sz-tag> span: ${JSON.stringify(parsed.summary)}`);
  }
  expect('well-formed experience count', parsed.experience?.length, 1);
  expect('well-formed experience role', parsed.experience?.[0]?.role, 'Staff Engineer');
  expect('well-formed experience company', parsed.experience?.[0]?.company, 'Acme Corp');
  expect('well-formed experience period', parsed.experience?.[0]?.period, '2020 – Present');
  expect('well-formed expertise group count', parsed.expertise?.length, 1);
  expect('well-formed expertise items', parsed.expertise?.[0]?.items, ['Go', 'PostgreSQL']);
} catch (err) {
  failures.push(`✗ well-formed fixture unexpectedly threw: ${err.message}`);
}

// 2. Malformed <sz-tag> in the summary must fail the build loudly, naming
// the file and the offending text — not silently ship broken markup.
const malformed = fixture(
  'malformed.md',
  `---
name: Jane Doe
tagline: Staff Engineer
---

Summary paragraph with an <sz-tag>unclosed span.
`
);
try {
  parseCVFile(malformed);
  failures.push('✗ malformed <sz-tag> fixture did not throw — checkSzTagPairing silently accepted unpaired markup');
} catch (err) {
  if (!err.message.includes('unmatched') || !err.message.includes('sz-tag')) {
    failures.push(`✗ malformed <sz-tag> fixture threw an unexpected error: ${err.message}`);
  }
  if (!err.message.includes(malformed)) {
    failures.push(`✗ malformed <sz-tag> error didn't name the offending file: ${err.message}`);
  }
}

rmSync(dir, { recursive: true, force: true });

if (failures.length > 0) {
  console.error(failures.join('\n'));
  process.exit(1);
}

console.log('✓ cvContent.js parseCVFile() correctly parses front matter/sections and rejects unpaired <sz-tag> markup');
process.exit(0);

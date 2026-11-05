import { execFileSync } from 'node:child_process';
import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import * as sdk from '@trionlabs/stellar8004';
import { describe, expect, it } from 'vitest';
import { AGENT_SKILL_MD } from './agent-skill.js';

// The script agents copy out of /skill.md and run as-is.
const script = AGENT_SKILL_MD.match(/```js\n([\s\S]*?)```/)![1];

describe('/skill.md register.mjs', () => {
	it('is valid JavaScript', () => {
		const file = join(mkdtempSync(join(tmpdir(), 'skill-')), 'register.mjs');
		writeFileSync(file, script);
		execFileSync(process.execPath, ['--check', file]);
	});

	it('imports only names the SDK exports', () => {
		const names = script
			.match(/import \{([^}]*)\} from '@trionlabs\/stellar8004'/)![1]
			.split(',')
			.map((name) => name.trim())
			.filter(Boolean);
		expect(names.length).toBeGreaterThan(0);
		expect(names.filter((name) => !(name in sdk))).toEqual([]);
	});
});

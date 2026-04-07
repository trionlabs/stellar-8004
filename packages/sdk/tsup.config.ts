import { defineConfig } from 'tsup';

export default defineConfig({
	entry: {
		index: 'src/index.ts',
		bindings: 'src/bindings/index.ts',
		api: 'src/api/index.ts',
		'api/explorer': 'src/api/explorer.ts',
		'signers/freighter': 'src/signers/freighter.ts',
		'signers/basic': 'src/signers/basic.ts',
		'storage/auto': 'src/storage/auto.ts',
		'storage/data-uri': 'src/storage/data-uri.ts',
		'storage/pinata': 'src/storage/pinata.ts'
	},
	format: ['esm', 'cjs'],
	dts: true,
	clean: true,
	sourcemap: true,
	treeshake: true,
	splitting: false
});

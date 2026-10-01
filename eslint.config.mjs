import tseslint from 'typescript-eslint';
export default tseslint.config(
  { ignores: ['.cache/**', '**/node_modules/**', '**/dist/**', '**/.next/**', '**/next-env.d.ts', 'coverage/**', 'playwright-report/**', 'test-results/**'] },
  ...tseslint.configs.recommended,
  { files: ['**/*.{ts,tsx}'], rules: { '@typescript-eslint/no-unused-vars': ['error', { argsIgnorePattern: '^_', varsIgnorePattern: '^_' }] } },
);

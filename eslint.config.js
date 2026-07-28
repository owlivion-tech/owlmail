import reactHooks from 'eslint-plugin-react-hooks';
import tseslint from 'typescript-eslint';

// Minimal config: we only care about the Rules of Hooks. A conditional hook
// silently unmounts the whole app in production (React error #310).
export default [
  {
    files: ['src/**/*.{ts,tsx}'],
    languageOptions: {
      parser: tseslint.parser,
      parserOptions: {
        ecmaVersion: 2022,
        sourceType: 'module',
        ecmaFeatures: { jsx: true },
      },
    },
    plugins: { 'react-hooks': reactHooks },
    rules: {
      'react-hooks/rules-of-hooks': 'error',
    },
  },
];

import nextCoreWebVitals from 'eslint-config-next/core-web-vitals';
import nextTypescript from 'eslint-config-next/typescript';

const appSources = [
  'app/**/*.{js,jsx,ts,tsx}',
  'components/**/*.{js,jsx,ts,tsx}',
  'lib/**/*.{js,jsx,ts,tsx}',
  'hooks/**/*.{js,jsx,ts,tsx}',
  'store/**/*.{js,jsx,ts,tsx}',
];

const testSources = [
  '**/__tests__/**/*.{js,jsx,ts,tsx}',
  '**/*.{spec,test}.{js,jsx,ts,tsx}',
  'mocks/**/*.{js,jsx,ts,tsx}',
  'test/**/*.{js,jsx,ts,tsx}',
];

export default [
  {
    ignores: [
      '.next/**',
      'node_modules/**',
      'coverage/**',
      'next-env.d.ts',
      '**/*.d.ts',
    ],
  },
  ...nextCoreWebVitals,
  ...nextTypescript,
  {
    files: appSources,
    rules: {
      // Wallet and contract code must never evaluate untrusted strings.
      'no-eval': 'error',
      'no-implied-eval': 'error',
      'no-new-func': 'error',
      'no-console': ['warn', { allow: ['warn', 'error'] }],
      '@typescript-eslint/no-explicit-any': 'warn',
      '@typescript-eslint/no-unused-vars': [
        'error',
        {
          argsIgnorePattern: '^_',
          varsIgnorePattern: '^_',
          caughtErrors: 'none',
        },
      ],
      // React Compiler advisory rules require a separate refactor pass. They
      // are tracked outside this lint gate so the gate can block real issues.
      'react-hooks/set-state-in-effect': 'off',
      'react-hooks/purity': 'off',
      'react-hooks/preserve-manual-memoization': 'off',
      'react-hooks/static-components': 'off',
      'no-restricted-properties': [
        'error',
        {
          object: 'Keypair',
          property: 'fromSecret',
          message: 'Secret keys must not be used in frontend code.',
        },
        {
          object: 'StellarSdk.Keypair',
          property: 'fromSecret',
          message: 'Secret keys must not be used in frontend code.',
        },
      ],
    },
  },
  {
    files: testSources,
    rules: {
      '@typescript-eslint/no-explicit-any': 'off',
      '@typescript-eslint/no-unused-vars': 'off',
      'no-console': 'off',
    },
  },
];

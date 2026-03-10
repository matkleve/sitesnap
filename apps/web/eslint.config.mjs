import tseslint from 'typescript-eslint';

const maintainabilityGuidance = {
  'max-lines': [
    'warn',
    {
      max: 400,
      skipBlankLines: true,
      skipComments: true,
    },
  ],
  'max-lines-per-function': [
    'warn',
    {
      max: 80,
      skipBlankLines: true,
      skipComments: true,
      IIFEs: true,
    },
  ],
  complexity: ['warn', 10],
};

export default tseslint.config(
  {
    ignores: ['dist/**', 'coverage/**', 'node_modules/**', 'src/**/*.spec.ts'],
  },
  {
    files: ['src/**/*.ts'],
    languageOptions: {
      parser: tseslint.parser,
      ecmaVersion: 'latest',
      sourceType: 'module',
    },
    rules: maintainabilityGuidance,
  },
);

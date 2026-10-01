module.exports = {
  testEnvironment: 'node',
  roots: ['<rootDir>/apps/api/src', '<rootDir>/tests'],
  testMatch: ['<rootDir>/apps/api/src/**/*.spec.ts', '<rootDir>/tests/**/*.spec.ts'],
  testPathIgnorePatterns: ['/node_modules/', '/dist/', '/tests/e2e/'],
  transform: { '^.+\\.tsx?$': ['ts-jest', { tsconfig: '<rootDir>/tsconfig.test.json' }] },
  moduleNameMapper: {
    '^@coldproof/(.*)$': '<rootDir>/packages/$1/src/index.ts',
    '^@nestjs/testing$': '<rootDir>/node_modules/@nestjs/testing',
    '^@nestjs/(.*)$': '<rootDir>/apps/api/node_modules/@nestjs/$1',
    '^@prisma/client$': '<rootDir>/apps/api/node_modules/@prisma/client',
    '^class-validator$': '<rootDir>/apps/api/node_modules/class-validator',
    '^class-transformer$': '<rootDir>/apps/api/node_modules/class-transformer',
  },
  collectCoverageFrom: ['apps/api/src/**/*.ts', 'packages/*/src/**/*.ts'],
};

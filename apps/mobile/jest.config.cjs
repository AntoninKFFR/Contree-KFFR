module.exports = {
  preset: "jest-expo/ios",
  testMatch: ["**/tests/**/*.test.tsx"],
  moduleNameMapper: { "^@/(.*)$": "<rootDir>/src/$1" },
  clearMocks: true,
};

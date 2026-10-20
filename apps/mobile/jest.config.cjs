module.exports = {
  preset: "jest-expo/ios",
  testMatch: ["**/tests/**/*.test.tsx"],
  moduleNameMapper: {
    "^@/engine/(.*)$": "<rootDir>/../../engine/$1",
    "^@/lib/preferences/(.*)$": "<rootDir>/../../lib/preferences/$1",
    "^@/lib/solo/(.*)$": "<rootDir>/../../lib/solo/$1",
    "^@/lib/(trickPresentation|soloBotPacing|soloLastTrick)$": "<rootDir>/../../lib/$1",
    "^@/(.*)$": "<rootDir>/src/$1",
  },
  clearMocks: true,
};

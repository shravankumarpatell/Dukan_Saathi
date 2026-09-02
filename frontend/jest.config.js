module.exports = {
  testEnvironment: "jsdom",
  testMatch: ["**/src/lib/**/*.test.js", "**/src/services/**/*.test.js"],
  moduleNameMapper: {
    "^@/(.*)$": "<rootDir>/src/$1",
  },
  transform: {
    "^.+\\.jsx?$": [
      "babel-jest",
      {
        presets: [["@babel/preset-env", { targets: { node: "current" } }]],
      },
    ],
  },
};

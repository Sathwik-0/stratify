import nextVitals from "eslint-config-next/core-web-vitals";

const eslintConfig = [
  ...nextVitals,
  {
    ignores: [
      ".next/**",
      "node_modules/**",
    ],
    rules: {
      "react/no-unescaped-entities": "off",
    },
  },
];

export default eslintConfig;

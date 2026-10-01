import { FlatCompat } from "@eslint/eslintrc";
import js from "@eslint/js";
import typescriptEslint from "@typescript-eslint/eslint-plugin";
import vue from "eslint-plugin-vue";
import globals from "globals";
import path from "node:path";
import { fileURLToPath } from "node:url";
import autoEslint from "./auto-eslint.mjs";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const compat = new FlatCompat({
  baseDirectory: __dirname,
  recommendedConfig: js.configs.recommended,
  allConfig: js.configs.all,
});

export default [
  {
    ignores: [
      "**/node_modules",
      "**/dist",
      "**/out",
      "**/.gitignore",
      "**/docs",
      "**/auto-imports.d.ts",
      "**/components.d.ts",
      "native/**/index.d.ts",
    ],
  },
  ...compat.extends("eslint:recommended", "plugin:@typescript-eslint/recommended"),
  // Vue 单文件组件基础规则集（含 vue-eslint-parser，<script lang="ts"> 由下方 parserOptions 指定 TS 解析）
  // 规则仅作用于 .vue，避免 vue 插件规则误伤 .ts 文件
  ...vue.configs["flat/essential"].map((config) =>
    config.rules ? { ...config, files: ["**/*.vue"] } : config,
  ),
  {
    plugins: {
      "@typescript-eslint": typescriptEslint,
      vue,
    },

    languageOptions: {
      globals: {
        ...globals.browser,
        ...globals.node,
        ...autoEslint.globals,
      },

      ecmaVersion: "latest",
      sourceType: "module",

      parserOptions: {
        parser: "@typescript-eslint/parser",
      },
    },

    rules: {
      "@typescript-eslint/no-explicit-any": "off",
      "vue/multi-word-component-names": "off",
      "@typescript-eslint/no-unused-vars": [
        "warn",
        {
          varsIgnorePattern: "^_",
          argsIgnorePattern: "^_",
        },
      ],
    },
  },
  {
    // .vue 内的 TS 类型引用由 vue-tsc 校验；no-undef 无法识别类型名（与 .ts 的处理保持一致，统一关闭）
    files: ["**/*.vue"],
    rules: {
      "no-undef": "off",
    },
  },
  {
    files: [".github/scripts/prepare-release-assets.cjs"],

    languageOptions: {
      globals: { ...globals.node },
      ecmaVersion: 5,
      sourceType: "commonjs",
    },

    rules: {
      "@typescript-eslint/no-require-imports": "off",
    },
  },
  {
    files: ["**/.eslintrc.{js,cjs}"],

    languageOptions: {
      globals: { ...globals.node },
      ecmaVersion: 5,
      sourceType: "commonjs",
    },
  },
];

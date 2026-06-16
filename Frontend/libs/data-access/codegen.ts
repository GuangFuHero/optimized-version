import type { CodegenConfig } from '@graphql-codegen/cli';

/**
 * GraphQL Code Generator 設定
 *
 * 從 GraphQL schema 自動生成 TypeScript 型別與 typed document nodes（可直接給 urql 使用）。
 * 生成的檔案位於 `src/__generated__/`，不應手動修改。
 *
 * 執行：pnpm codegen
 * 預設讀取 libs/data-access/schema.graphql（由 backend 匯出）。
 */
const config: CodegenConfig = {
  // 優先使用本地 SDL 檔（由 backend 匯出），避免 codegen 每次都需要後端在線。
  schema: 'libs/data-access/schema.graphql',

  // 掃描 src/graphql/**/*.graphql 作為 operation documents
  documents: ['libs/data-access/src/graphql/**/*.graphql'],

  generates: {
    // 輸出目錄（自動生成，請勿手動編輯）
    'libs/data-access/src/graphql/__generated__/': {
      preset: 'client',
      config: {
        scalars: {
          // 從 geojson 模組匯入 Geometry，避免依賴不存在的全域 GeoJSON namespace
          GeoJSON: {
            input: 'geojson#Geometry',
            output: 'geojson#Geometry',
          },
          // UUID scalar 對應 string
          UUID: 'string',
        },
        // urql 直接使用 typed document node（無需額外 runtime plugin）
        documentMode: 'documentNode',
        // 使用 fragment masking（型別安全，推薦）
        // 若需要停用改為 false
        fragmentMasking: { unmaskFunctionName: 'getFragmentData' },
        // 生成 enum 為 TypeScript const enum（更好的 tree-shaking）
        enumsAsConst: true,
        // 生成 immutable types（安全性）
        immutableTypes: false,
      },
      presetConfig: {
        gqlTagName: 'graphql',
      },
    },
  },

  // 忽略生成目錄的 lint
  hooks: {
    afterAllFileWrite: ['eslint --fix'],
  },
};

export default config;

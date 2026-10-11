# 此目錄由 `pnpm codegen` 自動生成，請勿手動編輯

schema 來源是 `libs/data-access/src/graphql/schema.graphql`（後端匯出的 SDL，不需要後端在線）。
後端 GraphQL 有變動時，先從 `Backend/` 重新匯出 schema，再跑 codegen：

```sh
# 在 Backend/
PYTHONPATH=. ENV=testing .venv/bin/python -c \
  "from app.graphql.schema import schema; print(schema.as_str())" \
  > ../Frontend/libs/data-access/src/graphql/schema.graphql

# 在 Frontend/
pnpm codegen
pnpm exec prettier --write libs/data-access/src/graphql/__generated__
```

# SBOM（軟體物料清單）

這個資料夾放各版本的 SBOM：這個 repo 用到的每一個第三方套件、容器映像與字型，各自的版本、授權、雜湊，以及誰引用了誰。

## 各版本

| 資料夾 | 版本 | Commit | 說明 |
|---|---|---|---|
| `v0.1.0-beta.14/` | v0.1.0-beta.14 | `cae08287` | 送源碼檢測的版本，對應 release 附件 `optimized-version-v0.1.0-beta.14-source-for-scan.zip` |

每個版本三個檔：

| 檔案 | 內容 |
|---|---|
| `sbom-<版本>.cdx.json` | CycloneDX 1.6 JSON，給工具讀，含完整相依關係圖 |
| `元件SBOM表-<版本>.xlsx` | 中文表格：說明、前端套件、後端套件、容器與其他元件、授權統計 |
| `backend-resolved-requirements.txt` | 後端相依的解析結果（含雜湊）。後端沒有鎖定檔，後端版本以這份為準 |

## 涵蓋範圍

- 前端：`Frontend/pnpm-lock.yaml` 鎖定的全部套件，含前台、管理平台、共用程式庫與開發工具。
- 後端：`Backend/pyproject.toml` 的 `dependencies` 與 `dev` 群組，展開到所有間接相依。
- 其他：Dockerfile 與 docker compose 用到的容器映像、映像裡另外安裝的作業系統套件、網站用的字型。

每個套件標成「執行期」或「開發／建置」（後端是「開發／測試」）。執行期是正式環境安裝時會裝進來的套件，範圍比實際打包進網站的檔案大。

不在範圍內的：已知漏洞（CVE）資訊、容器映像裡的作業系統套件。

## 怎麼重新產生

需要 git、node（用 npx 跑 pnpm）、docker、python 3.11 以上。在 repo 根目錄執行，`TAG` 換成要產生的版本。`make_sbom.py` 會連到 npm 與 PyPI 查授權、作者與雜湊。

先取出那個版本的原始碼：

```bash
TAG=v0.1.0-beta.14
OUT=$(mktemp -d); mkdir -p "$OUT/src" "$OUT/fe" "$OUT/be"
git archive "$TAG" Frontend Backend/pyproject.toml | tar -x -C "$OUT/src"
COMMIT=$(git rev-list -n1 "$TAG")
TAG_TIME=$(TZ=UTC git log -1 --date=format-local:%Y-%m-%dT%H:%M:%SZ --format=%cd "$TAG")
```

前端：照鎖定檔安裝並匯出授權。pnpm 版本照 `Frontend/package.json` 的 `packageManager`；`--ignore-scripts` 不執行任何套件的安裝腳本。

```bash
(cd "$OUT/src/Frontend" \
  && npx -y pnpm@11.24.0 install --frozen-lockfile --ignore-scripts \
  && npx -y pnpm@11.24.0 licenses list -r --json > "$OUT/fe/lic-prod.json" \
  && npx -y pnpm@11.24.0 licenses list -r --dev --json > "$OUT/fe/lic-dev.json")
```

後端：用那個 commit 的時間固定解析結果（`--exclude-newer`），之後重跑也會得到同一組版本。`pyproject.toml` 指定了 `readme`，所以要放一個空的 `README.md` 才能解析。記下第一行印出的 uv 版本。

```bash
cp "$OUT/src/Backend/pyproject.toml" "$OUT/be/" && touch "$OUT/be/README.md"
docker run --rm -v "$OUT/be:/w" -w /w ghcr.io/astral-sh/uv:0.13.6-python3.13-trixie-slim sh -c "
  uv --version
  uv pip compile pyproject.toml --universal --python-version 3.13 --exclude-newer $TAG_TIME --generate-hashes --no-header --annotation-style line -o runtime.txt
  uv pip compile pyproject.toml --group dev --universal --python-version 3.13 --exclude-newer $TAG_TIME --no-header --annotation-style line -o all.txt"
```

產生 JSON 與表格。`make_sbom.py` 只用標準函式庫；`make_table.py` 要 openpyxl。`--zip-name`、`--zip-sha256` 填 release 附件的原始碼壓縮檔與它的 SHA-256（`shasum -a 256 <檔案>`）。

```bash
python3 -I SBOM/tools/make_sbom.py --lock "$OUT/src/Frontend/pnpm-lock.yaml" \
  --fe-licenses "$OUT/fe/lic-prod.json" "$OUT/fe/lic-dev.json" \
  --py-runtime "$OUT/be/runtime.txt" --py-all "$OUT/be/all.txt" \
  --pyproject "$OUT/src/Backend/pyproject.toml" --cache "$OUT/cache" --out "$OUT/out" \
  --version "$TAG" --commit "$COMMIT" --resolved-at "$TAG_TIME" \
  --pnpm-version 11.24.0 --uv-version <uv 版本>

python3 -m venv "$OUT/venv" && "$OUT/venv/bin/pip" install -q openpyxl
mkdir -p "SBOM/$TAG"
"$OUT/venv/bin/python" SBOM/tools/make_table.py --rows "$OUT/out/_rows.json" \
  --out "SBOM/$TAG/元件SBOM表-$TAG.xlsx" --cdx-name "sbom-$TAG.cdx.json" \
  --zip-name <原始碼壓縮檔名> --zip-sha256 <壓縮檔的 SHA-256> --date "$(date +%F)"
cp "$OUT/out/sbom-$TAG.cdx.json" "SBOM/$TAG/"
cp "$OUT/be/runtime.txt" "SBOM/$TAG/backend-resolved-requirements.txt"
```

`make_sbom.py` 最後會印出沒有授權資料的套件。遇到時看該套件的 LICENSE 檔，把結果加進 `LICENSE_OVERRIDES`（前端）或 `PY_LICENSE_OVERRIDES`（後端）再重跑。容器映像、字型這些不在鎖定檔裡的元件寫在 `OTHER_COMPONENTS`，Dockerfile、docker compose 或字型有改時要跟著改。

## 怎麼確認

- 前端「執行期」是走 `pnpm-lock.yaml` 的相依圖判斷的。可以另外用 `pnpm install --frozen-lockfile --ignore-scripts --prod` 裝一次，比對 `node_modules/.pnpm` 裡的套件：應該跟表上的執行期套件一樣，只差在別的作業系統、CPU 才會裝的預編譯檔（表上標「平台限定」）。
- JSON 可以用 CycloneDX 官方的 1.6 schema 驗證。
- 表格的數量與授權統計都是公式，打開時會從套件清單重新計算。

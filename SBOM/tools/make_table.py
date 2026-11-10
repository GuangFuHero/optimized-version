#!/usr/bin/env python3
"""把 make_sbom.py 的 _rows.json 排成中文 SBOM 表（xlsx）。需要 openpyxl。

用法：
  python make_table.py --rows <out>/_rows.json --out <檔名>.xlsx \
      --zip-name <原始碼壓縮檔名> --zip-sha256 <雜湊> --cdx-name <CycloneDX 檔名>
"""

import argparse
import json
from collections import Counter
from pathlib import Path

from openpyxl import Workbook
from openpyxl.styles import Alignment, Border, Font, PatternFill, Side
from openpyxl.utils import get_column_letter

FONT = "Arial"
F_BASE = Font(name=FONT, size=10)
F_BOLD = Font(name=FONT, size=10, bold=True)
F_TITLE = Font(name=FONT, size=14, bold=True)
F_H2 = Font(name=FONT, size=11, bold=True)
F_MUTED = Font(name=FONT, size=9, color="666666")
FILL_HEAD = PatternFill("solid", start_color="E7EAEE")
FILL_KEY = PatternFill("solid", start_color="F5F6F8")
THIN = Side(style="thin", color="C9CED6")
BORDER = Border(bottom=THIN)
WRAP_TOP = Alignment(wrap_text=True, vertical="top")
TOP = Alignment(vertical="top")

SCOPE_FE = {"runtime": "執行期", "dev": "開發／建置"}
SCOPE_BE = {"runtime": "執行期", "dev": "開發／測試"}
WORKSPACE = {
    ".": "根目錄（開發工具）",
    "apps/demo": "前台 apps/demo",
    "apps/admin": "管理平台 apps/admin",
    "libs/ui": "共用介面 libs/ui",
    "libs/modules": "功能模組 libs/modules",
    "libs/data-access": "資料存取 libs/data-access",
}

FE_SHEET, BE_SHEET, OT_SHEET = "前端套件", "後端套件", "容器與其他元件"


def ref(sheet, col):
    return f"'{sheet}'!${col}:${col}"


def write_table(ws, headers, rows, widths, wrap_cols=()):
    ws.append(headers)
    for c in range(1, len(headers) + 1):
        cell = ws.cell(row=1, column=c)
        cell.font = F_BOLD
        cell.fill = FILL_HEAD
        cell.alignment = Alignment(vertical="center", wrap_text=True)
        cell.border = BORDER
    for r in rows:
        # 空字串一律寫成空白儲存格，不然 COUNTA 會把它算成有值
        ws.append([None if v == "" else v for v in r])
    for row in ws.iter_rows(min_row=2, max_row=ws.max_row):
        for cell in row:
            cell.font = F_BASE
            cell.alignment = WRAP_TOP if cell.column in wrap_cols else TOP
    for i, w in enumerate(widths, start=1):
        ws.column_dimensions[get_column_letter(i)].width = w
    ws.freeze_panes = "C2"
    ws.auto_filter.ref = f"A1:{get_column_letter(len(headers))}{ws.max_row}"
    ws.row_dimensions[1].height = 30


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--rows", required=True)
    ap.add_argument("--out", required=True)
    ap.add_argument("--zip-name", required=True)
    ap.add_argument("--zip-sha256", required=True)
    ap.add_argument("--cdx-name", required=True)
    ap.add_argument("--date", required=True, help="表格上寫的產生日期（YYYY-MM-DD）")
    args = ap.parse_args()

    data = json.loads(Path(args.rows).read_text(encoding="utf-8"))
    meta, fe, be, other = data["meta"], data["frontend"], data["backend"], data["other"]

    wb = Workbook()

    # ------------------------------------------------------------------ 前端
    ws_fe = wb.active
    ws_fe.title = FE_SHEET
    fe_rows = []
    for i, r in enumerate(sorted(fe, key=lambda x: (x["scope"] != "runtime", x["name"].lower(), x["version"])), start=1):
        fe_rows.append([
            i,
            r["name"],
            r["version"],
            SCOPE_FE[r["scope"]],
            "直接" if r["direct"] else "間接",
            "、".join(WORKSPACE.get(w, w) for w in r["workspaces"]),
            r["license"],
            r.get("license_note", ""),
            r["author"],
            r["platform"],
            r["purl"],
            r["hash_alg"],
            r["hash"],
            r["description"],
            r["homepage"],
        ])
    write_table(
        ws_fe,
        ["項次", "套件名稱", "版本", "使用範圍", "相依關係", "直接引用的模組", "授權", "授權備註", "作者／維護者", "平台限定（OS／CPU／libc）", "套件識別碼（purl）", "雜湊演算法", "雜湊值（npm 套件檔）", "說明", "首頁"],
        fe_rows,
        [6, 34, 12, 11, 9, 28, 22, 24, 22, 18, 44, 10, 40, 40, 36],
        wrap_cols=(6, 8),
    )

    # ------------------------------------------------------------------ 後端
    ws_be = wb.create_sheet(BE_SHEET)
    be_rows = []
    for i, r in enumerate(sorted(be, key=lambda x: (x["scope"] != "runtime", x["name"])), start=1):
        be_rows.append([
            i,
            r["name"],
            r["version"],
            SCOPE_BE[r["scope"]],
            "直接" if r["direct"] else "間接",
            r.get("declared", ""),
            "、".join(r["via"]),
            r["license"],
            r.get("license_note", ""),
            r["author"],
            r["marker"],
            r["purl"],
            r["hash_alg"],
            r["hash"],
            r.get("hash_file", ""),
            r["description"],
            r["homepage"],
        ])
    write_table(
        ws_be,
        ["項次", "套件名稱", "版本", "使用範圍", "相依關係", "pyproject.toml 宣告", "被哪些套件引用", "授權", "授權備註", "作者／維護者", "安裝條件", "套件識別碼（purl）", "雜湊演算法", "雜湊值（PyPI 原始碼包）", "雜湊對應檔案", "說明", "首頁"],
        be_rows,
        [6, 24, 14, 11, 9, 26, 26, 22, 30, 22, 22, 34, 10, 40, 30, 40, 36],
        wrap_cols=(7, 9),
    )

    # ------------------------------------------------------------------ 其他
    ws_ot = wb.create_sheet(OT_SHEET)
    ot_rows = [[i, o["group"], o["name"], o["version"], o["license"], o["supplier"], o["source"], o["purl"], o["note"]] for i, o in enumerate(other, start=1)]
    write_table(
        ws_ot,
        ["項次", "類別", "名稱", "版本／tag", "授權", "供應者", "出現位置", "套件識別碼（purl）", "備註"],
        ot_rows,
        [6, 12, 26, 26, 30, 24, 36, 34, 48],
        wrap_cols=(4, 5, 6, 7, 9),
    )
    ws_ot.freeze_panes = "D2"

    # ------------------------------------------------------------------ 授權統計（公式）
    ws_lic = wb.create_sheet("授權統計")
    lic_count = Counter(r["license"] for r in fe) + Counter(r["license"] for r in be)
    licenses = [k for k, _ in sorted(lic_count.items(), key=lambda kv: (-kv[1], kv[0]))]
    ws_lic.append(["授權", "前端・執行期", "前端・開發／建置", "後端・執行期", "後端・開發／測試", "合計"])
    for lic in licenses:
        n = ws_lic.max_row + 1
        ws_lic.append([
            lic,
            f'=COUNTIFS({ref(FE_SHEET, "G")},$A{n},{ref(FE_SHEET, "D")},"執行期")',
            f'=COUNTIFS({ref(FE_SHEET, "G")},$A{n},{ref(FE_SHEET, "D")},"開發／建置")',
            f'=COUNTIFS({ref(BE_SHEET, "H")},$A{n},{ref(BE_SHEET, "D")},"執行期")',
            f'=COUNTIFS({ref(BE_SHEET, "H")},$A{n},{ref(BE_SHEET, "D")},"開發／測試")',
            f"=SUM(B{n}:E{n})",
        ])
    last = ws_lic.max_row
    ws_lic.append(["合計"] + [f"=SUM({c}2:{c}{last})" for c in "BCDEF"])
    for row in ws_lic.iter_rows(min_row=1, max_row=ws_lic.max_row):
        for cell in row:
            cell.font = F_BASE
    for cell in ws_lic[1]:
        cell.font = F_BOLD
        cell.fill = FILL_HEAD
        cell.border = BORDER
    for cell in ws_lic[ws_lic.max_row]:
        cell.font = F_BOLD
        cell.border = Border(top=THIN)
    ws_lic.column_dimensions["A"].width = 46
    for c in "BCDEF":
        ws_lic.column_dimensions[c].width = 16
    ws_lic.freeze_panes = "B2"
    ws_lic.append([])
    ws_lic.append(["授權名稱照各套件中繼資料原樣（npm package.json、PyPI）。「BSD」表示套件只寫 BSD、未寫條款數。"])
    ws_lic.cell(row=ws_lic.max_row, column=1).font = F_MUTED

    # ------------------------------------------------------------------ 說明（放第一頁）
    ws = wb.create_sheet("說明", 0)
    ws.column_dimensions["A"].width = 26
    ws.column_dimensions["B"].width = 96

    def line(label="", value="", font=F_BASE, label_font=F_BOLD, fill=None):
        ws.append([label, value])
        r = ws.max_row
        ws.cell(row=r, column=1).font = label_font
        ws.cell(row=r, column=2).font = font
        ws.cell(row=r, column=1).alignment = TOP
        ws.cell(row=r, column=2).alignment = WRAP_TOP
        if fill:
            ws.cell(row=r, column=1).fill = fill
        return r

    def heading(text):
        ws.append([])
        ws.append([text])
        ws.cell(row=ws.max_row, column=1).font = F_H2

    ws.append(["元件 SBOM 表（軟體物料清單）"])
    ws.cell(row=1, column=1).font = F_TITLE
    ws.append([])
    line("案名", "運用公民科技強化公共服務韌性（ZE115012）", fill=FILL_KEY)
    line("文件名稱", "元件 SBOM 表", fill=FILL_KEY)
    line("受測標的", f"{meta['repo']}（前台、管理平台、後端 API）", fill=FILL_KEY)
    line("版本", meta["version"], fill=FILL_KEY)
    line("Commit", meta["commit"], fill=FILL_KEY)
    line("原始碼壓縮檔", f"{args.zip_name}\nSHA-256：{args.zip_sha256}", fill=FILL_KEY)
    line("本專案授權", "GPL-3.0-only", fill=FILL_KEY)
    line("產生日期", args.date, fill=FILL_KEY)
    line("機器可讀版本", f"{args.cdx_name}（CycloneDX 1.6 JSON，含完整相依關係圖，已通過 CycloneDX 1.6 schema 驗證）", fill=FILL_KEY)

    heading("數量")
    line("前端套件", f"=COUNTA({ref(FE_SHEET, 'B')})-1")
    line("　其中執行期", f'=COUNTIF({ref(FE_SHEET, "D")},"執行期")')
    line("　其中開發／建置", f'=COUNTIF({ref(FE_SHEET, "D")},"開發／建置")')
    line("　其中直接相依", f'=COUNTIF({ref(FE_SHEET, "E")},"直接")')
    fe_last = len(fe) + 1
    line("　其中平台限定", f"=COUNTA('{FE_SHEET}'!$J$2:$J${fe_last})")
    line("後端套件", f"=COUNTA({ref(BE_SHEET, 'B')})-1")
    line("　其中執行期", f'=COUNTIF({ref(BE_SHEET, "D")},"執行期")')
    line("　其中開發／測試", f'=COUNTIF({ref(BE_SHEET, "D")},"開發／測試")')
    line("　其中直接相依", f'=COUNTIF({ref(BE_SHEET, "E")},"直接")')
    line("容器映像與其他元件", f"=COUNTA({ref(OT_SHEET, 'C')})-1")
    for r in range(ws.max_row - 9, ws.max_row + 1):
        ws.cell(row=r, column=2).alignment = Alignment(horizontal="left", vertical="top")
        ws.cell(row=r, column=1).font = F_BASE

    heading("工作表")
    line(FE_SHEET, "Frontend/pnpm-lock.yaml 鎖定的全部 npm 套件（前台、管理平台、共用程式庫與開發工具）。")
    line(BE_SHEET, "Backend/pyproject.toml 的執行期相依與 dev 群組，展開到所有間接相依。")
    line(OT_SHEET, "不經套件管理器的元件：容器基礎映像、作業系統套件、字型。")
    line("授權統計", "依授權與使用範圍計數，數字由公式從前兩張表算出。")

    heading("產生方式")
    line("前端", f"讀取 Frontend/pnpm-lock.yaml（lockfile 9.0）的全部套件與相依圖。授權、作者取自套件的 package.json（pnpm {meta['pnpm_version']} `pnpm licenses list`），本機沒有安裝的平台限定套件改查 npm registry。雜湊為鎖定檔記載的 npm 套件檔 SHA-512。")
    line("後端", f"Backend 沒有鎖定檔（uv.lock／requirements.txt），pyproject.toml 只寫版本下限。本表以 uv {meta['uv_version']} `uv pip compile` 解析，Python 3.13、--universal，並以 --exclude-newer {meta['py_resolved_at']}（{meta['version']} 那個 commit 的時間）固定為當時可取得的版本。授權、作者與雜湊取自 PyPI；雜湊為該版本原始碼包（sdist）的 SHA-256。")
    line("使用範圍", "執行期：正式環境安裝時會裝進來的套件（前端＝`pnpm install --prod`，後端＝pyproject.toml 的 dependencies 及其相依）。開發／建置、開發／測試：只有開發、建置、測試時才用到的套件，不會進入正式環境。前端分類已用 `pnpm install --prod` 另外安裝一次比對，兩邊一致。")
    line("相依關係", "直接：專案的 package.json／pyproject.toml 有寫。間接：被其他套件帶進來。")
    line("平台限定", "同一套件針對不同作業系統、CPU 的預編譯檔（例如 @next/swc-*、@img/sharp-*）。鎖定檔全部列出，實際安裝時只會裝符合該機器的那一個；正式環境為 Linux（Alpine，musl）。")

    heading("範圍與限制")
    line("1", "執行期是「安裝時會裝進來」的範圍，比實際打包進網站的檔案多：Next.js 的 standalone 輸出只會帶走執行時真的用到的檔案。")
    line("2", "後端版本是依 tag 時間解析的結果。容器建置時（Backend/Dockerfile 執行 `uv pip install .`）會取建置當天的最新版本，實際部署版本可能較新。")
    line("3", "容器映像使用浮動 tag（3.13-slim、22-alpine、7-alpine、latest），未以 digest 固定；映像內作業系統套件不在本表範圍，需另做容器映像掃描。")
    line("4", "本表不含已知漏洞（CVE）資訊，弱點請見源碼檢測（SCA）報告；也不含各元件供應者所在國別。")
    line("5", "交付版須以修補後的最終版本重新產生本表。")
    ws.cell(row=1, column=1).alignment = Alignment(vertical="center")

    wb.calculation.fullCalcOnLoad = True
    wb.save(args.out)

    # 給人核對用：把公式應得的數字印出來
    print("前端", len(fe), Counter(r["scope"] for r in fe), "直接", sum(r["direct"] for r in fe), "平台限定", sum(bool(r["platform"]) for r in fe))
    print("後端", len(be), Counter(r["scope"] for r in be), "直接", sum(r["direct"] for r in be))
    print("其他", len(other), "授權種類", len(licenses))


if __name__ == "__main__":
    main()

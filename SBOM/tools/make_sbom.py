#!/usr/bin/env python3
"""從 optimized-version 的鎖定檔產生 SBOM（CycloneDX 1.6 JSON）與中文表格用的資料。

只用標準函式庫。表格（xlsx）由 make_table.py 產生。

輸入（都由 README.md 的步驟先準備好）：
  --lock          Frontend/pnpm-lock.yaml
  --fe-licenses   `pnpm licenses list -r --json` 的輸出（可給多個，會合併）
  --py-runtime    `uv pip compile`（不含 dev）的輸出，--annotation-style line
  --py-all        `uv pip compile --group dev` 的輸出，--annotation-style line
  --pyproject     Backend/pyproject.toml
  --cache         npm／PyPI 中繼資料快取資料夾
  --out           輸出資料夾
  --version       受測版本（tag）
  --commit        受測 commit
  --resolved-at   後端套件解析時間點（uv --exclude-newer 用的時間）
  --pnpm-version  匯出前端授權時用的 pnpm 版本（寫進 SBOM 的工具欄）
  --uv-version    解析後端相依時用的 uv 版本（寫進 SBOM 的工具欄）

分類規則：
  前端：從 pnpm-lock 的 importers 出發走 snapshots 的相依圖。
        apps/*、libs/* 的 dependencies 走得到的＝執行期；只有 devDependencies 走得到的＝開發／建置。
        workspace 之間的 link: 只跟著對方的 dependencies 走（對方的 devDependencies 不算執行期）。
        只在特定作業系統／CPU 才安裝的套件（os/cpu/libc）照樣列出，另標「平台限定」。
  後端：pyproject [project].dependencies 解析出來的＝執行期；只在 dev 群組出現的＝開發／測試。
"""

import argparse
import json
import re
import subprocess
import sys
import time
import tomllib
import urllib.parse
import uuid
from datetime import UTC, datetime
from pathlib import Path

# ---------------------------------------------------------------------------
# pnpm-lock.yaml（lockfileVersion 9.0）解析：格式固定，用縮排判斷，不需要 YAML 套件
# ---------------------------------------------------------------------------


def unquote(s):
    s = s.strip()
    if len(s) >= 2 and s[0] == s[-1] and s[0] in "'\"":
        return s[1:-1]
    return s


def split_name_version(key):
    """'@babel/core@7.29.0(supports-color@10.2.2)' -> ('@babel/core', '7.29.0')"""
    key = unquote(key)
    base = key.split("(", 1)[0]
    name, _, ver = base.rpartition("@")
    return name, ver


def resolve_dep(dep_name, value):
    """dependencies 底下的一行：回傳 (name, version) 或 ('link', path)。"""
    value = unquote(value)
    if value.startswith("link:"):
        return "link", value[5:]
    base = value.split("(", 1)[0]
    if "@" in base[1:]:  # npm alias：值本身是 name@version
        name, _, ver = base.rpartition("@")
        return name, ver
    return dep_name, base


def parse_pnpm_lock(path):
    lines = Path(path).read_text(encoding="utf-8").splitlines()
    section = None
    importers = {}  # importer -> {group: [(dep_name, value)]}
    packages = {}  # "name@ver" -> {integrity, os, cpu, libc}
    snapshots = {}  # "name@ver" -> set(("name@ver"))  （同一版本不同 peer 組合合併）

    cur_key = cur_group = cur_dep = None
    for raw in lines:
        if not raw.strip():
            continue
        if not raw.startswith(" "):
            section = raw.rstrip(":")
            cur_key = cur_group = cur_dep = None
            continue
        indent = len(raw) - len(raw.lstrip(" "))
        text = raw.strip()

        if section == "importers":
            if indent == 2:
                cur_key = unquote(text.rstrip(":"))
                importers[cur_key] = {}
            elif indent == 4:
                cur_group = text.rstrip(":")
                importers[cur_key][cur_group] = []
            elif indent == 6:
                cur_dep = unquote(text.rstrip(":"))
            elif indent == 8 and text.startswith("version:"):
                importers[cur_key][cur_group].append((cur_dep, text.split(":", 1)[1].strip()))

        elif section == "packages":
            if indent == 2:
                body = text
                inline_empty = body.endswith("{}")
                key = unquote(body[:-3].strip() if inline_empty else body.rstrip(":"))
                n, v = split_name_version(key)
                cur_key = f"{n}@{v}"
                packages.setdefault(cur_key, {"name": n, "version": v})
            elif indent == 4:
                field, _, rest = text.partition(":")
                rest = rest.strip()
                if field == "resolution":
                    m = re.search(r"integrity:\s*([^,}\s]+)", rest)
                    if m:
                        packages[cur_key]["integrity"] = m.group(1)
                    m = re.search(r"tarball:\s*([^,}\s]+)", rest)
                    if m:
                        packages[cur_key]["tarball"] = m.group(1)
                elif field in ("os", "cpu", "libc"):
                    packages[cur_key][field] = [unquote(x) for x in rest.strip("[]").split(",") if x.strip()]
                elif field == "hasBin" or field == "deprecated":
                    packages[cur_key][field] = unquote(rest)

        elif section == "snapshots":
            if indent == 2:
                body = text
                if body.endswith("{}"):
                    body = body[:-3].strip()
                key = unquote(body.rstrip(":"))
                n, v = split_name_version(key)
                cur_key = f"{n}@{v}"
                snapshots.setdefault(cur_key, set())
                cur_group = None
            elif indent == 4:
                cur_group = text.rstrip(":")
            elif indent == 6 and cur_group in ("dependencies", "optionalDependencies"):
                dep, _, val = text.partition(":")
                n, v = resolve_dep(unquote(dep), val)
                snapshots[cur_key].add(f"{n}@{v}")

    return importers, packages, snapshots


def classify_frontend(importers, packages, snapshots):
    """回傳 scope（'runtime'|'dev'）、直接相依的 workspace 對照、相依圖。"""

    def workspace_of(base, link):
        p = (Path(base) / link).as_posix()
        parts = []
        for part in p.split("/"):
            if part == "..":
                parts.pop()
            elif part not in (".", ""):
                parts.append(part)
        return "/".join(parts) or "."

    def walk(starts):
        seen = set()
        stack = list(starts)
        while stack:
            k = stack.pop()
            if k in seen:
                continue
            seen.add(k)
            stack.extend(snapshots.get(k, ()))
        return seen

    def roots(importer, groups, visited_ws=None):
        visited_ws = visited_ws or set()
        if importer in visited_ws:
            return set()
        visited_ws.add(importer)
        out = set()
        for g in groups:
            for dep, val in importers.get(importer, {}).get(g, []):
                n, v = resolve_dep(dep, val)
                if n == "link":
                    ws = workspace_of(importer, v)
                    out |= roots(ws, ("dependencies", "optionalDependencies"), visited_ws)
                else:
                    out.add(f"{n}@{v}")
        return out

    runtime_roots, dev_roots = set(), set()
    direct = {}  # "name@ver" -> {"workspaces": set, "groups": set}
    for imp, groups in importers.items():
        for g, deps in groups.items():
            for dep, val in deps:
                n, v = resolve_dep(dep, val)
                if n == "link":
                    continue
                k = f"{n}@{v}"
                d = direct.setdefault(k, {"workspaces": set(), "groups": set()})
                d["workspaces"].add(imp)
                d["groups"].add(g)
        runtime_roots |= roots(imp, ("dependencies", "optionalDependencies"))
        dev_roots |= roots(imp, ("devDependencies",))

    runtime = walk(runtime_roots)
    everything = walk(runtime_roots | dev_roots)
    scope = {}
    for k in packages:
        if k in runtime:
            scope[k] = "runtime"
        elif k in everything:
            scope[k] = "dev"
        else:
            scope[k] = "unreached"
    return scope, direct


# ---------------------------------------------------------------------------
# 中繼資料（授權、作者、首頁）
# ---------------------------------------------------------------------------


def fetch_json(url, cache_file):
    """用 curl 抓（macOS 上 python.org 版的 Python 常沒有裝好 SSL 憑證，urllib 會失敗）。"""
    if cache_file.exists():
        return json.loads(cache_file.read_text(encoding="utf-8"))
    for attempt in range(3):
        r = subprocess.run(
            ["curl", "-sS", "--max-time", "30", "-H", "Accept: application/json", "-A", "wanguard-sbom-script", "-w", "\n%{http_code}", url],
            capture_output=True, text=True,
        )
        body, _, code = r.stdout.rpartition("\n")
        if code == "200":
            data = json.loads(body)
            cache_file.parent.mkdir(parents=True, exist_ok=True)
            cache_file.write_text(json.dumps(data), encoding="utf-8")
            return data
        if code == "404":
            return None
        time.sleep(1 + attempt)
    print(f"抓不到：{url}（{r.stderr.strip() or code}）", file=sys.stderr)
    return None


def norm_license(lic):
    if lic is None:
        return ""
    if isinstance(lic, dict):
        return lic.get("type") or ""
    if isinstance(lic, list):
        vals = [norm_license(x) for x in lic]
        vals = [v for v in vals if v]
        return " OR ".join(vals) if len(vals) > 1 else (vals[0] if vals else "")
    return str(lic).strip()


def person_str(p):
    if not p:
        return ""
    if isinstance(p, dict):
        return p.get("name") or p.get("email") or ""
    return re.sub(r"\s*[<(].*$", "", str(p)).strip()


def npm_meta(name, version, cache):
    enc = urllib.parse.quote(name, safe="@")
    enc = enc.replace("/", "%2F")
    data = fetch_json(f"https://registry.npmjs.org/{enc}/{version}", cache / "npm" / f"{name.replace('/', '__')}@{version}.json")
    if not data:
        return {}
    lic = norm_license(data.get("license")) or norm_license(data.get("licenses"))
    repo = data.get("repository")
    if isinstance(repo, dict):
        repo = repo.get("url")
    return {
        "license": lic,
        "author": person_str(data.get("author")),
        "homepage": data.get("homepage") or "",
        "repository": repo or "",
        "description": data.get("description") or "",
    }


PY_CLASSIFIER_LICENSE = {
    "License :: OSI Approved :: MIT License": "MIT",
    "License :: OSI Approved :: BSD License": "BSD",
    "License :: OSI Approved :: Apache Software License": "Apache-2.0",
    "License :: OSI Approved :: Python Software Foundation License": "PSF-2.0",
    "License :: OSI Approved :: Mozilla Public License 2.0 (MPL 2.0)": "MPL-2.0",
    "License :: OSI Approved :: GNU Lesser General Public License v3 (LGPLv3)": "LGPL-3.0",
    "License :: OSI Approved :: GNU Library or Lesser General Public License (LGPL)": "LGPL",
    "License :: OSI Approved :: ISC License (ISCL)": "ISC",
    "License :: OSI Approved :: The Unlicense (Unlicense)": "Unlicense",
}


def pypi_meta(name, version, cache):
    data = fetch_json(f"https://pypi.org/pypi/{name}/{version}/json", cache / "pypi" / f"{name}@{version}.json")
    if not data:
        return {}
    info = data.get("info", {})
    lic = (info.get("license_expression") or "").strip()
    if not lic:
        raw = (info.get("license") or "").strip()
        # 有些套件把整份授權全文塞在 license 欄位，只取短的
        if raw and len(raw) <= 60 and "\n" not in raw:
            lic = raw
    if not lic:
        cls = [PY_CLASSIFIER_LICENSE.get(c, c.split("::")[-1].strip()) for c in info.get("classifiers", []) if c.startswith("License ::")]
        lic = " OR ".join(dict.fromkeys(cls))
    # 來源檔：優先 sdist，其次 py3-none-any wheel，取其 sha256
    files = data.get("urls", [])
    pick = next((f for f in files if f.get("packagetype") == "sdist"), None)
    if not pick:
        pick = next((f for f in files if f.get("filename", "").endswith("-none-any.whl")), None)
    if not pick and files:
        pick = files[0]
    urls = info.get("project_urls") or {}
    return {
        "license": lic,
        "author": info.get("author") or info.get("maintainer") or re.sub(r"\s*<.*$", "", info.get("author_email") or "") or "",
        "homepage": info.get("home_page") or urls.get("Homepage") or urls.get("Source") or urls.get("Repository") or "",
        "description": info.get("summary") or "",
        "sha256": (pick or {}).get("digests", {}).get("sha256", ""),
        "file": (pick or {}).get("filename", ""),
    }


# ---------------------------------------------------------------------------
# 後端：uv pip compile 輸出
# ---------------------------------------------------------------------------


def canon(name):
    return re.sub(r"[-_.]+", "-", name).lower()


def parse_uv(path):
    out = {}
    for line in Path(path).read_text(encoding="utf-8").splitlines():
        if not line or line.startswith((" ", "#", "-")):
            continue
        spec, _, via = line.partition("# via")
        spec = spec.strip().rstrip("\\").strip()
        m = re.match(r"([A-Za-z0-9._-]+)(?:\[[^\]]*\])?==([^ ;]+)\s*(?:;\s*(.*))?", spec)
        if not m:
            continue
        name, ver, marker = canon(m.group(1)), m.group(2), (m.group(3) or "").strip()
        # 「backend (pyproject.toml)」是本專案自己，不算父套件
        parents = [canon(p.strip()) for p in via.split(",") if p.strip() and not p.strip().startswith("backend")] if via else []
        out[name] = {"version": ver, "marker": marker, "via": parents}
    return out


def pyproject_direct(path):
    data = tomllib.loads(Path(path).read_text(encoding="utf-8"))

    def names(lst):
        res = {}
        for spec in lst:
            m = re.match(r"([A-Za-z0-9._-]+)(\[[^\]]*\])?\s*(.*)", spec)
            res[canon(m.group(1))] = spec
        return res

    runtime = names(data["project"]["dependencies"])
    dev = names(data.get("dependency-groups", {}).get("dev", []))
    return runtime, dev


# ---------------------------------------------------------------------------
# 非套件管理器管理的元件：容器基礎映像、建置時抓的字型、程式庫內的字型檔
# 授權寫的是上游公開的授權；版本照設定檔原樣（latest／浮動 tag 會標出來）
# ---------------------------------------------------------------------------

OTHER_COMPONENTS = [
    {"group": "容器映像", "name": "python", "version": "3.13-slim", "license": "PSF-2.0", "supplier": "Docker Official Images", "source": "Backend/Dockerfile", "purl": "pkg:docker/library/python@3.13-slim", "note": "後端執行環境（Debian）。tag 會隨上游更新，沒有用 digest 固定"},
    {"group": "容器映像", "name": "ghcr.io/astral-sh/uv", "version": "latest", "license": "MIT OR Apache-2.0", "supplier": "Astral", "source": "Backend/Dockerfile", "purl": "pkg:docker/astral-sh/uv@latest?repository_url=ghcr.io", "note": "只在建置時複製 uv 執行檔。latest 未固定版本"},
    {"group": "容器映像", "name": "node", "version": "22-alpine", "license": "MIT", "supplier": "Docker Official Images", "source": "Frontend/Dockerfile", "purl": "pkg:docker/library/node@22-alpine", "note": "前台、管理平台執行環境（Alpine）。tag 未用 digest 固定"},
    {"group": "容器映像", "name": "postgis/postgis", "version": "16-3.4", "license": "GPL-2.0-or-later（PostGIS）；PostgreSQL（PostgreSQL License）", "supplier": "PostGIS Project", "source": "Backend/docker/postgres-h3/Dockerfile", "purl": "pkg:docker/postgis/postgis@16-3.4", "note": "資料庫。以獨立服務執行，不與本專案程式碼連結"},
    {"group": "作業系統套件", "name": "postgresql-16-h3", "version": "建置時由 apt-archive.postgresql.org 安裝的版本", "license": "Apache-2.0", "supplier": "PostgreSQL Global Development Group（PGDG 套件庫）", "source": "Backend/docker/postgres-h3/Dockerfile", "purl": "pkg:deb/postgresql-16-h3", "note": "h3-pg 擴充。版本未固定"},
    {"group": "容器映像", "name": "redis", "version": "7-alpine", "license": "7.2 以前 BSD-3-Clause；7.4 起 RSALv2／SSPLv1", "supplier": "Docker Official Images", "source": "Backend/docker-compose.yml、docker-compose.staging.yml", "purl": "pkg:docker/library/redis@7-alpine", "note": "7-alpine 目前對應 7.4.x，授權為 RSALv2／SSPLv1（非 OSI 認可）。以獨立服務執行，不隨元件散布"},
    {"group": "容器映像", "name": "cloudflare/cloudflared", "version": "latest", "license": "Apache-2.0", "supplier": "Cloudflare", "source": "Backend/docker-compose.staging.yml", "purl": "pkg:docker/cloudflare/cloudflared@latest", "note": "只用在 staging 部署（Cloudflare Tunnel）。latest 未固定版本"},
    {"group": "字型", "name": "Noto Sans TC", "version": "建置時由 next/font 自 Google Fonts 下載", "license": "OFL-1.1", "supplier": "Google", "source": "Frontend/libs/modules/src/document-layout.tsx", "purl": "", "note": "next/font 建置時下載並與網站一起提供（self-host）"},
    {"group": "字型", "name": "Nunito", "version": "建置時由 next/font 自 Google Fonts 下載", "license": "OFL-1.1", "supplier": "Vernon Adams 等", "source": "Frontend/libs/modules/src/document-layout.tsx", "purl": "", "note": "同上"},
    {"group": "字型", "name": "Inter", "version": "建置時由 next/font 自 Google Fonts 下載", "license": "OFL-1.1", "supplier": "Rasmus Andersson", "source": "Frontend/libs/modules/src/document-layout.tsx", "purl": "", "note": "同上"},
    {"group": "字型", "name": "Noto Sans TC（子集化 OTF）", "version": "Regular、Bold 子集", "license": "OFL-1.1", "supplier": "Google", "source": "Frontend/apps/demo/assets/share-card/NotoSansTC-*.subset.otf", "purl": "", "note": "程式庫內的字型檔，用於產生分享圖卡"},
]


# package.json 與 registry 都沒有寫授權、要看套件內 LICENSE 檔才知道的
LICENSE_OVERRIDES = {
    "union@0.5.0": ("MIT", "package.json 未標示；依套件內 LICENSE 檔全文判定為 MIT"),
}

# PyPI 上常見的非 SPDX 寫法 → SPDX
PY_LICENSE_NORMALIZE = {
    "Apache 2.0": "Apache-2.0",
    "Apache License 2.0": "Apache-2.0",
    "BSD License": "BSD",
}
PY_LICENSE_OVERRIDES = {
    "python-dateutil": ("Apache-2.0 AND BSD-3-Clause", "PyPI 寫「Dual License」；套件 LICENSE：2017-12 以後的貢獻為 Apache-2.0，之前為 BSD-3-Clause"),
}
PY_LICENSE_NOTES = {
    "BSD": "PyPI 只寫 BSD，沒有寫明是 2 條款或 3 條款",
}

# 可以直接放進 CycloneDX license.id 的 SPDX 識別碼（其餘用 expression 或 name）
SPDX_IDS = {
    "MIT", "MIT-0", "Apache-2.0", "ISC", "BSD-2-Clause", "BSD-3-Clause", "0BSD", "MPL-2.0",
    "LGPL-3.0-or-later", "LGPL-3.0-only", "GPL-3.0-only", "GPL-2.0-or-later", "CC0-1.0", "CC-BY-4.0",
    "Unlicense", "BlueOak-1.0.0", "Python-2.0", "PSF-2.0", "Zlib", "WTFPL", "OFL-1.1",
}


def platform_text(p):
    parts = []
    for f in ("os", "cpu", "libc"):
        if p.get(f):
            parts.append("/".join(p[f]))
    return " ".join(parts)


def npm_purl(name, version):
    if name.startswith("@"):
        scope, _, pkg = name[1:].partition("/")
        return f"pkg:npm/%40{scope}/{pkg}@{version}"
    return f"pkg:npm/{name}@{version}"


def sri_to_hash(sri):
    import base64

    algo, _, b64 = sri.partition("-")
    hexd = base64.b64decode(b64).hex()
    return {"sha512": "SHA-512", "sha256": "SHA-256", "sha1": "SHA-1"}.get(algo, algo.upper()), hexd


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--lock", required=True)
    ap.add_argument("--fe-licenses", nargs="+", required=True)
    ap.add_argument("--py-runtime", required=True)
    ap.add_argument("--py-all", required=True)
    ap.add_argument("--pyproject", required=True)
    ap.add_argument("--cache", required=True)
    ap.add_argument("--out", required=True)
    ap.add_argument("--version", required=True)
    ap.add_argument("--commit", required=True)
    ap.add_argument("--resolved-at", required=True)
    ap.add_argument("--pnpm-version", required=True)
    ap.add_argument("--uv-version", required=True)
    args = ap.parse_args()

    cache = Path(args.cache)
    out = Path(args.out)
    out.mkdir(parents=True, exist_ok=True)

    # ---- 前端 ----
    importers, packages, snapshots = parse_pnpm_lock(args.lock)
    scope, direct = classify_frontend(importers, packages, snapshots)

    lic_index = {}
    for f in args.fe_licenses:
        for lic, items in json.loads(Path(f).read_text(encoding="utf-8")).items():
            for it in items:
                for v in it.get("versions", []):
                    lic_index[f"{it['name']}@{v}"] = {
                        "license": it.get("license") or lic,
                        "author": it.get("author") or "",
                        "homepage": it.get("homepage") or "",
                        "description": it.get("description") or "",
                    }

    fe_rows = []
    for k, p in sorted(packages.items(), key=lambda kv: (kv[1]["name"].lower(), kv[1]["version"])):
        meta = dict(lic_index.get(k, {}))
        if not meta or meta.get("license") in ("", "Unknown", None):
            reg = npm_meta(p["name"], p["version"], cache)
            for f2 in ("license", "author", "homepage", "description"):
                if not meta.get(f2) or meta.get(f2) == "Unknown":
                    meta[f2] = reg.get(f2, "")
        license_note = ""
        lic = meta.get("license") or ""
        if lic.startswith("(") and lic.endswith(")") and lic.count("(") == 1:
            meta["license"] = lic[1:-1]
        if k in LICENSE_OVERRIDES:
            meta["license"], license_note = LICENSE_OVERRIDES[k]
        d = direct.get(k)
        hash_alg, hash_hex = sri_to_hash(p["integrity"]) if p.get("integrity") else ("", "")
        fe_rows.append({
            "ecosystem": "npm",
            "name": p["name"],
            "version": p["version"],
            "scope": scope[k],
            "direct": bool(d),
            "workspaces": sorted(d["workspaces"]) if d else [],
            "license": meta.get("license") or "",
            "license_note": license_note,
            "author": meta.get("author") or "",
            "homepage": meta.get("homepage") or "",
            "description": meta.get("description") or "",
            "platform": platform_text(p),
            "purl": npm_purl(p["name"], p["version"]),
            "hash_alg": hash_alg,
            "hash": hash_hex,
            "integrity": p.get("integrity", ""),
            "deps": sorted(snapshots.get(k, ())),
        })

    # ---- 後端 ----
    py_rt = parse_uv(args.py_runtime)
    py_all = parse_uv(args.py_all)
    direct_rt, direct_dev = pyproject_direct(args.pyproject)
    children = {}
    for n, info in py_all.items():
        for par in info["via"]:
            children.setdefault(par, set()).add(n)

    be_rows = []
    for n in sorted(py_all):
        info = py_all[n]
        meta = pypi_meta(n, info["version"], cache)
        lic = PY_LICENSE_NORMALIZE.get(meta.get("license", ""), meta.get("license", ""))
        license_note = PY_LICENSE_NOTES.get(lic, "")
        if n in PY_LICENSE_OVERRIDES:
            lic, license_note = PY_LICENSE_OVERRIDES[n]
        meta["license"] = lic
        is_rt = n in py_rt
        be_rows.append({
            "ecosystem": "pypi",
            "name": n,
            "version": info["version"],
            "scope": "runtime" if is_rt else "dev",
            "direct": n in direct_rt or n in direct_dev,
            "declared": direct_rt.get(n) or direct_dev.get(n) or "",
            "via": info["via"],
            "license": meta.get("license", ""),
            "license_note": license_note,
            "author": meta.get("author", "").strip('"'),
            "homepage": meta.get("homepage", ""),
            "description": meta.get("description", ""),
            "marker": info["marker"],
            "purl": f"pkg:pypi/{n}@{info['version']}",
            "hash_alg": "SHA-256" if meta.get("sha256") else "",
            "hash": meta.get("sha256", ""),
            "hash_file": meta.get("file", ""),
            "deps": sorted(f"{c}@{py_all[c]['version']}" for c in children.get(n, ())),
        })

    now = datetime.now(UTC).replace(microsecond=0).isoformat().replace("+00:00", "Z")
    meta_out = {
        "project": "optimized-version（島嶼守望 WanGuard／光復超人）",
        "repo": "https://github.com/GuangFuHero/optimized-version",
        "version": args.version,
        "commit": args.commit,
        "generated_at": now,
        "py_resolved_at": args.resolved_at,
        "pnpm_version": args.pnpm_version,
        "uv_version": args.uv_version,
    }

    # ---- CycloneDX 1.6 ----
    def bomref(eco, name, ver):
        return f"{eco}:{name}@{ver}"

    components = []
    deps_out = []
    for r in fe_rows + be_rows:
        c = {
            "type": "library",
            "bom-ref": bomref(r["ecosystem"], r["name"], r["version"]),
            "name": r["name"],
            "version": r["version"],
            "scope": "required" if r["scope"] == "runtime" else "excluded",
            "purl": r["purl"],
        }
        if r["author"]:
            c["author"] = r["author"]
        if r["description"]:
            c["description"] = r["description"][:500]
        if r["license"]:
            lic = r["license"]
            if lic in SPDX_IDS:
                c["licenses"] = [{"license": {"id": lic}}]
            elif re.search(r"\b(AND|OR|WITH)\b", lic):
                if lic.count("(") == 1 and lic.startswith("(") and lic.endswith(")"):
                    lic = lic[1:-1]
                c["licenses"] = [{"expression": lic}]
            else:
                c["licenses"] = [{"license": {"name": lic}}]
        if r["hash"]:
            c["hashes"] = [{"alg": r["hash_alg"], "content": r["hash"]}]
        if r["homepage"]:
            c["externalReferences"] = [{"type": "website", "url": r["homepage"]}]
        props = [{"name": "wanguard:scope", "value": "執行期" if r["scope"] == "runtime" else "開發／建置"},
                 {"name": "wanguard:direct", "value": "直接" if r["direct"] else "間接"}]
        if r.get("platform"):
            props.append({"name": "wanguard:platform", "value": r["platform"]})
        if r.get("marker"):
            props.append({"name": "wanguard:python-marker", "value": r["marker"]})
        if r.get("hash_file"):
            props.append({"name": "wanguard:hash-file", "value": r["hash_file"]})
        c["properties"] = props
        components.append(c)
        prefix = r["ecosystem"]
        deps_out.append({"ref": c["bom-ref"], "dependsOn": [f"{prefix}:{d}" for d in r["deps"]]})

    for oc in OTHER_COMPONENTS:
        c = {
            "type": "container" if oc["group"] == "容器映像" else ("operating-system" if oc["group"] == "作業系統套件" else "data"),
            "bom-ref": f"other:{oc['name']}@{oc['version']}",
            "name": oc["name"],
            "version": oc["version"],
            "supplier": {"name": oc["supplier"]},
            "licenses": [{"license": {"name": oc["license"]}}],
            "properties": [{"name": "wanguard:group", "value": oc["group"]}, {"name": "wanguard:source", "value": oc["source"]}, {"name": "wanguard:note", "value": oc["note"]}],
        }
        if oc["purl"]:
            c["purl"] = oc["purl"]
        components.append(c)

    root_ref = f"optimized-version@{args.version}"
    direct_refs = [f"npm:{r['name']}@{r['version']}" for r in fe_rows if r["direct"]] + [f"pypi:{r['name']}@{r['version']}" for r in be_rows if r["direct"]]
    deps_out.insert(0, {"ref": root_ref, "dependsOn": sorted(direct_refs)})

    bom = {
        "bomFormat": "CycloneDX",
        "specVersion": "1.6",
        "serialNumber": f"urn:uuid:{uuid.uuid4()}",
        "version": 1,
        "metadata": {
            "timestamp": now,
            "lifecycles": [{"phase": "pre-build"}],
            "tools": {"components": [{"type": "application", "name": "make_sbom.py（島嶼守望自製）"}, {"type": "application", "name": "pnpm", "version": args.pnpm_version}, {"type": "application", "name": "uv", "version": args.uv_version}]},
            "authors": [{"name": "島嶼守望 WanGuard 團隊"}],
            "component": {
                "type": "application",
                "bom-ref": root_ref,
                "name": "optimized-version",
                "version": args.version,
                "description": "島嶼守望救災平台（前台、管理平台、後端 API）",
                "licenses": [{"license": {"id": "GPL-3.0-only"}}],
                "purl": f"pkg:github/GuangFuHero/optimized-version@{args.version}",
                "externalReferences": [{"type": "vcs", "url": "https://github.com/GuangFuHero/optimized-version"}],
                "properties": [{"name": "wanguard:commit", "value": args.commit}, {"name": "wanguard:python-resolved-at", "value": args.resolved_at}],
            },
        },
        "components": components,
        "dependencies": deps_out,
    }
    (out / f"sbom-{args.version}.cdx.json").write_text(json.dumps(bom, ensure_ascii=False, indent=2), encoding="utf-8")
    (out / "_rows.json").write_text(json.dumps({"meta": meta_out, "frontend": fe_rows, "backend": be_rows, "other": OTHER_COMPONENTS}, ensure_ascii=False, indent=1), encoding="utf-8")

    unreached = [r for r in fe_rows if r["scope"] == "unreached"]
    print(f"frontend packages: {len(fe_rows)}  runtime {sum(r['scope']=='runtime' for r in fe_rows)}  dev {sum(r['scope']=='dev' for r in fe_rows)}  unreached {len(unreached)}", file=sys.stderr)
    print(f"backend packages: {len(be_rows)}  runtime {sum(r['scope']=='runtime' for r in be_rows)}  dev {sum(r['scope']=='dev' for r in be_rows)}", file=sys.stderr)
    print(f"no license: fe {[r['name']+'@'+r['version'] for r in fe_rows if not r['license']]}  be {[r['name'] for r in be_rows if not r['license']]}", file=sys.stderr)


if __name__ == "__main__":
    main()

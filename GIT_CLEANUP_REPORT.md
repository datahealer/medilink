# Git Cleanup Report — MediLink

**Repository root:** `D:/Medilink`
**Remote:** `https://github.com/datahealer/medilink.git`
**History:** single commit `f7d64a1 Initial commit` — **never successfully pushed**
**Tracked files:** 659 (all under `Medilink/`)
**Current `.git` size:** ~205 MB

> **Why the push fails:** GitHub rejects any *single file* larger than 100 MiB for the
> **entire** push. One file (`…/04_Medilink__BRAND_Identity_Guidlines_V1.ai`, 129.75 MiB)
> exceeds that limit, so nothing gets pushed until it is removed from the commit.

---

## 1. Audit results

### ✅ Already clean — nothing to do
| Check | Result |
|---|---|
| Tracked `node_modules/` | **None** — already ignored |
| Tracked `.next` / `out` / `dist` / `build` / `.expo` artifacts | **None** — already ignored |
| Tracked `.env*` / logs / keystores | **None** |

The existing `Medilink/.gitignore` already covers dependencies and build output correctly.
The only problem is **design assets**, which were never ignored.

### ⛔ Files over 100 MiB (block the push)
| File | Size | Reason | Action |
|---|---|---|---|
| `Medilink/document/docs/Medilink-20260619T034520Z-3-001/Medilink/GUIDELINE/04_Medilink__BRAND_Identity_Guidlines_V1_Folder/04_Medilink__BRAND_Identity_Guidlines_V1.ai` | **136.05 MB (129.75 MiB)** | Exceeds GitHub 100 MiB hard limit; binary Illustrator source, not diffable | **Must untrack** (keep local) |

### ⚠️ Files over 50 MB
None other than the file above.

### 📦 Design assets tracked (binary sources — bloat, not code)
| Type | Count | Total size | Reason it shouldn't be committed |
|---|---|---|---|
| `.ai` (Illustrator) | 10 | 132.11 MB | Binary design source; un-diffable; belongs in Drive/Figma |
| `.eps` (vector) | 21 | 47.10 MB | Same — large binary export artifacts |
| **Design source subtotal** | **31** | **179.20 MB** | |

### 📁 Full design-deliverables tree (`Medilink/document/`)
The Google-Drive export dump and design docs total **304.46 MB across 337 files**:

| Type | Count | Size | Notes |
|---|---|---|---|
| `.ai` / `.eps` | 31 | 179.20 MB | binary design sources (above) |
| `.jpg` | 65 | 38.66 MB | page-export images of the brand guide |
| `.pdf` | 17 | 27.33 MB | incl. duplicated brand-guide PDFs |
| `.html` | 88 | 30.15 MB | incl. `medilink-design-doc.html` (24.79 MB single file) |
| `.otf`/`.ttf`/`.woff*` | 39 | 18.92 MB | embedded fonts |
| `.png` | 41 | 8.39 MB | |
| `.svg` | 33 | 0.93 MB | |

These are **design deliverables, not application code**. Hosting them in Git bloats every
clone and offers no diff/merge value. Recommended home: shared Drive / Figma / Git LFS.

---

## 2. Recommended scope — pick one

**Scope A — Minimum to unblock the push**
Untrack only the one >100 MiB `.ai` file. Repo stays ~290 MB but will push.

**Scope B — Recommended: make this a code repo**
Untrack the entire `Medilink/document/` deliverables tree (304 MB) and ignore design
binaries going forward. Drops `.git`/clone size dramatically; all files stay on disk.

> All actions below **keep every file locally** (`--cached` only) and **do not** run a
> destructive history rewrite. Because there is exactly **one, unpushed commit**, amending
> it is safe and sufficient — the orphaned large blob is simply never sent to GitHub.

---

## 3. `.gitignore` changes (already applied to `Medilink/.gitignore`)

```gitignore
# design source / binary assets — keep in Drive/Figma, never in Git
*.ai
*.eps
*.psd
*.indd
*.sketch

# large design-deliverable export dump (Scope B)
document/docs/
```

Review and delete the `document/docs/` line if you choose Scope A.

---

## 4. Proposed commands (run after approval)

All commands run from the repo root `D:/Medilink`.

### Step 0 — Safety backup (recommended)
```bash
git branch backup-before-cleanup
```

### Step 1 — Untrack the offending files (keeps them on disk)

**Scope A — only the blocking file:**
```bash
git rm --cached --ignore-unmatch "Medilink/document/docs/Medilink-20260619T034520Z-3-001/Medilink/GUIDELINE/04_Medilink__BRAND_Identity_Guidlines_V1_Folder/04_Medilink__BRAND_Identity_Guidlines_V1.ai"
```

**Scope B — entire design-deliverables tree (recommended):**
```bash
git rm -r --cached --ignore-unmatch "Medilink/document"
```

*(Optional, in-between: untrack just design binaries everywhere but keep docs):*
```bash
git rm --cached --ignore-unmatch "*.ai" "*.eps" "*.psd"
```

### Step 2 — Stage the updated `.gitignore`
```bash
git add Medilink/.gitignore
```

### Step 3 — Recreate the single commit safely (no pushed history to rewrite)
```bash
git commit --amend --no-edit
```
> This rewrites only the local, never-pushed initial commit. The removed blobs become
> unreachable and will **not** be uploaded.

### Step 4 — Drop the orphaned large blobs from the local object store (shrinks `.git`)
```bash
git reflog expire --expire-unreachable=now --all
git gc --prune=now --aggressive
```

### Step 5 — Push
```bash
git push -u origin main
```

### Step 6 — Verify, then remove the backup branch
```bash
git ls-files | grep -iE "\.(ai|eps|psd)$"   # should print nothing (Scope B)
git branch -D backup-before-cleanup          # only after a successful push
```

---

## 5. If the file had already been pushed (not the case here)
A plain `--amend` would be insufficient and a full history rewrite would be required:
```bash
# Requires git-filter-repo (or BFG). DO NOT run without explicit approval.
git filter-repo --path "Medilink/document/docs/.../04_…_V1.ai" --invert-paths
```
This is **not needed** for MediLink because the commit was never pushed.

---

## 6. Notes
- No local files are deleted by any step above (`--cached` / backup branch only).
- No remote history exists yet, so no force-push or coordination with collaborators is needed.
- For future large binaries you do want versioned, consider **Git LFS** (`git lfs track "*.ai"`).

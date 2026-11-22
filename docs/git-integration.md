# Git integration

Everything runs locally: Git calls the Node CLI, which reads the two versions in memory and never
sends them anywhere. Git itself is only run with argument arrays, never through a shell.

## 1. Build the CLI once and keep it in a stable place

```powershell
npm ci
npm run build:cli
New-Item -ItemType Directory -Force C:\tools\ktrdiff
Copy-Item packages\cli\dist\ktrdiff.mjs C:\tools\ktrdiff\
```

`ktrdiff.mjs` is a single file that needs only Node 22 or later (no `node_modules`). Any folder
works; Git will run it from its absolute path, so re-run `git-install --apply-repo` (step 2) if
you move it. Below, `ktrdiff` stands for `node C:\tools\ktrdiff\ktrdiff.mjs`.

## 2. Configure a repository (once per repository)

Inside the repository that holds the `.ktr`, `.kjb` and `.kdb` files:

```powershell
node C:\tools\ktrdiff\ktrdiff.mjs git-install               # prints the configuration, changes nothing
node C:\tools\ktrdiff\ktrdiff.mjs git-install --apply-repo  # writes it to THIS repository's .git/config
```

`--apply-repo` sets two repository-local keys (never the global configuration):

```text
diff.ktrdiff.command = node "C:/tools/ktrdiff/ktrdiff.mjs" git-diff
difftool.ktrdiff.cmd = node "C:/tools/ktrdiff/ktrdiff.mjs" git "$LOCAL" "$REMOTE"
```

Then tell Git which files use the driver: add these lines to `.gitattributes` at the root of the
repository yourself (KTRDiff never edits your files) and commit it if the whole team should get it:

```gitattributes
*.ktr diff=ktrdiff
*.kjb diff=ktrdiff
*.kdb diff=ktrdiff
```

## 3. Use it

```powershell
git diff -- path/to/transformation.ktr                       # semantic diff instead of XML lines
git log -p --ext-diff -- path/to/transformation.ktr          # history (log needs --ext-diff for drivers)
git difftool -t ktrdiff -- path/to/transformation.ktr        # same, through the difftool
git difftool -t ktrdiff HEAD~1 HEAD -- path/to/file.ktr
node C:\tools\ktrdiff\ktrdiff.mjs git HEAD~1 HEAD -- path/to/transformation.ktr
node C:\tools\ktrdiff\ktrdiff.mjs git main feature/xyz -- path/to/transformation.ktr --mode advanced
```

`git --no-ext-diff diff` shows the plain XML diff again when you need it. The driver uses the
mode of the repository `.ktrdiff.yml` (Quick by default); for other options use the `git` command above, which accepts every compare option
(`--mode advanced`, `--format html --output report.html`, …).

Colours: inside `git diff` the driver colours its report when Git shows it through its pager
(the same rule as Git's own `color.ui=auto`); `git diff > file.txt` stays plain. A non-empty
`NO_COLOR` environment variable turns colours off everywhere.

## How it works

Git hands the difftool two temporary files; its external diff driver instead receives seven
arguments (`path old-file old-hash old-mode new-file new-hash new-mode`). `git-diff` implements
that protocol separately from `git`. In these Git commands only, an empty side or `/dev/null`
represents an absent document: added/deleted files produce semantic additions/removals,
not XML parse errors. A path absent in a valid revision is also an empty side; invalid revisions
remain errors. Normal comparisons still reject empty/invalid XML.
For `ktrdiff git OLD NEW -- PATH`, existing files are used directly and anything else is a
revision read with `git show` into memory; paths with spaces work (quote them).

The browser never accesses local repositories: compare Git revisions with the CLI (including
`--format html --output report.html` for a browser-readable report).

## CI gating

```powershell
node ktrdiff.mjs git origin/main HEAD -- etl/customers.ktr --fail-on functional --format text
```

Exit code `1` when a functional change is present, `0` otherwise — useful to require review on
functional ETL changes while letting layout-only commits pass.

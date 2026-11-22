@echo off
rem KTRDiff CLI launcher (Windows): runs the single-file Node bundle (Node 22+).
setlocal
set "CLI=%~dp0..\packages\cli\dist\ktrdiff.mjs"
if not exist "%CLI%" (
  echo ktrdiff: %CLI% not found; build it first: npm run build:cli
  exit /b 2
)
node "%CLI%" %*
endlocal

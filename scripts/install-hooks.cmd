@echo off
REM Git Hooks Installation Script - Windows Version
REM Auto-install pre-commit hook to format code before commit

setlocal

set "HOOK_DIR=.git\hooks"
set "HOOK_FILE=%HOOK_DIR%\pre-commit"

REM Check if in a Git repository
if not exist ".git" (
    echo Error: Not in a Git repository
    exit /b 1
)

REM Create hooks directory if not exists
if not exist "%HOOK_DIR%" (
    mkdir "%HOOK_DIR%"
)

REM Create pre-commit hook
echo Installing pre-commit hook...

(
echo #!/bin/bash
echo # Auto-format code before commit
echo.
echo STAGED_GO=$(git diff --cached --name-only --diff-filter=ACM ^| grep '\.go$'^)
echo STAGED_WEB=$(git diff --cached --name-only --diff-filter=ACM ^| grep '^web/src/'^)
echo.
echo if [ -n "$STAGED_WEB" ]; then
echo     echo "Formatting frontend code..."
echo     (cd web ^&^& pnpm run format^)
echo     echo "$STAGED_WEB" ^| xargs git add
echo fi
echo.
echo if [ -n "$STAGED_GO" ]; then
echo     echo "Running go mod tidy..."
echo     go mod tidy
echo     git add go.mod go.sum
echo fi
) > "%HOOK_FILE%"

echo.
echo Git hooks installed successfully!
echo.
echo Code will be auto-formatted on each commit.
echo For lint check, manually run: cd web ^&^& pnpm run lint

endlocal

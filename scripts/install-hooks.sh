#!/bin/bash
# Git Hooks Installation Script - Linux/macOS Version
# Auto-install pre-commit hook to format code before commit

set -e

HOOK_DIR=".git/hooks"
HOOK_FILE="$HOOK_DIR/pre-commit"

# Check if in a Git repository
if [ ! -d ".git" ]; then
    echo "Error: Not in a Git repository"
    exit 1
fi

# Create hooks directory if not exists
mkdir -p "$HOOK_DIR"

# Create pre-commit hook
echo "Installing pre-commit hook..."

cat > "$HOOK_FILE" << 'EOF'
#!/bin/bash
# Auto-format code before commit

# Get list of staged files before formatting
STAGED_GO=$(git diff --cached --name-only --diff-filter=ACM | grep '\.go$')
STAGED_WEB=$(git diff --cached --name-only --diff-filter=ACM | grep '^web/src/')

if [ -n "$STAGED_WEB" ]; then
    echo "Formatting frontend code..."
    (cd web && pnpm run format)
    echo "$STAGED_WEB" | xargs git add
fi

if [ -n "$STAGED_GO" ]; then
    echo "Running go mod tidy..."
    go mod tidy
    git add go.mod go.sum
fi
EOF

# Set execute permission
chmod +x "$HOOK_FILE"

echo ""
echo "Git hooks installed successfully!"
echo ""
echo "Code will be auto-formatted on each commit."
echo "For lint check, manually run: cd web && pnpm run lint"

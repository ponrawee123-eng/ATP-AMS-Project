#!/bin/bash
# Move to the script's directory
cd "$(dirname "$0")"

echo "========================================="
echo "   🚀 AUTO SYNCING CODE TO GITHUB"
echo "========================================="

# Check if git is initialized, if not initialize it
if [ ! -d ".git" ]; then
    echo "Initializing Git repository..."
    git init
    git branch -M main
fi

# Stage all files
echo "Staging files..."
git add .

# Commit changes with a date/time message
COMMIT_MSG="Auto Update - $(date '+%Y-%m-%d %H:%M:%S')"
echo "Committing: $COMMIT_MSG"
git commit -m "$COMMIT_MSG"

# Push changes to GitHub
echo "Pushing to remote repository..."
git push origin main

if [ $? -eq 0 ]; then
    echo "========================================="
    echo "   ✅ SUCCESS: Code updated on GitHub!"
    echo "   Netlify deployment starting now..."
    echo "========================================="
else
    echo "========================================="
    echo "   ❌ FAILED: Push encountered an error."
    echo "   Please check your network or git remote setup."
    echo "========================================="
fi

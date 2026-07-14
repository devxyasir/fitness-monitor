#!/bin/bash
# ============================================================================
# ReplayCoach — GitHub Actions Deploy Key Setup
# ============================================================================
# Run this ONCE locally to generate a deploy-only SSH key pair.
# Then add the public key to the server and the private key to GitHub secrets.
# ============================================================================

set -euo pipefail

KEY_NAME="github_actions_deploy"
KEY_FILE="${HOME}/.ssh/${KEY_NAME}"
SERVER="ubuntu@47.131.158.42"
SERVER_FINGERPRINT_FILE="$(dirname "$0")/.deploy-known-hosts"

echo "=== Generating deploy key pair ==="
ssh-keygen -t ed25519 -C "github-actions-deploy" -f "$KEY_FILE" -N ""

echo ""
echo "=== Public key (add to server ~/.ssh/authorized_keys) ==="
cat "${KEY_FILE}.pub"
echo ""

echo "=== Adding to server ==="
read -p "Press ENTER to copy the public key to ${SERVER}..." dummy
ssh-copy-id -i "${KEY_FILE}" "$SERVER"

echo ""
echo "=== Capturing server host key ==="
ssh-keyscan -t ed25519 47.131.158.42 > "$SERVER_FINGERPRINT_FILE" 2>/dev/null
echo "Host key fingerprint:"
ssh-keygen -lf "$SERVER_FINGERPRINT_FILE"

echo ""
echo "=== NEXT STEPS ==="
echo "1. Add these secrets to GitHub (Settings -> Secrets -> Actions):"
echo ""
echo "   DEPLOY_SSH_KEY     = contents of ${KEY_FILE} (the PRIVATE key)"
echo "   DEPLOY_KNOWN_HOSTS = contents of ${SERVER_FINGERPRINT_FILE}"
echo "   DEPLOY_HOST        = 47.131.158.42"
echo "   DEPLOY_USER        = ubuntu"
echo ""
echo "2. Commit and push the workflow file:"
echo "   git add .github/workflows/deploy-production.yml"
echo "   git commit -m \"ci: add production deploy workflow\""
echo "   git push origin main"
echo ""
echo "3. Every push to main will now auto-deploy."

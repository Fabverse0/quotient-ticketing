#!/usr/bin/env bash
# Pasang plugin Claude Code untuk proyek Quotient (scope project).
# Jalankan sekali dari folder Quotient: bash setup-plugins.sh
set -e
claude plugin marketplace add anthropics/claude-plugins-official || true
for p in context7 typescript-lsp superpowers code-review; do
  claude plugin install "$p@claude-plugins-official" --scope project
done
echo "Selesai. Cek dengan: claude plugin list"

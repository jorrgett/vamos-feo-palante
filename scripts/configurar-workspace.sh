#!/bin/bash
# Guarda el ID del workspace de Anthropic (wrkspc_…) para que la API key personal sepa dónde cobrar.
#   bash scripts/configurar-workspace.sh
set -euo pipefail
cd "$(dirname "$0")/.."

echo "Búscalo en https://platform.claude.com/settings/workspaces (empieza por wrkspc_)."
read -rp "Pega el ID del workspace y presiona Enter: " WS
WS="$(echo "${WS}" | tr -d '[:space:]')"
case "${WS}" in
  wrkspc_*) ;;
  *) echo "Eso no parece un ID de workspace (empieza por wrkspc_). Vuelve a intentar."; exit 1 ;;
esac

printf '%s' "${WS}" | npx -y vercel@64.4.0 env add ANTHROPIC_WORKSPACE_ID production --force --scope jorrgetts-projects >/dev/null 2>&1 \
  && echo "✅ Guardado en Vercel (producción)" \
  || echo "❌ No se pudo guardar en Vercel. Avísale a Claude."

touch .env.local
sed -i '' '/^ANTHROPIC_WORKSPACE_ID=/d' .env.local
printf 'ANTHROPIC_WORKSPACE_ID=%s\n' "${WS}" >> .env.local
echo "✅ Guardado en .env.local (pruebas locales)"
echo "Listo. Ya puedes cerrar esta pestaña."

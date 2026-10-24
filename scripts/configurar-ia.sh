#!/bin/bash
# Guarda la API key de Claude sin mostrarla: como secreto en Vercel (producción) y en .env.local (pruebas locales).
#   bash scripts/configurar-ia.sh
set -euo pipefail
cd "$(dirname "$0")/.."

read -rsp "Pega tu API key de Claude (no se verá en pantalla) y presiona Enter: " KEY
echo
if [ -z "${KEY}" ]; then
  echo "No pegaste nada. Vuelve a correr: bash scripts/configurar-ia.sh"
  exit 1
fi
case "${KEY}" in
  sk-ant-*) ;;
  *) echo "⚠️  Eso no parece una API key de Claude (empiezan por sk-ant-). La guardo igual." ;;
esac

# Producción (Vercel), marcada como secreta
printf '%s' "${KEY}" | npx -y vercel@64.4.0 env add ANTHROPIC_API_KEY production --sensitive --force --scope jorrgetts-projects >/dev/null 2>&1 \
  && echo "✅ Guardada en Vercel (producción)" \
  || echo "❌ No se pudo guardar en Vercel. Avísale a Claude."

# Local (para probar en este Mac)
touch .env.local
sed -i '' '/^ANTHROPIC_API_KEY=/d' .env.local
printf 'ANTHROPIC_API_KEY=%s\n' "${KEY}" >> .env.local
echo "✅ Guardada en .env.local (pruebas locales)"

unset KEY

# Workspace: las claves personales de varios workspaces necesitan saber dónde cobrar (wrkspc_…).
echo
echo "Si la clave nueva es de OTRO workspace, pega su ID (empieza por wrkspc_, está en platform.claude.com/settings/workspaces)."
echo "Si es del mismo workspace, solo presiona Enter. Si la clave no necesita workspace, escribe: ninguno"
read -rp "Workspace: " WS
WS="$(echo "${WS}" | tr -d '[:space:]')"
case "${WS}" in
  "") echo "👍 Dejo el workspace como estaba." ;;
  ninguno|NINGUNO)
    npx -y vercel@64.4.0 env rm ANTHROPIC_WORKSPACE_ID production --yes --scope jorrgetts-projects >/dev/null 2>&1 || true
    sed -i '' '/^ANTHROPIC_WORKSPACE_ID=/d' .env.local
    echo "✅ Quité el workspace (Vercel y .env.local)" ;;
  wrkspc_*)
    printf '%s' "${WS}" | npx -y vercel@64.4.0 env add ANTHROPIC_WORKSPACE_ID production --force --scope jorrgetts-projects >/dev/null 2>&1 \
      && echo "✅ Workspace guardado en Vercel (producción)" \
      || echo "❌ No se pudo guardar el workspace en Vercel. Avísale a Claude."
    sed -i '' '/^ANTHROPIC_WORKSPACE_ID=/d' .env.local
    printf 'ANTHROPIC_WORKSPACE_ID=%s\n' "${WS}" >> .env.local
    echo "✅ Workspace guardado en .env.local" ;;
  *) echo "⚠️  Eso no parece un ID de workspace (wrkspc_…). Dejo el que estaba." ;;
esac
echo "Listo. Ya puedes cerrar esta pestaña y avisarle a Claude."

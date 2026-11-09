#!/bin/bash
# Guarda la API key de Google (Gemini) sin mostrarla, solo en .env.local de este Mac.
# Se usa para generar el logo; no hace falta en producción.
#   bash scripts/configurar-google.sh
set -euo pipefail
cd "$(dirname "$0")/.."

read -rsp "Pega tu API key de Google AI Studio (no se verá en pantalla) y presiona Enter: " KEY
echo
if [ -z "${KEY}" ]; then
  echo "No pegaste nada. Vuelve a correr: bash scripts/configurar-google.sh"
  exit 1
fi

touch .env.local
sed -i '' '/^GOOGLE_API_KEY=/d' .env.local
printf 'GOOGLE_API_KEY=%s\n' "${KEY}" >> .env.local
echo "✅ Guardada en .env.local (solo en este Mac)"

# Prueba: qué modelos de imagen ve esta clave (sin mostrar la clave).
CODE=$(curl -s -o /tmp/gemini-modelos.json -w '%{http_code}' -H "x-goog-api-key: ${KEY}" "https://generativelanguage.googleapis.com/v1beta/models?pageSize=200")
unset KEY
if [ "${CODE}" = "200" ]; then
  echo "✅ La clave funciona. Modelos de imagen disponibles:"
  grep -o '"name": *"models/[^"]*image[^"]*"' /tmp/gemini-modelos.json | sed 's/.*models\//   · /; s/"$//' || echo "   (ninguno con «image» en el nombre)"
else
  echo "❌ Google respondió ${CODE}. Revisa que la clave esté activa y vuelve a correr el script."
fi
rm -f /tmp/gemini-modelos.json
echo "Listo, ya puedes volver con Claude."

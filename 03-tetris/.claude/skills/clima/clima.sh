#!/usr/bin/env bash
# Clima actual y pronóstico vía Open-Meteo (sin API key).
# Uso: ./clima.sh [ciudad] [--dias N] [--json]
set -euo pipefail

CIUDAD="Facatativa, Colombia"
DIAS=3
JSON=0
ARGS=()

while [[ $# -gt 0 ]]; do
  case "$1" in
    --dias) DIAS="$2"; shift 2 ;;
    --json) JSON=1; shift ;;
    -h|--help)
      echo "Uso: clima.sh [ciudad] [--dias N] [--json]"; exit 0 ;;
    *) ARGS+=("$1"); shift ;;
  esac
done
[[ ${#ARGS[@]} -gt 0 ]] && CIUDAD="${ARGS[*]}"

command -v jq >/dev/null || { echo "Falta jq: sudo dnf install jq" >&2; exit 1; }

# La API de geocoding solo acepta el nombre de la ciudad, no "ciudad, país".
BUSQUEDA="${CIUDAD%%,*}"
GEO=$(curl -sf --max-time 15 --get \
  --data-urlencode "name=${BUSQUEDA}" \
  "https://geocoding-api.open-meteo.com/v1/search?count=1&language=es&format=json") \
  || { echo "Error de red al geocodificar." >&2; exit 1; }

if [[ $(jq -r '.results // empty | length' <<<"$GEO") != "1" ]]; then
  echo "No encontré la ciudad: ${CIUDAD}" >&2
  exit 1
fi

read -r LAT LON TZ NOMBRE PAIS < <(jq -r '.results[0] |
  [.latitude, .longitude, .timezone, .name, (.country // "")] | @tsv' <<<"$GEO")

WX=$(curl -sf --max-time 15 \
  "https://api.open-meteo.com/v1/forecast?latitude=${LAT}&longitude=${LON}&timezone=${TZ}&forecast_days=${DIAS}&current=temperature_2m,apparent_temperature,relative_humidity_2m,precipitation,weather_code,wind_speed_10m&daily=weather_code,temperature_2m_max,temperature_2m_min,precipitation_probability_max") \
  || { echo "Error de red al consultar el clima." >&2; exit 1; }

if [[ $JSON -eq 1 ]]; then
  jq --arg ciudad "$NOMBRE" --arg pais "$PAIS" '. + {ciudad:$ciudad, pais:$pais}' <<<"$WX"
  exit 0
fi

# Códigos WMO -> texto en español.
desc() {
  case "$1" in
    0) echo "despejado" ;;
    1) echo "mayormente despejado" ;;
    2) echo "parcialmente nublado" ;;
    3) echo "nublado" ;;
    45|48) echo "niebla" ;;
    51|53|55) echo "llovizna" ;;
    56|57) echo "llovizna helada" ;;
    61|63|65) echo "lluvia" ;;
    66|67) echo "lluvia helada" ;;
    71|73|75|77) echo "nieve" ;;
    80|81|82) echo "chubascos" ;;
    85|86) echo "chubascos de nieve" ;;
    95) echo "tormenta" ;;
    96|99) echo "tormenta con granizo" ;;
    *) echo "código $1" ;;
  esac
}

read -r HORA TEMP SENS HUM PREC CODE VIENTO < <(jq -r '.current |
  [.time, .temperature_2m, .apparent_temperature, .relative_humidity_2m,
   .precipitation, .weather_code, .wind_speed_10m] | @tsv' <<<"$WX")

LLUVIA="sin lluvia"
awk "BEGIN{exit !($PREC > 0)}" && LLUVIA="lluvia ${PREC} mm"

echo "${NOMBRE}${PAIS:+, $PAIS} — ${HORA/T/ } (${TZ})"
echo "  ${TEMP} °C (sensación ${SENS}), $(desc "$CODE"), humedad ${HUM} %, viento ${VIENTO} km/h, ${LLUVIA}"
echo
echo "Pronóstico:"
jq -r '.daily | [.time, .weather_code, .temperature_2m_min, .temperature_2m_max,
                 .precipitation_probability_max] | transpose[] | @tsv' <<<"$WX" |
while IFS=$'\t' read -r FECHA C MIN MAX PROB; do
  printf '  %s  %-13s %-22s lluvia %s%%\n' "$FECHA" "${MIN}°/${MAX}°" "$(desc "$C")" "$PROB"
done

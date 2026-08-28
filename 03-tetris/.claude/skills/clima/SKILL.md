---
name: clima
description: >
  Consulta el clima actual y el pronóstico de cualquier ciudad usando Open-Meteo (sin API key,
  vía curl local). Por defecto usa Facatativá, Colombia.
  Úsala cuando el usuario pregunte por el clima, la temperatura, si va a llover, el pronóstico,
  o invoque /clima.
---

# Clima

Reporta clima actual y pronóstico. Todo local: `curl` + `jq`, sin API key ni cuenta.

## Uso

```bash
.claude/skills/clima/clima.sh                 # Facatativá (por defecto)
.claude/skills/clima/clima.sh Medellin        # otra ciudad
.claude/skills/clima/clima.sh Bogota --dias 7 # pronóstico extendido (1-16)
.claude/skills/clima/clima.sh Madrid --json   # JSON crudo para procesar
```

Ejecuta el script y **reporta su salida al usuario en español**, de forma concisa. No inventes
datos: si el script falla, di qué falló.

## Salida

```
Facatativá, Colombia — 2026-08-11 17:00 (America/Bogota)
  16.7 °C (sensación 13.6), nublado, humedad 58 %, viento 17.8 km/h, sin lluvia

Pronóstico:
  2026-08-11  9.9°/20.0°    llovizna               lluvia 6%
  2026-08-12  10.5°/19.9°   nublado                lluvia 6%
```

## Notas

- Cambiar la ciudad por defecto: edita `CIUDAD` al inicio de `clima.sh`.
- El geocoder solo busca por nombre de ciudad; el script recorta lo que va después de la coma.
  Si hay ciudades homónimas, toma la primera (la más poblada).
- Usa `curl`, no WebFetch — WebFetch cachea cada URL 15 min y devolvería datos viejos.
- Open-Meteo actualiza los datos cada ~15 min; consultar más seguido no aporta nada.
- Requiere `jq` (`sudo dnf install jq`). Sale con código 1 y mensaje si falta o si la red falla.

## Combinar con /loop

Para chequeos periódicos: `/loop 15m /clima`. El cron vive solo en la sesión y expira a los 7 días.

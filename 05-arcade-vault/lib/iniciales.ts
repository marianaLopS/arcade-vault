/**
 * Normaliza un nombre a las iniciales que acepta la columna `scores.player`
 * (`^[A-Z]{1,3}$`): sin diacríticos, mayúsculas, sólo letras, tres como mucho.
 * Si no queda nada utilizable, el jugador es `AAA`.
 *
 * Vive aparte de la Server Action para que el modal pueda enseñar exactamente
 * lo que se va a guardar, y no un nombre que el servidor recorta después.
 */
export function normalizarIniciales(raw: string): string {
  return limpiarIniciales(raw) || "AAA";
}
/**
 * Lo mismo, pero sin el `AAA` de reserva: acepta la cadena vacía. Es lo que
 * necesita el campo del modal mientras se escribe, porque un valor de reserva
 * en cada pulsación dejaría el campo imposible de borrar.
 */
export function limpiarIniciales(raw: string): string {
  return raw
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toUpperCase()
    .replace(/[^A-Z]/g, "")
    .slice(0, 3);
}

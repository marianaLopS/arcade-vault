/**
 * Regla de contraseña (SPEC 15): mínimo 8 caracteres con minúscula, mayúscula,
 * dígito y símbolo. Es la misma que "Lowercase, uppercase letters, digits and
 * symbols" del dashboard de Supabase Auth; si se cambia una, cambiar la otra.
 *
 * Vive aparte de las Server Actions para que el formulario la compruebe antes
 * de enviar y el servidor la repita con la misma fuente de verdad.
 */
export const PASSWORD_FUERTE = /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[^A-Za-z0-9]).{8,}$/;
export const ERROR_PASSWORD = "MÍNIMO 8 CARACTERES CON MAYÚSCULA, MINÚSCULA, NÚMERO Y SÍMBOLO";
export function esPasswordFuerte(password: string): boolean {
  return PASSWORD_FUERTE.test(password);
}

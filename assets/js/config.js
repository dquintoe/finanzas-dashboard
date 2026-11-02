/**
 * Configuración del dashboard (único archivo a editar al desplegar).
 * Nada de esto es secreto: el Client ID de OAuth es público por diseño y el acceso a los datos
 * lo controla Google (permiso del Sheet) + la hoja Usuarios.
 */
export const CONFIG = Object.freeze({
  // Google Cloud Console → APIs y servicios → Credenciales → ID de cliente OAuth (Aplicación web)
  CLIENT_ID: '48067919951-7mol3cn005gu28n0j30rkk3tr4nrf8t8.apps.googleusercontent.com',

  // BD_Finanzas_Dante
  SPREADSHEET_ID: '1j3ivh8zZoH8L61yazydQJ1CJ9RzV2PiMUtkG3xGqaIU',

  // Web app del Apps Script (actualizar BD, estado de lectura, gestión de usuarios)
  WEBAPP_URL: 'https://script.google.com/macros/s/AKfycbzT2VJNJuIh4XZQqu0IyryU9dHZVauqewvjE2tni6I1T7eI6JSApWIBI7DHHchubbnQ/exec',

  // Solo lectura: el dashboard nunca escribe en el Sheet
  SCOPES: 'openid email https://www.googleapis.com/auth/spreadsheets.readonly',

  HOJAS: {
    MOV: 'Movimientos', TAR: 'Tarjetas', PRE: 'Prestamos', CRO: 'Cronograma_Prestamos',
    ING: 'Ingresos', USR: 'Usuarios', CFG: 'Config', CTA: 'Cuentas'
  },

  ZONA: 'America/Lima'
});

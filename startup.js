import { setTimeout as sleep } from 'node:timers/promises';
import { initializeDatabase } from './database.js';

function errorCode(error) {
  if (error instanceof AggregateError && error.errors.length) return errorCode(error.errors[0]);
  if (error?.message === 'timeout exceeded when trying to connect') return 'ETIMEDOUT';
  return error?.code;
}

const messages = {
  MISSING_DATABASE_URL: 'Falta DATABASE_URL en Variables del servicio del juego. Añade una referencia a DATABASE_URL de Postgres.',
  INVALID_DATABASE_URL: 'DATABASE_URL no es una URL PostgreSQL válida. Vuelve a crear la referencia desde el servicio Postgres.',
  ECONNREFUSED: 'PostgreSQL rechazó la conexión. Comprueba que el servicio Postgres esté en línea y que DATABASE_URL apunte a ese servicio.',
  ENOTFOUND: 'No se encontró el servidor PostgreSQL. Comprueba la referencia DATABASE_URL y que ambos servicios estén en el mismo proyecto y entorno.',
  EAI_AGAIN: 'No se pudo resolver temporalmente la dirección de PostgreSQL.',
  ETIMEDOUT: 'Se agotó el tiempo de conexión a PostgreSQL. Comprueba que Postgres esté en línea.',
  ECONNRESET: 'La conexión a PostgreSQL se interrumpió.',
  '57P03': 'PostgreSQL todavía está arrancando y no acepta conexiones.',
  '57P01': 'PostgreSQL se está apagando. Comprueba el estado del servicio.',
  '28P01': 'PostgreSQL rechazó la contraseña. Vuelve a enlazar DATABASE_URL desde Variables; no uses credenciales antiguas.',
  '28000': 'PostgreSQL rechazó la autenticación. Revisa la referencia DATABASE_URL.',
  '3D000': 'La base de datos indicada en DATABASE_URL no existe.',
  '42501': 'El usuario PostgreSQL no tiene permisos para preparar las tablas del sorteo.',
  PARTICIPANTS_CHANGED: 'participants.json no coincide con las personas guardadas. Se conserva el sorteo; revisa la lista sin borrar la base.',
  INCOMPLETE_DRAW: 'El sorteo guardado está incompleto. No se modificaron asignaciones; requiere revisión.',
  MISSING_GAME_HTML: 'Falta la página del juego. Incluye index.html (o Bartolitos.html) junto a server.js en el repositorio.',
  ENOENT: 'Falta un archivo del proyecto. Incluye participants.json y Bartolitos.html en el repositorio y revisa Root Directory.',
  EADDRINUSE: 'El puerto de la aplicación ya está ocupado.',
  DEPTH_ZERO_SELF_SIGNED_CERT: 'Falló la validación TLS de PostgreSQL. Revisa la conexión y el certificado del servicio.',
  SELF_SIGNED_CERT_IN_CHAIN: 'Falló la validación TLS de PostgreSQL. Revisa la conexión y el certificado del servicio.'
};
const transient = new Set(['ECONNREFUSED', 'ENOTFOUND', 'EAI_AGAIN', 'ETIMEDOUT', 'ECONNRESET', '57P03', '57P01']);

// Only known, fixed messages are logged: driver errors can contain credentials or URLs.
export function describeStartupError(error) {
  const code = errorCode(error);
  if (code === 'ENOENT' && /(?:^|[\\/])participants\.json$/.test(String(error.path ?? ''))) {
    return '[ENOENT] Falta participants.json junto a server.js. Sube ese archivo al repositorio.';
  }
  if (messages[code]) return `[${code}] ${messages[code]}`;
  if (error instanceof SyntaxError) return '[INVALID_JSON] Revisa que participants.json sea JSON válido.';
  return '[STARTUP_ERROR] Error inesperado al preparar el servidor. Revisa los archivos y la configuración del despliegue.';
}

export async function initializeWithRetry(pool, participants, {
  initialize = initializeDatabase, wait = sleep, attempts = 6, log = console.warn
} = {}) {
  for (let attempt = 1; attempt <= attempts; attempt++) {
    try {
      await initialize(pool, participants);
      return;
    } catch (error) {
      if (!transient.has(errorCode(error)) || attempt === attempts) throw error;
      log(`Esperando PostgreSQL (${attempt}/${attempts}): ${describeStartupError(error)} Reintento en 3 segundos.`);
      await wait(3000);
    }
  }
}

# Bartolitos en Railway

La web ahora requiere el servidor Node.js y PostgreSQL. Abrir el HTML directamente ya no genera sorteos locales. La página principal puede llamarse `index.html`, `Bartolitos.html` o `Bartolitos (1).html`; el servidor busca en ese orden. Debe estar junto a `server.js` y `participants.json`.

## Qué garantiza el sorteo

- Hay una sola asignación compartida por todos los celulares.
- Al primer arranque se genera el sorteo completo y se guarda en una transacción.
- Cada participante regala una vez y recibe una vez; nadie se saca a sí mismo.
- PostgreSQL impide destinatarios repetidos (`UNIQUE`), participantes repetidos (`PRIMARY KEY`) y autoasignaciones (`CHECK`).
- Un bloqueo transaccional coordina arranques simultáneos de varias instancias.
- Recargar, repetir turno o desplegar de nuevo conserva las asignaciones de esa base de datos.
- Si la base de datos falla, se muestra un error: no hay un sorteo alternativo en el navegador.

## Subir a Railway

1. Sube esta carpeta a un repositorio y crea un servicio Railway desde ese repositorio.
2. En el mismo proyecto añade **PostgreSQL**.
3. En las variables del servicio web añade `DATABASE_URL` como referencia a la variable del servicio PostgreSQL: `${{Postgres.DATABASE_URL}}`. Ajusta `Postgres` si tu servicio tiene otro nombre. No publiques la URL ni la pongas en el HTML.
4. Railway ejecuta `npm start`. `railway.json` configura ese comando y la comprobación `/health`. La aplicación escucha en `0.0.0.0` y el `PORT` que Railway proporciona.
5. Genera un dominio público en **Settings → Networking** del servicio web y comparte ese enlace.

Guía oficial: https://docs.railway.com/databases/postgresql

No borres ni reemplaces la base de datos al volver a desplegar. La lista se conserva en `participants.json`; si cambia después del primer sorteo, el servidor se detiene para evitar reasignaciones accidentales. Cada entrada se trata como una persona o pareja indivisible.

Los sorteos de la versión anterior estaban guardados en cada navegador (`bartolitos-sorteo-v3`), no en una base compartida. El primer despliegue crea un sorteo nuevo; si esos resultados ya se comunicaron, hay que recuperar y migrar una lista acordada antes de poner esta versión en uso.

## Ejecutar localmente

Usa Node.js 22 o superior y una base PostgreSQL local o de desarrollo:

```sh
npm install
```

Copia `.env.example` a `.env` y configura tu `DATABASE_URL`. Después:

```sh
npm start
```

Abre http://localhost:3000. Los dos HTML sirven el mismo juego actualizado.

## Comprobar

```sh
npm test
```

Para la prueba con PostgreSQL real, configura `TEST_DATABASE_URL` en `.env` y ejecuta:

```sh
npm run test:db
```

La prueba crea y elimina exclusivamente un esquema temporal propio dentro de esa base. Comprueba seis arranques simultáneos, persistencia, no autoasignación y rechazo de destinatarios duplicados.

El selector identifica a la persona por el nombre elegido; no tiene contraseña. Quien conozca el enlace puede elegir otro nombre y ver su destinatario. El sorteo no expone la tabla completa mediante la API.

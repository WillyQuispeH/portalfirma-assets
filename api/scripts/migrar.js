// yarn db:migrar <nombre>: crea una migración con lo que cambió en prisma/schema.prisma y la aplica en asset_dev.
//
// No usa `prisma migrate dev` porque ese comando crea una base temporal («shadow database») y asset_user, a propósito,
// no tiene permiso para crear bases. En cambio compara la base real con el esquema (`migrate diff`), guarda el SQL en
// prisma/migrations/<fecha>_<nombre>/migration.sql (se sube a git) y lo aplica con `migrate deploy`.
// En producción solo se aplica lo ya creado: yarn db:migrar:prod.
const { execFileSync } = require('child_process');
const fs = require('fs');
const path = require('path');

const nombre = (process.argv[2] || '').toLowerCase().replace(/[^a-z0-9_]+/g, '_').replace(/^_|_$/g, '');
if (!nombre) {
  console.error('Uso: yarn db:migrar <nombre>   (ej.: yarn db:migrar agrega_propiedades)');
  process.exit(1);
}

const raiz = path.join(__dirname, '..');
const prisma = (args, opts = {}) =>
  execFileSync(process.execPath, [require.resolve('prisma/build/index.js'), ...args], { cwd: raiz, encoding: 'utf8', ...opts });

// 1. Primero, que la base tenga aplicadas todas las migraciones ya creadas
prisma(['migrate', 'deploy'], { stdio: 'inherit' });

// 2. SQL para pasar de la base actual al esquema
const sql = prisma(['migrate', 'diff', '--from-schema-datasource', 'prisma/schema.prisma', '--to-schema-datamodel', 'prisma/schema.prisma', '--script']);
if (!sql.trim() || /^-- This is an empty migration\.?\s*$/m.test(sql.trim())) {
  console.log('No hay cambios en el esquema: no se creó ninguna migración.');
  process.exit(0);
}

// 3. Guardar y aplicar
const sello = new Date().toISOString().replace(/[-:T]/g, '').slice(0, 14);
const dir = path.join(raiz, 'prisma', 'migrations', `${sello}_${nombre}`);
fs.mkdirSync(dir, { recursive: true });
fs.writeFileSync(path.join(dir, 'migration.sql'), sql.replace(/\r\n/g, '\n'));
const lock = path.join(raiz, 'prisma', 'migrations', 'migration_lock.toml');
if (!fs.existsSync(lock)) fs.writeFileSync(lock, '# Lo maneja Prisma. No editar.\nprovider = "postgresql"\n');
console.log(`Migración creada: prisma/migrations/${sello}_${nombre}/migration.sql`);
prisma(['migrate', 'deploy'], { stdio: 'inherit' });
try {
  prisma(['generate'], { stdio: 'pipe' });
  console.log('Cliente de Prisma actualizado.');
} catch (e) {
  // en Windows, si la API está corriendo tiene tomado el motor de Prisma y no se puede reemplazar
  if (/EPERM/.test(String(e.stderr || e.message))) console.warn('La migración quedó aplicada, pero la API está corriendo y bloquea el cliente de Prisma: detenla y corre `yarn db:generar`.');
  else throw e;
}

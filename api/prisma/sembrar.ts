// Crea la primera corredora y su administrador (SEMBRAR_* del .env). Si el email ya existe, no hace nada.
// Uso: yarn db:sembrar (desarrollo) · yarn db:sembrar:prod (producción)
import { PrismaClient } from '@prisma/client';
import { hashClave } from '../src/auth/clave';

const CLAVES = ['SEMBRAR_CORREDORA', 'SEMBRAR_ADMIN_EMAIL', 'SEMBRAR_ADMIN_NOMBRE', 'SEMBRAR_ADMIN_CLAVE'];

async function main() {
  const falta = CLAVES.filter((k) => !process.env[k]);
  if (falta.length) throw new Error(`Faltan en el .env: ${falta.join(', ')}`);
  const [corredora, emailCrudo, nombre, clave] = CLAVES.map((k) => process.env[k] as string);
  if (clave.length < 8) throw new Error('SEMBRAR_ADMIN_CLAVE debe tener al menos 8 caracteres');

  const db = new PrismaClient();
  try {
    const email = emailCrudo.trim().toLowerCase();
    if (await db.usuario.findUnique({ where: { email } })) {
      console.log(`El administrador ${email} ya existe: no se cambió nada.`);
      return;
    }
    const c = await db.corredora.create({ data: { nombre: corredora } });
    await db.usuario.create({
      data: { corredoraId: c.id, email, nombre, hashClave: await hashClave(clave), rol: 'ADMIN' },
    });
    console.log(`Listo: corredora «${c.nombre}» y administrador ${email}.`);
  } finally {
    await db.$disconnect();
  }
}

main().catch((e: Error) => {
  console.error(e.message);
  process.exit(1);
});

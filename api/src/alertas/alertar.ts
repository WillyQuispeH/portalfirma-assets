// Manda un aviso por WhatsApp al celular del administrador desde el vigilante del servidor (api/scripts/vigilar.sh).
// Corre como script suelto (no levanta la API): usa la clave de wechatia de la corredora dueña de WA_LOCATION_ID (Portal Firma)
// leyéndola de la base como lo haría la API, así la clave nunca se copia a otro lado.
//   docker run --rm --network host --env-file /home/asset/api/.env asset/api node dist/alertas/alertar.js "texto"
// Variables: ALERTA_WHATSAPP (celular que recibe el aviso, p. ej. +56982597210), WA_LOCATION_ID, WA_NUMERO, CONEXIONES_CLAVE.
// Salida: 0 enviado · 2 fuera de las 24 h de WhatsApp (el celular no le ha escrito al número de la empresa) · 1 otro error.
import { PrismaClient } from '@prisma/client';
import { CifradoService } from '../conexiones/cifrado';
import { Wechatia, WechatiaError } from '../whatsapp/wechatia';

async function main() {
  const texto = process.argv.slice(2).join(' ').trim();
  const celular = (process.env.ALERTA_WHATSAPP ?? '').trim();
  const location = (process.env.WA_LOCATION_ID ?? '').trim();
  if (!texto || !celular || !location) throw new Error('Faltan el texto, ALERTA_WHATSAPP o WA_LOCATION_ID.');
  const db = new PrismaClient();
  try {
    const conexiones = await db.conexion.findMany({
      where: { proveedor: 'wechatia', estado: 'activa', cuentaId: location },
    });
    const c = conexiones[0];
    if (!c?.accesoCif) throw new Error('No hay una conexión de wechatia activa para esa cuenta.');
    const cifrado = new CifradoService({ get: (k: string) => process.env[k] } as never);
    const wa = new Wechatia({
      token: cifrado.descifrar(c.accesoCif),
      locationId: location,
      ...(process.env.WA_NUMERO ? { numero: process.env.WA_NUMERO } : {}),
    });
    await wa.enviar({ telefono: celular, nombre: 'Administrador Asset', texto, revisiones: 3 });
    console.log('aviso enviado');
  } finally {
    await db.$disconnect();
  }
}

main().then(
  () => process.exit(0),
  (e: unknown) => {
    const codigo = e instanceof WechatiaError ? (e as { codigo?: string }).codigo : undefined;
    console.error(`no se pudo avisar: ${(e as Error).message}`);
    process.exit(codigo === 'FUERA_24H' ? 2 : 1);
  },
);

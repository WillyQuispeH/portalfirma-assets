// Arma un ACTA DE VISITA de prueba COMPLETA (visitante, propiedad, resumen, audios con su transcripción y fotos) y la deja en PDF, para ver
// cómo queda. Usa la misma plantilla (src/documentos/plantillas/acta-visita.html) y el mismo motor de PDF que el servidor.
//   npx ts-node --transpile-only scripts/muestra-acta-visita.ts [salida.pdf]
import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import sharp from 'sharp';
import { llenar } from '../src/documentos/plantilla';
import { PdfService } from '../src/documentos/pdf.service';
import { muestra } from '../src/documentos/muestras';

/** una "foto" de ejemplo: un ambiente dibujado con color y degradado (no hay fotos reales en la prueba) */
async function foto(titulo: string, c1: string, c2: string, i: number) {
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="900" height="600"><defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="${c1}"/><stop offset="1" stop-color="${c2}"/></linearGradient></defs>
  <rect width="900" height="600" fill="url(#g)"/><rect x="0" y="430" width="900" height="170" fill="rgba(0,0,0,.18)"/>
  <rect x="${120 + i * 20}" y="150" width="240" height="190" rx="8" fill="rgba(255,255,255,.55)"/><rect x="520" y="120" width="260" height="300" rx="8" fill="rgba(255,255,255,.35)"/>
  <text x="40" y="560" font-family="Arial" font-size="44" fill="white" font-weight="700">${titulo}</text></svg>`;
  const jpg = await sharp(Buffer.from(svg)).jpeg({ quality: 82 }).toBuffer();
  return `data:image/jpeg;base64,${jpg.toString('base64')}`;
}

async function main() {
  const base = muestra('acta-visita');
  const ambientes: [string, string, string][] = [
    ['Living-comedor', '#e8d5b7', '#b08968'], ['Cocina', '#cfe3d4', '#6a994e'], ['Dormitorio principal', '#d6d3f0', '#6c63a8'],
    ['Terraza', '#bfe0ee', '#2e86ab'], ['Baño', '#e9edf2', '#8d99ae'], ['Estacionamiento', '#d9d9d9', '#6c757d'],
  ];
  const fotos = [];
  for (let i = 0; i < ambientes.length; i++) fotos.push({ n: i + 1, src: await foto(ambientes[i][0], ambientes[i][1], ambientes[i][2], i), pie: i < 4 ? 'subida desde Asset' : 'por WhatsApp' });
  let logo = '';
  try { logo = `data:image/png;base64,${readFileSync(join(__dirname, '..', '..', 'desktop', 'build', 'icon.png')).toString('base64')}`; } catch { /* sin logo */ }
  const vars = {
    ...base,
    corredora: { ...(base.corredora as object), ...(logo ? { logo } : {}) },
    interesClase: 'alto',
    audios: [
      { n: 1, origen: 'Grabado en la app', cuando: '14 nov 2026, 11:05', peso: '2,4 MB', extracto: 'Aquí tenemos el living, que da a la terraza. La luz de la tarde es muy buena. Me gusta bastante la distribución, ¿el piso es flotante o porcelanato? Es porcelanato, de 2022. Perfecto, justo lo que buscábamos…' },
      { n: 2, origen: 'Subido como archivo', cuando: '14 nov 2026, 11:31', peso: '1,1 MB', extracto: 'El estacionamiento es un poco estrecho para mi auto, pero se puede maniobrar. Los gastos comunes están en ciento veinte mil pesos, con agua caliente incluida. Necesito verlo con mi pareja antes de decidir.' },
      { n: 3, origen: 'WhatsApp', cuando: '14 nov 2026, 12:02', peso: '0,6 MB', extracto: 'Resumen del corredor: el interesado quiere mudarse en diciembre, presupuesto algo por debajo de la renta; se consulta a la dueña por una rebaja y se enviarán los gastos comunes por correo.' },
    ],
    hayAudios: true,
    fotos,
    hayFotos: true,
  };
  const html = llenar(readFileSync(join(__dirname, '..', 'src', 'documentos', 'plantillas', 'acta-visita.html'), 'utf8'), vars);
  const pdf = new PdfService();
  const bytes = await pdf.pdf(html);
  const salida = process.argv[2] || join(__dirname, '..', 'muestra-acta-visita.pdf');
  writeFileSync(salida, bytes);
  console.log(`Acta de prueba: ${salida} (${Math.round(bytes.length / 1024)} KB)`);
  await pdf.onModuleDestroy();
}
main().catch((e) => { console.error(e); process.exit(1); });

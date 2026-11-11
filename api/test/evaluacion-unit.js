// Evaluación del arrendatario: lo determinista (sin red). Qué documentos faltan y el puntaje de 100 de cada persona.
// Requiere compilar antes (yarn build o la API en yarn dev, que deja dist/).
const { puntuar, revisarDocumentos } = require('../dist/whatsapp/evaluacion');
const ok = (c, m) => { if (!c) throw new Error('FALLÓ: ' + m); console.log('  ✔ ' + m); };
const arch = (n, clase, datos = {}, extra = {}) => ({ n, clase, legible: true, resumen: '', persona: { nombre: 'Ana', rut: '12.345.678-5' }, datos, alertas: [], ...extra });
const hace = (meses) => new Date(Date.now() - meses * 30.5 * 864e5).toISOString().slice(0, 10);
const futuro = new Date(Date.now() + 400 * 864e5).toISOString().slice(0, 10);

const completo = [
  arch(1, 'contrato_trabajo', { empleador: 'ACME', tipoContrato: 'indefinido', fechaInicio: hace(30) }),
  arch(2, 'cedula_frente', { vigencia: futuro }), arch(3, 'cedula_reverso'),
  arch(4, 'liquidacion', { periodo: '2026-08', liquido: 1500000 }), arch(5, 'liquidacion', { periodo: '2026-09', liquido: 1500000 }), arch(6, 'liquidacion', { periodo: '2026-10', liquido: 1500000 }),
  arch(7, 'afp', { mesesCotizados: 6, alDia: true }), arch(8, 'dicom', { sinDeudas: true }),
];
// vacío
let r = revisarDocumentos({ archivos: [] });
ok(!r.completo && r.faltan.length === 5, 'sin archivos faltan los 5 documentos');
// completo
r = revisarDocumentos({ archivos: completo });
ok(r.completo && r.faltan.length === 0, 'con todo, está completo');
// cédula a medias
r = revisarDocumentos({ archivos: completo.filter((a) => a.n !== 3) });
ok(!r.completo && /reverso/.test(r.faltan[0]), 'sin el reverso de la cédula lo avisa');
// una sola imagen con ambos lados
r = revisarDocumentos({ archivos: [...completo.filter((a) => a.clase !== 'cedula_frente' && a.clase !== 'cedula_reverso'), arch(9, 'cedula_ambas', { vigencia: futuro })] });
ok(r.completo, 'una cédula con ambos lados basta');
// 3 liquidaciones en un solo PDF
r = revisarDocumentos({ archivos: [...completo.filter((a) => a.clase !== 'liquidacion'), arch(10, 'liquidacion', { liquidaciones: [{ periodo: '2026-08', liquido: 1500000 }, { periodo: '2026-09', liquido: 1500000 }, { periodo: '2026-10', liquido: 1500000 }] })] });
ok(r.completo, 'tres liquidaciones en un mismo PDF cuentan como tres');
// solo dos liquidaciones
r = revisarDocumentos({ archivos: completo.filter((a) => a.n !== 6) });
ok(!r.completo && /2 de 3/.test(r.faltan.join()), 'con dos liquidaciones dice «2 de 3»');
// ilegible no cuenta
r = revisarDocumentos({ archivos: completo.map((a) => (a.clase === 'dicom' ? { ...a, legible: false } : a)) });
ok(!r.completo && /Dicom/.test(r.faltan.join()), 'un archivo ilegible no cuenta como entregado');

// puntaje
let p = puntuar({ nombre: 'Ana', archivos: completo }, 500000); // 3 veces el arriendo
ok(p.porcentaje === 100 && p.nivel === 'alto', `todo en regla = 100 % (dio ${p.porcentaje})`);
p = puntuar({ nombre: 'Ana', archivos: completo }, 900000); // 1,67 veces
ok(p.porcentaje < 80 && p.criterios.find((c) => c.id === 'renta').puntos === 0, 'con menos de 2 veces el arriendo la renta no suma');
p = puntuar({ nombre: 'Ana', archivos: completo }, 650000); // 2,3 veces
const renta = p.criterios.find((c) => c.id === 'renta').puntos;
ok(renta > 0 && renta < 30, `entre 2 y 3 veces suma proporcional (${renta} de 30)`);
p = puntuar({ nombre: 'Ana', archivos: completo.map((a) => (a.clase === 'dicom' ? arch(8, 'dicom', { sinDeudas: false, cantidadDeudas: 2, montoMoroso: 800000 }) : a)) }, 500000);
ok(p.porcentaje === 85 && /morosidades/.test(p.criterios.find((c) => c.id === 'dicom').detalle), `Dicom con deudas resta 15 (dio ${p.porcentaje})`);
p = puntuar({ nombre: 'Ana', archivos: completo.map((a) => (a.clase === 'contrato_trabajo' ? arch(1, 'contrato_trabajo', { tipoContrato: 'plazo_fijo', fechaInicio: hace(2) }) : a)) }, 500000);
ok(p.criterios.find((c) => c.id === 'estabilidad').puntos < 8, 'plazo fijo con 2 meses de antigüedad pesa poco en estabilidad');
p = puntuar({ nombre: 'Ana', archivos: completo.map((a, i) => (i === 7 ? arch(8, 'dicom', { sinDeudas: true }, { persona: { nombre: 'Otro', rut: '9.999.999-9' } }) : a)) }, 500000);
ok(p.criterios.find((c) => c.id === 'identidad').puntos < 10 && p.alertas.some((x) => /RUT/.test(x)), 'si el RUT cambia entre documentos baja la identidad y avisa');
p = puntuar({ nombre: 'Ana', archivos: completo.map((a) => (a.clase === 'cedula_frente' ? arch(2, 'cedula_frente', { vigencia: '2020-01-01' }) : a)) }, 500000);
ok(p.alertas.some((x) => /vencida/.test(x)), 'cédula vencida: alerta');
p = puntuar({ nombre: 'Ana', archivos: [] }, 500000);
ok(p.porcentaje === 0 && p.nivel === 'bajo', 'sin nada = 0 %');
p = puntuar({ nombre: 'Ana', archivos: completo }, null);
ok(p.criterios.find((c) => c.id === 'renta').puntos === 0 && /no se pudo comparar/.test(p.criterios.find((c) => c.id === 'renta').detalle), 'sin precio de arriendo la renta queda sin evaluar (y lo dice)');
console.log('evaluacion-unit: OK');

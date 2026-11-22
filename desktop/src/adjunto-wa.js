// El último archivo que el ejecutivo mandó por WhatsApp (p. ej. el comprobante de un pago) y lo que la IA leyó de él. Queda en memoria, vence a los
// 30 minutos y es de quien lo mandó: el Agente lo sube a un negocio cuando el ejecutivo confirma (asset_registrar_comprobante en asset-tools.js).
let actual = null;
const VIDA = 30 * 60_000;
module.exports = {
  poner(a) { actual = { ...a, en: Date.now() }; },
  ver() { if (actual && Date.now() - actual.en > VIDA) actual = null; return actual; },
  quitar() { actual = null; },
};

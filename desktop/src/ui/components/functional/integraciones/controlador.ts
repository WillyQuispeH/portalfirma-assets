// Integraciones: se abre desde el menú del usuario («Integraciones»). Es una pantalla completa (#view-integraciones),
// que monta abrirIntegraciones() de src/renderer/app.js.
export const abrirIntegraciones = () => window.abrirIntegraciones?.();
/** Configuración (pestañas: general, whatsapp, integraciones) */
export const abrirConfiguracion = (pestana?: 'general' | 'whatsapp' | 'integraciones') => window.abrirConfiguracion?.(pestana);

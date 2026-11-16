// Ventanas de la cartera que abre inmo.js: la espera mientras algo corre (importar, revisar la ficha para el portal,
// buscar avisos) y el resumen de «Importar desde Convecta». Las pruebas esperan «Cartera actualizada» y #mOk.
import Boton from '../../../ui/Boton';
import ListaDatos from '../../../ui/ListaDatos';
import { VentanaCabecera, VentanaCuerpo, VentanaPie } from '../../../ui/Ventana';
import { NOTA } from '../../gestion/editor-pdf/Modales';

/** ventana de espera: no se puede cerrar; para mostrar el avance se vuelve a abrir con otro texto */
export function Espera({ titulo, texto, idTexto, icono }: { titulo: string; texto: string; idTexto?: string; icono?: string }) {
  return <>
    <VentanaCabecera titulo={titulo} icono={icono} cerrable={false} />
    <VentanaCuerpo className="tw:text-center tw:py-7">
      <div className="spinner" />
      <p id={idTexto} className="tw:m-0 tw:text-[13.5px] tw:text-muted" aria-live="polite">{texto}</p>
    </VentanaCuerpo>
  </>;
}

interface ISinCorredor { email: string; nombre: string; propiedades: number }
interface IImportacion { total: number; nuevas: number; actualizadas: number; sinCambios: number; personas: number; errores?: number; captadores?: number; sinCaptador?: number; sinCorredor?: ISinCorredor[] }

export function Importada({ r, alVerCartera }: { r: IImportacion; alVerCartera: () => void }) {
  return <>
    <VentanaCabecera icono="check" tonoIcono="verde" titulo="Cartera actualizada" />
    <VentanaCuerpo className="tw:flex tw:flex-col tw:gap-4">
      <ListaDatos datos={[['Propiedades leídas', r.total], ['Nuevas', r.nuevas], ['Actualizadas', r.actualizadas], ['Sin cambios', r.sinCambios],
        ['Asignadas a su corredor (por correo)', r.captadores ?? null], ['Personas nuevas en el CRM', r.personas], ['No se pudieron leer', r.errores ? `${r.errores} (se reintentan en la próxima importación)` : null]]} />
      {!!r.sinCorredor?.length && (
        <div className="tw:flex tw:flex-col tw:gap-2">
          <p className="tw:m-0 tw:text-sm tw:font-semibold tw:text-text">{r.sinCaptador} {r.sinCaptador === 1 ? 'propiedad quedó' : 'propiedades quedaron'} sin captador</p>
          <p className={NOTA}>Convecta las tiene a nombre de corredores cuyo correo no existe en Asset. Crea el usuario con ese correo y vuelve a importar: se asignan solas.</p>
          <ListaDatos datos={r.sinCorredor.map((f) => [`${f.nombre || 'Sin nombre'} · ${f.email || 'sin correo'}`, `${f.propiedades} ${f.propiedades === 1 ? 'propiedad' : 'propiedades'}`])} />
        </div>
      )}
      <p className={NOTA}>Los datos que edites aquí se respetan en las próximas importaciones.</p>
    </VentanaCuerpo>
    <VentanaPie><Boton id="mOk" onClick={alVerCartera}>Ver cartera</Boton></VentanaPie>
  </>;
}

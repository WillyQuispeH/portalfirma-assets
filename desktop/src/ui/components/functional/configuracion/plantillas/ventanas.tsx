// Ventanas de Configuración › Plantillas (abrirModal + las partes de Ventana.tsx). Cada una devuelve una promesa:
//   · pedirNotaVersion   (modal-141)  «Guardar versión»: nota opcional            → string | null (null = cancelar)
//   · pedirAprobacion    (modal-142)  «Aprobar»: revisado por (obligatorio) y nota → { revisor, nota } | null
//   · elegirVersion      (modal-143)  «Historial de versiones»: restaurar una      → número de versión | null
//   · configurarFirma    (modal-149)  «Cómo se firma»: tipo de firma y legalización → { tipoFirma, tramite } | null
// Las confirmaciones (confirmar de utils/app.ts) usan modal-144 (toda la plantilla a la base), modal-145 (restaurar una
// versión) y modal-146 (salir con cambios sin guardar), en Detalle.tsx.
import { useState, type FormEvent, type ReactElement } from 'react';
import { VentanaCabecera, VentanaCuerpo, VentanaPie } from '../../../ui/Ventana';
import Boton from '../../../ui/Boton';
import Input from '../../../ui/Input';
import Textarea from '../../../ui/Textarea';
import Select from '../../../ui/Select';
import ItemLista from '../../../ui/ItemLista';
import Badge from '../../../ui/Badge';
import Icono from '../../../ui/Icono';
import { abrirModal, cerrarModal } from '../../../../utils/modal';
import { fechaHora } from '../../../../utils/formato';
import type { IFirmaPlantilla, IVersionPlantilla } from './tipos';

function NotaVersion({ alResponder }: { alResponder: (nota: string | null) => void }) {
  const [nota, setNota] = useState('');
  const enviar = (e: FormEvent) => { e.preventDefault(); alResponder(nota.trim()); };
  return <>
    <VentanaCabecera titulo="Guardar versión" descripcion="Los documentos nuevos se arman con la versión que guardes." icono="save" onCerrar={() => alResponder(null)} />
    <VentanaCuerpo>
      <form id="plNotaForm" onSubmit={enviar} className="tw:flex tw:flex-col tw:gap-3">
        <Input id="plNota" etiqueta="Nota (opcional)" value={nota} maxLength={500} autoFocus placeholder="Qué cambió, p. ej. «Comisión de arriendo al 50%»"
          onChange={(e) => setNota(e.target.value)} />
        <p className="tw:m-0 tw:text-[13px] tw:text-muted">Si la plantilla estaba aprobada, queda como borrador hasta que se vuelva a aprobar.</p>
      </form>
    </VentanaCuerpo>
    <VentanaPie>
      <Boton id="mCancel" variante="secundario" onClick={() => alResponder(null)}>Cancelar</Boton>
      <Boton id="mOk" type="submit" form="plNotaForm" icono="save">Guardar versión</Boton>
    </VentanaPie>
  </>;
}

function Aprobacion({ version, alResponder }: { version: number; alResponder: (r: { revisor: string; nota: string } | null) => void }) {
  const [revisor, setRevisor] = useState('');
  const [nota, setNota] = useState('');
  const [error, setError] = useState('');
  const enviar = (e: FormEvent) => {
    e.preventDefault();
    if (revisor.trim().length < 2) { setError('Escribe quién revisó la plantilla (nombre del abogado o notario).'); return; }
    alResponder({ revisor: revisor.trim(), nota: nota.trim() });
  };
  return <>
    <VentanaCabecera titulo="Aprobar la plantilla" descripcion={version ? `Versión ${version}` : 'La base de Asset, sin cambios propios'} icono="check" tonoIcono="verde" onCerrar={() => alResponder(null)} />
    <VentanaCuerpo>
      <form id="plAprobarForm" onSubmit={enviar} className="tw:flex tw:flex-col tw:gap-3">
        <p className="tw:m-0 tw:text-sm tw:leading-relaxed">
          El administrador registra aquí la revisión que hizo el <b>abogado o notario</b> de la corredora. Queda anotado quién la revisó, quién lo registró y cuándo.
          Si después se guarda otra versión o cambia la base, la plantilla vuelve a quedar por aprobar.
        </p>
        <Input id="plRevisor" etiqueta="Revisado por" value={revisor} maxLength={160} autoFocus aria-required="true" placeholder="Nombre del abogado o notario"
          error={error || null} onChange={(e) => { setRevisor(e.target.value); setError(''); }} />
        <Textarea id="plAprobarNota" etiqueta="Nota (opcional)" rows={2} value={nota} maxLength={500} placeholder="p. ej. Revisada por correo del 15 de noviembre"
          onChange={(e) => setNota(e.target.value)} />
      </form>
    </VentanaCuerpo>
    <VentanaPie>
      <Boton id="mCancel" variante="secundario" onClick={() => alResponder(null)}>Cancelar</Boton>
      <Boton id="mOk" type="submit" form="plAprobarForm" variante="exito" icono="check">Aprobar</Boton>
    </VentanaPie>
  </>;
}

function Historial({ versiones, vigente, puedeEditar, alResponder }: { versiones: IVersionPlantilla[]; vigente: number; puedeEditar: boolean; alResponder: (n: number | null) => void }) {
  const restaurar = (n: number) => puedeEditar && n !== vigente
    ? <Boton variante="secundario" tamano="sm" icono="undo" data-restaurar={n} onClick={() => alResponder(n)}>Restaurar</Boton>
    : n === vigente ? <Badge tono="verde">Vigente</Badge> : null;
  return <>
    <VentanaCabecera titulo="Historial de versiones" descripcion="Restaurar crea una versión nueva igual a la elegida; no se borra nada." icono="clock" onCerrar={() => alResponder(null)} />
    <VentanaCuerpo sinRelleno>
      <div id="plHistorial" className="tw:flex tw:flex-col tw:p-2">
        {versiones.map((v) => (
          <ItemLista key={v.n} data-version={v.n} media={<Icono nombre="file" tam={18} />} titulo={`Versión ${v.n}${v.nota ? ` · ${v.nota}` : ''}`}
            detalle={`${v.porNombre || 'Sin nombre'} · ${fechaHora(v.en)} · ${v.cambiadas === 1 ? '1 cláusula propia' : `${v.cambiadas} cláusulas propias`}`}
            derecha={restaurar(v.n)} />
        ))}
        <ItemLista data-version={0} media={<Icono nombre="template" tam={18} />} titulo="La base de Asset" detalle="El texto común, sin cambios propios" derecha={restaurar(0)} />
      </div>
    </VentanaCuerpo>
    <VentanaPie>
      <Boton id="mCancel" variante="secundario" onClick={() => alResponder(null)}>Cerrar</Boton>
    </VentanaPie>
  </>;
}

function ConfigurarFirma({ firma, soloLectura, alResponder }: { firma: IFirmaPlantilla; soloLectura: boolean; alResponder: (f: IFirmaPlantilla | null) => void }) {
  const [f, setF] = useState<IFirmaPlantilla>(firma);
  const enviar = (e: FormEvent) => { e.preventDefault(); alResponder(f); };
  const cambio = f.tipoFirma !== firma.tipoFirma || f.tramite !== firma.tramite;
  return <>
    <VentanaCabecera titulo="Cómo se firma" descripcion={soloLectura ? 'Solo el administrador de la corredora puede cambiarlo.' : 'Vale para todos los documentos que se arman con esta plantilla.'} icono="sign" onCerrar={() => alResponder(null)} />
    <VentanaCuerpo>
      <form id="plFirmaForm" onSubmit={enviar} className="tw:flex tw:flex-col tw:gap-3">
        <Select id="plTipoFirma" etiqueta="Tipo de firma" disabled={soloLectura} value={f.tipoFirma} opciones={[['simple', 'Firma simple'], ['avanzada', 'Firma avanzada']]}
          ayuda={f.tipoFirma === 'avanzada' ? 'Avanzada: se verifica la identidad de quien firma con certificado o Clave Única. Cuesta más en Portalfirma.' : 'Simple: quien firma confirma con un código que le llega por correo o al celular.'}
          onChange={(e) => setF((x) => ({ ...x, tipoFirma: e.target.value as IFirmaPlantilla['tipoFirma'] }))} />
        <Select id="plTramite" etiqueta="Legalización notarial" disabled={soloLectura} value={f.tramite} opciones={[['none', 'Sin trámite'], ['legalization', 'Con legalización notarial']]}
          ayuda="Portalfirma coordina la legalización; tiene un costo adicional."
          onChange={(e) => setF((x) => ({ ...x, tramite: e.target.value as IFirmaPlantilla['tramite'] }))} />
      </form>
    </VentanaCuerpo>
    <VentanaPie>
      <Boton id="mCancel" variante="secundario" onClick={() => alResponder(null)}>{soloLectura ? 'Cerrar' : 'Cancelar'}</Boton>
      {!soloLectura && <Boton id="mOk" type="submit" form="plFirmaForm" icono="save" disabled={!cambio}>Guardar</Boton>}
    </VentanaPie>
  </>;
}

function preguntar<T>(dibujar: (fin: (r: T | null) => void) => ReactElement, clave: string): Promise<T | null> {
  return new Promise((resolver) => {
    const fin = (r: T | null) => { cerrarModal(); resolver(r); };
    abrirModal(dibujar(fin), { clave });
  });
}

export const pedirNotaVersion = () => preguntar<string>((fin) => <NotaVersion alResponder={fin} />, 'modal-141');
export const pedirAprobacion = (version: number) => preguntar<{ revisor: string; nota: string }>((fin) => <Aprobacion version={version} alResponder={fin} />, 'modal-142');
export const elegirVersion = (versiones: IVersionPlantilla[], vigente: number, puedeEditar: boolean) =>
  preguntar<number>((fin) => <Historial versiones={versiones} vigente={vigente} puedeEditar={puedeEditar} alResponder={fin} />, 'modal-143');
export const configurarFirma = (firma: IFirmaPlantilla, soloLectura: boolean) => preguntar<IFirmaPlantilla>((fin) => <ConfigurarFirma firma={firma} soloLectura={soloLectura} alResponder={fin} />, 'modal-149');

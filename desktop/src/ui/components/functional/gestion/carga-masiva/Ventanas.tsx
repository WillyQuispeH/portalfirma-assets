// Ventanas de la carga masiva que abre el código antiguo (src/renderer/masiva.js y flujos.js) con window.Ventanas.abrir.
// Partes del kit: VentanaCabecera, VentanaCuerpo y VentanaPie, sueltas en un fragmento. La lógica (pf.bulkUpdate,
// pf.bulkSend, saldo y pagador) sigue en el JS antiguo y llega como props.
// Las pruebas usan .bk-sigrow, [data-k], #bkAll, #bkPay, #flPay, #mOk y #mCancel. .bk-sigs ensancha la ventana (styles.css).
import { useEffect, useState } from 'react';
import Boton from '../../../ui/Boton';
import Input from '../../../ui/Input';
import ListaDatos from '../../../ui/ListaDatos';
import { VentanaCabecera, VentanaCuerpo, VentanaPie } from '../../../ui/Ventana';
import { cerrarModal } from '../../../../utils/modal';
import { P, NOTA, FORM } from '../editor-pdf/Modales';

export interface IFirmanteLote { fullName: string; rut: string; email: string; phone: string; alias: string; [k: string]: unknown }
const VACIO = (): IFirmanteLote => ({ fullName: '', rut: '', email: '', phone: '', alias: '' });

// Firmantes de un documento de la cola (modal-42). El orden es el orden de firma.
export function FirmantesDocumento({ nombre, tipo, firmantes, requeridos = {}, alGuardar, alUsarEnTodos }: {
  nombre: string; tipo?: string; firmantes?: IFirmanteLote[]; requeridos?: { name?: boolean; email?: boolean; phone?: boolean };
  alGuardar: (filas: IFirmanteLote[]) => void; alUsarEnTodos: (filas: IFirmanteLote[]) => void;
}) {
  const [filas, setFilas] = useState<IFirmanteLote[]>(() => (firmantes?.length ? firmantes.map((s) => ({ ...s })) : [VACIO()]));
  const cambiar = (i: number, k: string, v: string) => setFilas((l) => l.map((s, j) => (j === i ? { ...s, [k]: v } : s)));
  const campo = (s: IFirmanteLote, i: number, k: keyof IFirmanteLote & string, ph: string) =>
    <Input data-k={k} placeholder={ph} value={String(s[k] ?? '')} onChange={(e) => cambiar(i, k, e.target.value)} />;
  return <>
    <VentanaCabecera icono="users" titulo={`Firmantes de «${nombre}»`} descripcion={tipo || undefined} />
    <VentanaCuerpo>
      <div className="bk-sigs">
        {filas.map((s, i) => (
          <div key={i} className="bk-sigrow" data-i={i}>
            <b>{i + 1}</b>
            {campo(s, i, 'fullName', `Nombre completo${requeridos.name ? ' *' : ''}`)}
            {campo(s, i, 'rut', 'RUT *')}
            {campo(s, i, 'alias', 'Rol * (arrendador…)')}
            {campo(s, i, 'email', `Correo${requeridos.email ? ' *' : ''}`)}
            {campo(s, i, 'phone', `Teléfono${requeridos.phone ? ' *' : ''}`)}
            <Boton variante="fantasma" tamano="sm" icono="trash" data-rm={i} title="Quitar" className="tw:px-2 tw:text-red-ink"
              onClick={() => setFilas((l) => l.filter((_, j) => j !== i))} />
          </div>
        ))}
      </div>
      <Boton id="bkAdd" variante="fantasma" tamano="sm" icono="plus" onClick={() => setFilas((l) => [...l, VACIO()])}>Agregar firmante</Boton>
      <p className={NOTA}>El orden es el orden de firma.</p>
    </VentanaCuerpo>
    <VentanaPie>
      <Boton id="bkAll" variante="secundario" className="tw:mr-auto" title="Copiar estos firmantes a todos los documentos listos" onClick={() => alUsarEnTodos(filas)}>Usar en todos</Boton>
      <Boton id="mCancel" variante="secundario" onClick={cerrarModal}>Cancelar</Boton>
      <Boton id="mOk" onClick={() => alGuardar(filas)}>Guardar</Boton>
    </VentanaPie>
  </>;
}

const TRAMITE: Record<string, string> = { none: 'Solo firma electrónica', legalization: 'Legalizar', protocolization: 'Protocolizar' };
// Confirmar el envío de varios documentos (modal-22 de Flujos y modal-43 de la carga masiva): saldo y trámite. Cierra y llama a alEnviar().
// (No pide correo del pagador: el envío lo paga la cuenta de las credenciales de la API de Portalfirma.)
export function ConfirmarEnvioLote({ n, saldo: saldoInicial, saldoPromesa, tramite, deAUna = false, alEnviar }: {
  n: number; saldo?: number | null; /** el saldo al día, que se consulta mientras la ventana ya está abierta */ saldoPromesa?: Promise<number | null>; tramite?: string | null; deAUna?: boolean; alEnviar: () => void;
}) {
  const [saldo, setSaldo] = useState<number | null | undefined>(saldoInicial); const [consultando, setConsultando] = useState(!!saldoPromesa);
  useEffect(() => {
    let vivo = true; saldoPromesa?.then((v) => { if (vivo && v != null) setSaldo(v); }).catch(() => null).finally(() => { if (vivo) setConsultando(false); });
    return () => { vivo = false; };
  }, [saldoPromesa]);
  const enviar = () => { cerrarModal(); alEnviar(); };
  return <>
    <VentanaCabecera icono="send" titulo={`Enviar ${n} documento(s) a firmar`} />
    <VentanaCuerpo className={FORM}>
      <p className={P}>Se crearán <strong>{n} operaciones</strong> en Portalfirma, una por documento{deAUna ? ', de a una' : ''}. <strong>Cada envío descuenta saldo</strong> según el tipo de firma y el trámite.</p>
      <ListaDatos datos={[['Saldo actual', consultando && saldo == null ? <span className="tw:inline-flex tw:items-center tw:gap-2 tw:text-muted"><span className="spinner sm" aria-hidden="true" />Consultando…</span> : saldo != null ? '$' + Number(saldo).toLocaleString('es-CL') : '—'], ...(tramite === null ? [] : [['Trámite', TRAMITE[tramite || 'none'] || '—'] as [string, string]])]} />
    </VentanaCuerpo>
    <VentanaPie>
      <Boton id="mCancel" variante="secundario" onClick={cerrarModal}>Cancelar</Boton>
      <Boton id="mOk" icono="send" onClick={enviar}>Enviar {n}</Boton>
    </VentanaPie>
  </>;
}

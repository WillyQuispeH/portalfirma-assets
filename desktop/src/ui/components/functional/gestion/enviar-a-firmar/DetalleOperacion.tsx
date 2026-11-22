// El seguimiento de una operación recién enviada: estado, firmantes y sus enlaces de firma
// (copiar, enviar por correo o WhatsApp), ver el documento y reenviar a todos.
import { envioOperacion } from '../../../../store/hooks/useEnvio.hook';
import { abrirEnEditor, configurarAccesoDocumentos, toast } from '../../../../utils/app';
import { ESTADOS_OPERACION } from '../../../../utils/envio';
import type { IDetalleOperacion, IFirmanteOperacion } from '../../../../store/interfaces/envio.interface';

import Boton from '../../../ui/Boton';
const nombre = (s: IFirmanteOperacion) => [s.name, s.paternalLastName, s.maternalLastName].filter(Boolean).join(' ');

export default function DetalleOperacion({ d, alActualizar }: { d: IDetalleOperacion; alActualizar: () => void }) {
  const [etiqueta, clase] = ESTADOS_OPERACION[d.status || ''] || [d.status || '—', ''];
  const firmantes = d.signatories || [];
  const intentar = (fn: () => Promise<unknown>) => () => { fn().catch((e) => toast('Error: ' + (e as Error).message, 4000)); };
  const verDocumento = async () => {
    const r = await envioOperacion.archivo(d.operation);
    if (!r.ok) { if (r.code === 'NO_FILE_KEY') return configurarAccesoDocumentos(); throw new Error(r.error); }
    abrirEnEditor(r.data!.path);
  };
  return <>
    <div className="row-between"><h3>Operación {d.operation}</h3><span className={`pill ${clase}`}>{etiqueta}</span></div>
    <table>
      <tbody>
        <tr><th>#</th><th>Firmante</th><th>RUT</th><th>Estado</th><th>Enlace de firma</th></tr>
        {firmantes.map((s, i) => (
          <tr key={i}>
            <td>{i + 1}</td>
            <td>{nombre(s)}<br /><span className="muted small">{s.email} {s.phone}</span></td>
            <td>{s.rut}</td>
            <td>{s.signed ? <span className="pill ok">Firmó</span> : <span className="pill wait">Pendiente</span>}</td>
            <td>{!s.signed && (
              <div className="link-actions">
                <Boton variante="secundario" tamano="sm" data-copy={(s.url || '').trim()} onClick={intentar(async () => { await navigator.clipboard.writeText((s.url || '').trim()); toast('Enlace copiado'); })}>Copiar</Boton>
                <Boton variante="secundario" tamano="sm" data-reenviar={i} disabled={!s.id} onClick={intentar(async () => {
                  await envioOperacion.reenviar({ operacion: d.operation, firmanteId: s.id });
                  toast('Enlace reenviado a ' + (s.email || nombre(s)));
                })}>Reenviar enlace</Boton>
              </div>
            )}</td>
          </tr>
        ))}
      </tbody>
    </table>
    {d.processId != null && <><h3 style={{ marginTop: 14 }}>Documento</h3><Boton variante="secundario" tamano="sm" data-doc onClick={intentar(verDocumento)}>Ver documento</Boton></>}
    <div className="actions" style={{ marginTop: 12 }}>
      <Boton variante="fantasma" tamano="sm" data-refresh onClick={alActualizar}>Actualizar</Boton>
      {d.status !== 'finalized' && <Boton variante="secundario" tamano="sm" data-resend onClick={intentar(async () => { await envioOperacion.reenviar({ operacion: d.operation }); toast('Operación reenviada'); })}>Reenviar a todos</Boton>}
    </div>
  </>;
}

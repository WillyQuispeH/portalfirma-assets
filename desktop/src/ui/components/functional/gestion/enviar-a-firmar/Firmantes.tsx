// Los firmantes del documento, en orden de firma: datos, rol y tipo de firma de cada uno.
// Los errores se muestran al salir del campo o al intentar enviar. Los id, la clase signer y data-i, data-k
// los usan las pruebas; los estilos son de Tailwind (tw:).
import Icono from '../../../ui/Icono';
import { useEnvio } from '../../../../store/hooks/useEnvio.hook';
import { TIPOS_FIRMA, configBloqueada, erroresFirmante, requerido } from '../../../../utils/envio';
import type { IFirmante, TCampoFirmante } from '../../../../store/interfaces/envio.interface';

const CAMPOS: [TCampoFirmante, string, string, string][] = [
  ['fullName', 'Nombre completo', 'text', ''],
  ['rut', 'RUT', 'text', '12.345.678-9'],
  ['alias', 'Rol en el documento', 'text', 'arrendador, comprador…'],
  ['email', 'Correo', 'email', 'nombre@correo.cl'],
  ['phone', 'Teléfono', 'tel', '+56 9 1234 5678'],
];

function Firmante({ s, i, total }: { s: IFirmante; i: number; total: number }) {
  const { analisis, requeridos, envioCampo, envioSalirCampo, envioQuitar, envioMover } = useEnvio();
  const err = erroresFirmante(s, requeridos);
  return (
    <div className="signer tw:border tw:border-line tw:rounded-[10px] tw:p-3 tw:mb-2.5">
      <div className="tw:flex tw:items-center tw:gap-2 tw:mb-2"><span className="order">{i + 1}</span><strong>{s.fullName || 'Nuevo firmante'}</strong>
        <span className="spacer" />
        <button className="ghost small" data-act="up" data-i={i} disabled={i === 0} title="Subir" onClick={() => envioMover(i, -1)}><Icono nombre="chevU" tam={15} /></button>
        <button className="ghost small" data-act="down" data-i={i} disabled={i === total - 1} title="Bajar" onClick={() => envioMover(i, 1)}><Icono nombre="chevD" tam={15} /></button>
        <button className="danger small" data-act="del" data-i={i} disabled={total === 1} onClick={() => envioQuitar(i)}>Quitar</button></div>
      <div className="tw:grid tw:grid-cols-3 tw:gap-x-3 tw:gap-y-0 tw:max-[820px]:grid-cols-2">
        {CAMPOS.map(([k, etiqueta, tipo, ph]) => {
          const malo = s.tocado && err[k];
          return (
            <label key={k}>{etiqueta}{requerido(requeridos, k) ? ' *' : ''}
              <input data-i={i} data-k={k} type={tipo} value={s[k]} placeholder={ph} className={malo ? 'invalid' : ''}
                onChange={(e) => envioCampo(i, k, e.target.value)} onBlur={() => envioSalirCampo(i, k)} />
              {malo && <span className="missing">{err[k]}</span>}
            </label>
          );
        })}
        {!configBloqueada(analisis) && (
          <label>Tipo de firma (este firmante)
            <select data-i={i} data-k="typeSign" value={s.typeSign} onChange={(e) => { envioCampo(i, 'typeSign', e.target.value); envioSalirCampo(i, 'typeSign'); }}>
              <option value="">Igual que el documento</option>
              {Object.entries(TIPOS_FIRMA).map(([v, l]) => <option key={v} value={v}>{l}</option>)}
            </select>
          </label>
        )}
      </div>
    </div>
  );
}

export default function Firmantes() {
  const { firmantes } = useEnvio();
  return <div id="signers">{firmantes.map((s, i) => <Firmante key={i} s={s} i={i} total={firmantes.length} />)}</div>;
}

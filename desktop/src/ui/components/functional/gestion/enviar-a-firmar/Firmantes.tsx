// Los firmantes del documento, en orden de firma: datos, rol y tipo de firma de cada uno.
// Los errores se muestran al salir del campo o al intentar enviar. Los id, la clase signer y data-i, data-k
// los usan las pruebas; los estilos son de Tailwind (tw:).
import { useState } from 'react';
import { useEnvio } from '../../../../store/hooks/useEnvio.hook';
import { TIPOS_FIRMA, configBloqueada, erroresFirmante, requerido } from '../../../../utils/envio';
import type { IFirmante, TCampoFirmante } from '../../../../store/interfaces/envio.interface';

import Boton from '../../../ui/Boton';
import { degradadoFirmante } from '../../agenda/PdfConFirmas';
import Input from '../../../ui/Input';
import Select from '../../../ui/Select';
const CAMPOS: [TCampoFirmante, string, string, string][] = [
  ['fullName', 'Nombre completo', 'text', ''],
  ['rut', 'RUT', 'text', '12.345.678-9'],
  ['alias', 'Rol en el documento', 'text', 'arrendador, comprador…'],
  ['email', 'Correo', 'email', 'nombre@correo.cl'],
  ['phone', 'Teléfono', 'tel', '+56 9 1234 5678'],
];

/** el recuadro de cada firmante en el PDF sigue a su persona: se avisa para que lo mueva o lo quite junto con ella */
const avisarPdf = (d: { tipo: 'mover'; de: number; a: number } | { tipo: 'quitar'; i: number }) => window.dispatchEvent(new CustomEvent('pcf-orden', { detail: d }));

function Firmante({ s, i, total, arrastrando, sobre, alArrastrar }: { s: IFirmante; i: number; total: number; arrastrando: number | null; sobre: number | null; alArrastrar: (a: { de: number | null; sobre: number | null }) => void }) {
  const { analisis, tipoFirma, requeridos, envioCampo, envioSalirCampo, envioQuitar, envioReordenar } = useEnvio();
  const err = erroresFirmante(s, requeridos);
  const soltar = () => {
    if (arrastrando !== null && arrastrando !== i) { avisarPdf({ tipo: 'mover', de: arrastrando, a: i }); envioReordenar(arrastrando, i); }
    alArrastrar({ de: null, sobre: null });
  };
  return (
    <div className={`signer tw:border tw:rounded-control tw:p-3 tw:mb-2.5 ${sobre === i && arrastrando !== i ? 'tw:border-lav-edge tw:bg-lav' : 'tw:border-line'} ${arrastrando === i ? 'tw:opacity-50' : ''}`}
      onDragOver={(e) => { if (arrastrando === null) return; e.preventDefault(); if (sobre !== i) alArrastrar({ de: arrastrando, sobre: i }); }} onDrop={(e) => { e.preventDefault(); soltar(); }}>
      <div className="tw:flex tw:items-center tw:gap-2 tw:mb-2">
        <span draggable data-act="drag" data-i={i} title="Arrastra para cambiar el orden de firma" aria-label={`Mover al firmante ${i + 1}: arrástralo para cambiar quién firma primero`}
          className="tw:inline-flex tw:cursor-grab tw:touch-none tw:select-none tw:items-center tw:px-1 tw:text-muted active:tw:cursor-grabbing"
          onDragStart={(e) => { e.dataTransfer.effectAllowed = 'move'; e.dataTransfer.setData('text/plain', String(i)); const c = (e.currentTarget as HTMLElement).closest('.signer'); if (c) e.dataTransfer.setDragImage(c, 20, 20); alArrastrar({ de: i, sobre: null }); }}
          onDragEnd={() => alArrastrar({ de: null, sobre: null })}>
          <svg width="12" height="18" viewBox="0 0 12 18" aria-hidden="true" fill="currentColor">{[3, 9, 15].map((y) => [3, 9].map((x) => <circle key={`${x}-${y}`} cx={x} cy={y} r="1.6" />))}</svg>
        </span>
        <span className="order tw:cursor-pointer" style={{ background: degradadoFirmante(i), color: '#fff' }} title="Su recuadro en el PDF: toca para verlo" onClick={() => window.dispatchEvent(new CustomEvent('pcf-ir', { detail: i }))}>{i + 1}</span><strong>{s.fullName || 'Nuevo firmante'}</strong>
        <span className="spacer" />
        <Boton variante="peligro" tamano="sm" data-act="del" data-i={i} disabled={total === 1} onClick={() => { avisarPdf({ tipo: 'quitar', i }); envioQuitar(i); }}>Quitar</Boton></div>
      <div className="tw:grid tw:grid-cols-2 tw:gap-ui">
        {CAMPOS.map(([k, etiqueta, tipo, ph]) => {
          const malo = s.tocado && err[k];
          return (
            <Input key={k} data-i={i} data-k={k} type={tipo} etiqueta={`${etiqueta}${requerido(requeridos, k) ? ' *' : ''}`} value={s[k]} placeholder={ph}
              error={malo ? err[k] : null} onChange={(e) => envioCampo(i, k, e.target.value)} onBlur={() => envioSalirCampo(i, k)} />
          );
        })}
        {!configBloqueada(analisis) && (
          <Select data-i={i} data-k="typeSign" etiqueta="Tipo de firma" value={s.typeSign || tipoFirma} opciones={Object.entries(TIPOS_FIRMA)}
            onChange={(e) => { envioCampo(i, 'typeSign', e.target.value); envioSalirCampo(i, 'typeSign'); }} />
        )}
      </div>
    </div>
  );
}

export default function Firmantes() {
  const { firmantes } = useEnvio();
  const [ar, setAr] = useState<{ de: number | null; sobre: number | null }>({ de: null, sobre: null });
  return <div id="signers">{firmantes.map((s, i) => <Firmante key={i} s={s} i={i} total={firmantes.length} arrastrando={ar.de} sobre={ar.sobre} alArrastrar={setAr} />)}</div>;
}

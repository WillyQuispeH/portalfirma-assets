// Formularios en ventana del editor PDF (en el modal de la app, utils/modal.tsx), con las partes del kit:
// VentanaCabecera, VentanaCuerpo y VentanaPie, sueltas en un fragmento.
// Los id (#mOk, #mCancel, #mNo, #spN, #nFmt, #wText, #cSize, #plName…) y los name de las opciones los usan las pruebas.
import { useState, type InputHTMLAttributes, type ReactNode } from 'react';
import Boton from '../../../ui/Boton';
import Input from '../../../ui/Input';
import Select from '../../../ui/Select';
import { CAJA } from '../../../ui/Campo';
import { VentanaCabecera, VentanaCuerpo, VentanaPie } from '../../../ui/Ventana';
import type { TTono } from '../../../ui/tonos';
import { cerrarModal } from '../../../../utils/modal';
import { toast } from '../../../../utils/app';
import { cx } from '../../../../utils/cx';

// textos del cuerpo: párrafo y nota en gris (también los usan ModalesPlantilla y plantillas.tsx)
export const P = 'tw:mt-0 tw:mb-3 tw:last:mb-0 tw:leading-relaxed';
export const NOTA = 'tw:m-0 tw:text-[12.5px] tw:text-muted tw:leading-relaxed';
// cuerpo de un formulario: campos uno bajo otro
export const FORM = 'tw:flex tw:flex-col tw:gap-3.5';
export const DOS = 'tw:grid tw:grid-cols-2 tw:gap-3';

/** una opción (radio o casilla) con su texto a la derecha */
export function Opcion({ children, className, ...input }: InputHTMLAttributes<HTMLInputElement> & { children: ReactNode }) {
  return (
    <label className={cx('tw:flex tw:items-start tw:gap-2.5 tw:m-0 tw:text-[13.5px] tw:leading-relaxed tw:text-text tw:cursor-pointer', className)}>
      <input className="tw:size-4 tw:m-0 tw:mt-[3px] tw:p-0 tw:flex-none tw:cursor-pointer" {...input} />
      <span className="tw:min-w-0">{children}</span>
    </label>
  );
}
// caja pequeña dentro del texto de una opción (Dividir: «Cada [N] página(s)»)
const CAJA_EN_LINEA = cx(CAJA, 'tw:inline-block tw:h-8 tw:mx-1 tw:align-middle');

const Cancelar = ({ texto = 'Cancelar', alCancelar }: { texto?: string; alCancelar?: () => void }) =>
  <Boton id="mCancel" variante="secundario" onClick={() => { cerrarModal(); alCancelar?.(); }}>{texto}</Boton>;

// Confirmación simple (título, texto y un botón)
export function Confirmar({ titulo, children, boton, peligro, icono, tonoIcono, alAceptar, alCancelar }: { titulo: ReactNode; children?: ReactNode; boton: string; peligro?: boolean; icono?: string; tonoIcono?: TTono; alAceptar: () => void; alCancelar?: () => void }) {
  return <>
    <VentanaCabecera titulo={titulo} icono={icono} tonoIcono={tonoIcono} />
    {children ? <VentanaCuerpo>{children}</VentanaCuerpo> : null}
    <VentanaPie><Cancelar alCancelar={alCancelar} /><Boton id="mOk" variante={peligro ? 'peligro' : 'principal'} onClick={() => { cerrarModal(); alAceptar(); }}>{boton}</Boton></VentanaPie>
  </>;
}

export function AbrirEnlace({ url, alAbrir }: { url: string; alAbrir: () => void }) {
  return <>
    <VentanaCabecera icono="link" titulo="Abrir enlace" descripcion="El documento quiere abrir:" />
    <VentanaCuerpo>
      <p className={cx(P, 'mono tw:text-[13px] tw:break-all')}>{url}</p>
      <p className={NOTA}>Ábrelo solo si confías en el documento.</p>
    </VentanaCuerpo>
    <VentanaPie><Cancelar /><Boton id="mOk" onClick={() => { cerrarModal(); alAbrir(); }}>Abrir</Boton></VentanaPie>
  </>;
}

export function CambiosSinGuardar({ nombre, alResponder }: { nombre: string; alResponder: (r: 'cancelar' | 'descartar' | 'guardar') => void }) {
  const fin = (r: 'cancelar' | 'descartar' | 'guardar') => { cerrarModal(); alResponder(r); };
  return <>
    <VentanaCabecera icono="save" tonoIcono="amarillo" titulo="Cambios sin guardar" />
    <VentanaCuerpo><p className={P}>«{nombre}» tiene cambios que no has guardado.</p></VentanaCuerpo>
    <VentanaPie>
      <Boton id="mCancel" variante="secundario" onClick={() => fin('cancelar')}>Cancelar</Boton>
      <Boton id="mNo" variante="peligro" onClick={() => fin('descartar')}>Descartar</Boton>
      <Boton id="mOk" onClick={() => fin('guardar')}>Guardar</Boton>
    </VentanaPie>
  </>;
}

export function CrearPdf({ alCrear }: { alCrear: (tam: string, horizontal: boolean, n: number) => void }) {
  const [tam, setTam] = useState('letter'); const [or, setOr] = useState('p'); const [n, setN] = useState('1');
  return <>
    <VentanaCabecera icono="filePlus" titulo="Crear PDF" />
    <VentanaCuerpo className={FORM}>
      <Select etiqueta="Tamaño" id="cSize" value={tam} onChange={(e) => setTam(e.target.value)}
        opciones={[['letter', 'Carta (216 × 279 mm)'], ['oficio', 'Oficio (216 × 330 mm)'], ['a4', 'A4 (210 × 297 mm)']]} />
      <div className={DOS}>
        <Select etiqueta="Orientación" id="cOr" value={or} onChange={(e) => setOr(e.target.value)} opciones={[['p', 'Vertical'], ['l', 'Horizontal']]} />
        <Input etiqueta="Páginas" type="number" id="cN" value={n} min="1" max="200" onChange={(e) => setN(e.target.value)} />
      </div>
      <p className={NOTA}>También puedes crear un PDF desde Word, Excel o imágenes con <strong>Convertir a PDF</strong>.</p>
    </VentanaCuerpo>
    <VentanaPie><Cancelar /><Boton id="mOk" onClick={() => { cerrarModal(); alCrear(tam, or === 'l', Number(n) || 1); }}>Crear</Boton></VentanaPie>
  </>;
}

// Dividir: cada N páginas o por rangos («1-3, 4, 5-9»)
export function Dividir({ total, alDividir }: { total: number; alDividir: (grupos: number[][]) => void }) {
  const [modo, setModo] = useState('every'); const [n, setN] = useState('1'); const [rangos, setRangos] = useState('');
  const ok = () => {
    const groups: number[][] = [];
    if (modo === 'every') { const k = Math.max(1, Number(n) || 1); for (let i = 0; i < total; i += k) groups.push([...Array(Math.min(k, total - i)).keys()].map((j) => i + j)); }
    else {
      for (const part of rangos.split(',')) { const m = /^\s*(\d+)\s*(?:-\s*(\d+))?\s*$/.exec(part); if (!m) continue; const a = Number(m[1]), b = Number(m[2] || m[1]); const g: number[] = []; for (let k = Math.min(a, b); k <= Math.max(a, b); k++) if (k >= 1 && k <= total) g.push(k - 1); if (g.length) groups.push(g); }
      if (!groups.length) return toast('Indica rangos válidos, por ejemplo 1-3, 4');
    }
    cerrarModal(); alDividir(groups);
  };
  return <>
    <VentanaCabecera icono="scissors" titulo="Dividir PDF" descripcion={`${total} página(s)`} />
    <VentanaCuerpo className={FORM}>
      <Opcion type="radio" name="spMode" value="every" checked={modo === 'every'} onChange={() => setModo('every')}>
        Cada <input type="number" id="spN" value={n} min="1" className={cx(CAJA_EN_LINEA, 'tw:w-[70px]')} onChange={(e) => setN(e.target.value)} /> página(s)
      </Opcion>
      <Opcion type="radio" name="spMode" value="ranges" checked={modo === 'ranges'} onChange={() => setModo('ranges')}>
        Por rangos <input type="text" id="spR" placeholder="1-3, 4, 5-9" className={cx(CAJA_EN_LINEA, 'tw:w-[160px]')} value={rangos} onChange={(e) => setRangos(e.target.value)} />
      </Opcion>
      <p className={NOTA}>Se guardan como archivos separados en la carpeta que elijas.</p>
    </VentanaCuerpo>
    <VentanaPie><Cancelar /><Boton id="mOk" onClick={ok}>Dividir</Boton></VentanaPie>
  </>;
}

export function Numerar({ grande, alNumerar }: { grande: boolean; alNumerar: (fmt: string, pos: string, inicio: number) => void }) {
  const [fmt, setFmt] = useState('Página {n} de {t}'); const [pos, setPos] = useState(grande ? 'tr' : 'br'); const [ini, setIni] = useState('1');
  return <>
    <VentanaCabecera icono="hash" titulo="Numerar páginas" />
    <VentanaCuerpo className={FORM}>
      <Select etiqueta="Formato" id="nFmt" value={fmt} onChange={(e) => setFmt(e.target.value)}
        opciones={[['Página {n} de {t}', 'Página 1 de 10'], ['{n}', '1'], ['{n} / {t}', '1 / 10'], ['Fs. {n}', 'Fs. 1 (foliado)']]} />
      <div className={DOS}>
        <Select etiqueta="Posición" id="nPos" value={pos} onChange={(e) => setPos(e.target.value)}
          opciones={[['br', 'Abajo a la derecha'], ['bc', 'Abajo al centro'], ['tr', 'Arriba a la derecha']]} />
        <Input etiqueta="Comenzar en" type="number" id="nStart" value={ini} min="0" onChange={(e) => setIni(e.target.value)} />
      </div>
    </VentanaCuerpo>
    <VentanaPie><Cancelar /><Boton id="mOk" onClick={() => { cerrarModal(); alNumerar(fmt, pos, Number(ini) || 1); }}>Numerar</Boton></VentanaPie>
  </>;
}

export function MarcaDeAgua({ alAplicar }: { alAplicar: (texto: string, opacidad: number) => void }) {
  const [t, setT] = useState('COPIA'); const [op, setOp] = useState('0.22');
  return <>
    <VentanaCabecera icono="droplet" titulo="Marca de agua" />
    <VentanaCuerpo className={FORM}>
      <Input etiqueta="Texto" type="text" id="wText" value={t} onChange={(e) => setT(e.target.value)} />
      <Select etiqueta="Intensidad" id="wOp" value={op} onChange={(e) => setOp(e.target.value)} opciones={[['0.12', 'Suave'], ['0.22', 'Media'], ['0.35', 'Fuerte']]} />
    </VentanaCuerpo>
    <VentanaPie><Cancelar /><Boton id="mOk" onClick={() => { cerrarModal(); if (t.trim()) alAplicar(t.trim(), Number(op)); }}>Aplicar a todas las páginas</Boton></VentanaPie>
  </>;
}

export function Exportar({ tipo, alExportar }: { tipo?: string; alExportar: (k: string, dpi: number) => void }) {
  const [k, setK] = useState(tipo && ['docx', 'png', 'jpg', 'txt'].includes(tipo) ? tipo : 'docx'); const [dpi, setDpi] = useState('150');
  const op = (v: string, cont: ReactNode) => <Opcion type="radio" name="exK" value={v} checked={k === v} onChange={() => setK(v)}>{cont}</Opcion>;
  return <>
    <VentanaCabecera icono="export" titulo="Exportar PDF" />
    <VentanaCuerpo className={FORM}>
      <div className="tw:flex tw:flex-col tw:gap-2">
        {op('docx', <><strong>Word (.docx)</strong> — texto editable con negritas y cursivas, una página de Word por página</>)}
        {op('png', <><strong>Imágenes PNG</strong> — una imagen por página</>)}
        {op('jpg', <><strong>Imágenes JPG</strong> — más livianas</>)}
        {op('txt', <><strong>Texto (.txt)</strong></>)}
      </div>
      <Select etiqueta="Resolución de imágenes" id="exDpi" value={dpi} onChange={(e) => setDpi(e.target.value)} opciones={[['150', '150 ppp (pantalla)'], ['300', '300 ppp (impresión)']]} />
      <p className={NOTA}>Si hay páginas escaneadas, primero se reconoce su texto para exportarlo a Word o texto.</p>
    </VentanaCuerpo>
    <VentanaPie><Cancelar /><Boton id="mOk" onClick={() => { cerrarModal(); alExportar(k, Number(dpi)); }}>Exportar</Boton></VentanaPie>
  </>;
}

export function Aplanar({ n, alAplanar }: { n: number; alAplanar: () => void }) {
  return <Confirmar icono="layers" titulo={`Aplanar ${n > 1 ? n + ' páginas' : 'página'}`} boton="Aplanar" alAceptar={alAplanar}>
    <p className={P}>La página se convierte en una imagen de alta resolución. Así desaparece por completo cualquier texto que quedó <strong>tapado</strong> debajo de una edición.</p>
    <p className={NOTA}>Después puedes usar <strong>Reconocer texto</strong> para que vuelva a ser buscable.</p>
  </Confirmar>;
}

export function Ocr({ escaneadas, actual, total, alReconocer }: { escaneadas: number; actual: number; total: number; alReconocer: (que: string) => void }) {
  const [w, setW] = useState(escaneadas ? 'scanned' : 'current');
  const op = (v: string, txt: string, dis = false) => <Opcion type="radio" name="ocrW" value={v} checked={w === v} disabled={dis} onChange={() => setW(v)} className={dis ? 'tw:opacity-55 tw:cursor-default' : ''}>{txt}</Opcion>;
  return <>
    <VentanaCabecera icono="scanText" titulo="Reconocer texto (OCR)" />
    <VentanaCuerpo className={FORM}>
      <p className="tw:m-0 tw:leading-relaxed">Convierte el texto de páginas escaneadas o fotocopias en texto real: se puede <strong>buscar</strong>, <strong>copiar</strong> y <strong>editar</strong> con «Editar texto». Funciona sin internet, en español.</p>
      <div className="tw:flex tw:flex-col tw:gap-2">
        {op('scanned', `Páginas sin texto (${escaneadas})`, !escaneadas)}
        {op('current', `Solo esta página (${actual + 1})`)}
        {op('all', `Todas las páginas (${total})`)}
      </div>
      <p className={NOTA}>Cada página toma unos segundos. La calidad depende de la nitidez del escaneo.</p>
    </VentanaCuerpo>
    <VentanaPie><Cancelar /><Boton id="mOk" onClick={() => { cerrarModal(); alReconocer(w); }}>Reconocer</Boton></VentanaPie>
  </>;
}

export function MuyPesado({ tam, alComprimir }: { tam: string; alComprimir: () => void }) {
  return <>
    <VentanaCabecera icono="compress" tonoIcono="amarillo" titulo="Documento muy pesado" />
    <VentanaCuerpo>
      <p className={P}>Pesa <strong>{tam}</strong> y Portalfirma acepta hasta 20 MB.</p>
      <p className={NOTA}>Prueba <strong>Comprimir</strong>, o separa el documento con <strong>Dividir</strong>.</p>
    </VentanaCuerpo>
    <VentanaPie><Cancelar texto="Cerrar" /><Boton id="mOk" onClick={() => { cerrarModal(); alComprimir(); }}>Comprimir ahora</Boton></VentanaPie>
  </>;
}

// Firmar plano arquitectónico: láminas + compresión + hoja de firmas tamaño carta
export function Plano({ abierto, alSeguir }: { abierto: string | null; alSeguir: (meta: { name: string; addr: string; pro: string }, usarAbierto: boolean) => void }) {
  const [m, setM] = useState({ name: '', addr: '', pro: '' }); const [usar, setUsar] = useState(!!abierto);
  const opcional = <span className="tw:font-normal tw:text-muted">(opcional)</span>;
  return <>
    <VentanaCabecera icono="plan" titulo="Firmar plano arquitectónico"
      descripcion={<>Junta las láminas, las comprime si es necesario y agrega al final una <strong>hoja de firmas tamaño carta</strong> que identifica cada lámina, para que las firmas queden a tamaño normal.</>} />
    <VentanaCuerpo className={FORM}>
      <Input etiqueta="Nombre del proyecto" type="text" id="plName" placeholder="Ej. Vivienda unifamiliar Los Aromos 123" value={m.name} onChange={(e) => setM({ ...m, name: e.target.value })} />
      <div className={DOS}>
        <Input etiqueta={<>Dirección o rol {opcional}</>} type="text" id="plAddr" value={m.addr} onChange={(e) => setM({ ...m, addr: e.target.value })} />
        <Input etiqueta={<>Profesional responsable {opcional}</>} type="text" id="plPro" value={m.pro} onChange={(e) => setM({ ...m, pro: e.target.value })} />
      </div>
      <Opcion type="checkbox" id="plUseOpen" checked={usar} disabled={!abierto} onChange={(e) => setUsar(e.target.checked)} className={!abierto ? 'tw:opacity-55 tw:cursor-default' : ''}>
        Usar el documento abierto{abierto ? ` (${abierto})` : ''}
      </Opcion>
    </VentanaCuerpo>
    <VentanaPie><Cancelar /><Boton id="mOk" onClick={() => { cerrarModal(); alSeguir({ name: m.name.trim(), addr: m.addr.trim(), pro: m.pro.trim() }, usar); }}>{usar ? 'Continuar' : 'Elegir láminas…'}</Boton></VentanaPie>
  </>;
}

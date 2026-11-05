// Formularios en ventana del editor PDF (en el modal de la app, utils/modal.tsx).
// Los id (#mOk, #mCancel, #spN, #nFmt, #wText, #cSize, #plName…) y los name de las opciones los usan las pruebas.
import { useState, type ReactNode } from 'react';
import { cerrarModal } from '../../../../utils/modal';
import { toast } from '../../../../utils/app';

const Acciones = ({ children }: { children: ReactNode }) => <div className="actions">{children}</div>;
const Cancelar = ({ texto = 'Cancelar', alCancelar }: { texto?: string; alCancelar?: () => void }) =>
  <button className="secondary" id="mCancel" onClick={() => { cerrarModal(); alCancelar?.(); }}>{texto}</button>;

// Confirmación simple (título, texto y un botón)
export function Confirmar({ titulo, children, boton, peligro, alAceptar, alCancelar }: { titulo: ReactNode; children?: ReactNode; boton: string; peligro?: boolean; alAceptar: () => void; alCancelar?: () => void }) {
  return <>
    <h2>{titulo}</h2>{children}
    <Acciones><Cancelar alCancelar={alCancelar} /><button className={peligro ? 'danger' : 'primary'} id="mOk" onClick={() => { cerrarModal(); alAceptar(); }}>{boton}</button></Acciones>
  </>;
}

export function AbrirEnlace({ url, alAbrir }: { url: string; alAbrir: () => void }) {
  return <>
    <h2>Abrir enlace</h2><p>El documento quiere abrir:</p><p className="mono small" style={{ wordBreak: 'break-all' }}>{url}</p>
    <p className="muted small">Ábrelo solo si confías en el documento.</p>
    <Acciones><Cancelar /><button className="primary" id="mOk" onClick={() => { cerrarModal(); alAbrir(); }}>Abrir</button></Acciones>
  </>;
}

export function CambiosSinGuardar({ nombre, alResponder }: { nombre: string; alResponder: (r: 'cancelar' | 'descartar' | 'guardar') => void }) {
  const fin = (r: 'cancelar' | 'descartar' | 'guardar') => { cerrarModal(); alResponder(r); };
  return <>
    <h2>Cambios sin guardar</h2><p>«{nombre}» tiene cambios que no has guardado.</p>
    <Acciones><button className="secondary" id="mCancel" onClick={() => fin('cancelar')}>Cancelar</button><button className="danger" id="mNo" onClick={() => fin('descartar')}>Descartar</button><button className="primary" id="mOk" onClick={() => fin('guardar')}>Guardar</button></Acciones>
  </>;
}

export function CrearPdf({ alCrear }: { alCrear: (tam: string, horizontal: boolean, n: number) => void }) {
  const [tam, setTam] = useState('letter'); const [or, setOr] = useState('p'); const [n, setN] = useState('1');
  return <>
    <h2>Crear PDF</h2>
    <label>Tamaño<select id="cSize" value={tam} onChange={(e) => setTam(e.target.value)}><option value="letter">Carta (216 × 279 mm)</option><option value="oficio">Oficio (216 × 330 mm)</option><option value="a4">A4 (210 × 297 mm)</option></select></label>
    <div className="grid2"><label>Orientación<select id="cOr" value={or} onChange={(e) => setOr(e.target.value)}><option value="p">Vertical</option><option value="l">Horizontal</option></select></label><label>Páginas<input type="number" id="cN" value={n} min="1" max="200" onChange={(e) => setN(e.target.value)} /></label></div>
    <p className="muted small">También puedes crear un PDF desde Word, Excel o imágenes con <strong>Convertir a PDF</strong>.</p>
    <Acciones><Cancelar /><button className="primary" id="mOk" onClick={() => { cerrarModal(); alCrear(tam, or === 'l', Number(n) || 1); }}>Crear</button></Acciones>
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
    <h2>Dividir PDF</h2>
    <label className="radio"><input type="radio" name="spMode" value="every" checked={modo === 'every'} onChange={() => setModo('every')} /> <span>Cada <input type="number" id="spN" value={n} min="1" style={{ width: 60, display: 'inline-block' }} onChange={(e) => setN(e.target.value)} /> página(s)</span></label>
    <label className="radio"><input type="radio" name="spMode" value="ranges" checked={modo === 'ranges'} onChange={() => setModo('ranges')} /> <span>Por rangos <input type="text" id="spR" placeholder="1-3, 4, 5-9" style={{ width: 160, display: 'inline-block' }} value={rangos} onChange={(e) => setRangos(e.target.value)} /></span></label>
    <p className="muted small">Se guardan como archivos separados en la carpeta que elijas.</p>
    <Acciones><Cancelar /><button className="primary" id="mOk" onClick={ok}>Dividir</button></Acciones>
  </>;
}

export function Numerar({ grande, alNumerar }: { grande: boolean; alNumerar: (fmt: string, pos: string, inicio: number) => void }) {
  const [fmt, setFmt] = useState('Página {n} de {t}'); const [pos, setPos] = useState(grande ? 'tr' : 'br'); const [ini, setIni] = useState('1');
  return <>
    <h2>Numerar páginas</h2>
    <label>Formato<select id="nFmt" value={fmt} onChange={(e) => setFmt(e.target.value)}><option value="Página {n} de {t}">Página 1 de 10</option><option value="{n}">1</option><option value="{n} / {t}">1 / 10</option><option value="Fs. {n}">Fs. 1 (foliado)</option></select></label>
    <div className="grid2"><label>Posición<select id="nPos" value={pos} onChange={(e) => setPos(e.target.value)}><option value="br">Abajo a la derecha</option><option value="bc">Abajo al centro</option><option value="tr">Arriba a la derecha</option></select></label>
      <label>Comenzar en<input type="number" id="nStart" value={ini} min="0" onChange={(e) => setIni(e.target.value)} /></label></div>
    <Acciones><Cancelar /><button className="primary" id="mOk" onClick={() => { cerrarModal(); alNumerar(fmt, pos, Number(ini) || 1); }}>Numerar</button></Acciones>
  </>;
}

export function MarcaDeAgua({ alAplicar }: { alAplicar: (texto: string, opacidad: number) => void }) {
  const [t, setT] = useState('COPIA'); const [op, setOp] = useState('0.22');
  return <>
    <h2>Marca de agua</h2>
    <label>Texto<input type="text" id="wText" value={t} onChange={(e) => setT(e.target.value)} /></label>
    <label>Intensidad<select id="wOp" value={op} onChange={(e) => setOp(e.target.value)}><option value="0.12">Suave</option><option value="0.22">Media</option><option value="0.35">Fuerte</option></select></label>
    <Acciones><Cancelar /><button className="primary" id="mOk" onClick={() => { cerrarModal(); if (t.trim()) alAplicar(t.trim(), Number(op)); }}>Aplicar a todas las páginas</button></Acciones>
  </>;
}

export function Exportar({ tipo, alExportar }: { tipo?: string; alExportar: (k: string, dpi: number) => void }) {
  const [k, setK] = useState(tipo && ['docx', 'png', 'jpg', 'txt'].includes(tipo) ? tipo : 'docx'); const [dpi, setDpi] = useState('150');
  const op = (v: string, cont: ReactNode) => <label className="radio"><input type="radio" name="exK" value={v} checked={k === v} onChange={() => setK(v)} /> <span>{cont}</span></label>;
  return <>
    <h2>Exportar PDF</h2>
    {op('docx', <><strong>Word (.docx)</strong> — texto editable con negritas y cursivas, una página de Word por página</>)}
    {op('png', <><strong>Imágenes PNG</strong> — una imagen por página</>)}
    {op('jpg', <><strong>Imágenes JPG</strong> — más livianas</>)}
    {op('txt', <><strong>Texto (.txt)</strong></>)}
    <label>Resolución de imágenes<select id="exDpi" value={dpi} onChange={(e) => setDpi(e.target.value)}><option value="150">150 ppp (pantalla)</option><option value="300">300 ppp (impresión)</option></select></label>
    <p className="muted small">Si hay páginas escaneadas, primero se reconoce su texto para exportarlo a Word o texto.</p>
    <Acciones><Cancelar /><button className="primary" id="mOk" onClick={() => { cerrarModal(); alExportar(k, Number(dpi)); }}>Exportar</button></Acciones>
  </>;
}

export function Aplanar({ n, alAplanar }: { n: number; alAplanar: () => void }) {
  return <Confirmar titulo={`Aplanar ${n > 1 ? n + ' páginas' : 'página'}`} boton="Aplanar" alAceptar={alAplanar}>
    <p>La página se convierte en una imagen de alta resolución. Así desaparece por completo cualquier texto que quedó <strong>tapado</strong> debajo de una edición.</p>
    <p className="muted small">Después puedes usar <strong>Reconocer texto</strong> para que vuelva a ser buscable.</p>
  </Confirmar>;
}

export function Ocr({ escaneadas, actual, total, alReconocer }: { escaneadas: number; actual: number; total: number; alReconocer: (que: string) => void }) {
  const [w, setW] = useState(escaneadas ? 'scanned' : 'current');
  const op = (v: string, txt: string, dis = false) => <label className="radio"><input type="radio" name="ocrW" value={v} checked={w === v} disabled={dis} onChange={() => setW(v)} /> <span>{txt}</span></label>;
  return <>
    <h2>Reconocer texto (OCR)</h2>
    <p>Convierte el texto de páginas escaneadas o fotocopias en texto real: se puede <strong>buscar</strong>, <strong>copiar</strong> y <strong>editar</strong> con «Editar texto». Funciona sin internet, en español.</p>
    {op('scanned', `Páginas sin texto (${escaneadas})`, !escaneadas)}
    {op('current', `Solo esta página (${actual + 1})`)}
    {op('all', `Todas las páginas (${total})`)}
    <p className="muted small">Cada página toma unos segundos. La calidad depende de la nitidez del escaneo.</p>
    <Acciones><Cancelar /><button className="primary" id="mOk" onClick={() => { cerrarModal(); alReconocer(w); }}>Reconocer</button></Acciones>
  </>;
}

export function MuyPesado({ tam, alComprimir }: { tam: string; alComprimir: () => void }) {
  return <>
    <h2>Documento muy pesado</h2><p>Pesa <strong>{tam}</strong> y Portalfirma acepta hasta 20 MB.</p>
    <p className="muted">Prueba <strong>Comprimir</strong>, o separa el documento con <strong>Dividir</strong>.</p>
    <Acciones><Cancelar texto="Cerrar" /><button className="primary" id="mOk" onClick={() => { cerrarModal(); alComprimir(); }}>Comprimir ahora</button></Acciones>
  </>;
}

// Firmar plano arquitectónico: láminas + compresión + hoja de firmas tamaño carta
export function Plano({ abierto, alSeguir }: { abierto: string | null; alSeguir: (meta: { name: string; addr: string; pro: string }, usarAbierto: boolean) => void }) {
  const [m, setM] = useState({ name: '', addr: '', pro: '' }); const [usar, setUsar] = useState(!!abierto);
  return <>
    <h2>Firmar plano arquitectónico</h2>
    <p className="muted">Junta las láminas, las comprime si es necesario y agrega al final una <strong>hoja de firmas tamaño carta</strong> que identifica cada lámina, para que las firmas queden a tamaño normal.</p>
    <label>Nombre del proyecto<input type="text" id="plName" placeholder="Ej. Vivienda unifamiliar Los Aromos 123" value={m.name} onChange={(e) => setM({ ...m, name: e.target.value })} /></label>
    <div className="grid2"><label>Dirección o rol <span className="muted small">(opcional)</span><input type="text" id="plAddr" value={m.addr} onChange={(e) => setM({ ...m, addr: e.target.value })} /></label>
      <label>Profesional responsable <span className="muted small">(opcional)</span><input type="text" id="plPro" value={m.pro} onChange={(e) => setM({ ...m, pro: e.target.value })} /></label></div>
    <label className="radio"><input type="checkbox" id="plUseOpen" checked={usar} disabled={!abierto} onChange={(e) => setUsar(e.target.checked)} /> <span>Usar el documento abierto{abierto ? ` (${abierto})` : ''}</span></label>
    <Acciones><Cancelar /><button className="primary" id="mOk" onClick={() => { cerrarModal(); alSeguir({ name: m.name.trim(), addr: m.addr.trim(), pro: m.pro.trim() }, usar); }}>{usar ? 'Continuar' : 'Elegir láminas…'}</button></Acciones>
  </>;
}

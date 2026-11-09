// Documento a medida: no hay una plantilla con ese nombre en la cuenta → Asset lo arma (texto automático o redactado
// con IA), lo pasa a PDF y lo envía a firmar. Con el kit: Card (Tarjeta), Input, Select, Textarea, Badge y Boton.
/* eslint-disable @typescript-eslint/no-explicit-any -- datos del proceso principal sin tipos */
import { useEffect, useRef, useState } from 'react';
import Boton from '../../../ui/Boton';
import Badge from '../../../ui/Badge';
import Icono from '../../../ui/Icono';
import Input from '../../../ui/Input';
import Select from '../../../ui/Select';
import Textarea from '../../../ui/Textarea';
import { toast } from '../../../../utils/app';
import { cx } from '../../../../utils/cx';
import { Ag, Campos, Casilla, ErrorTexto, Falta, Grupo, Nota, Tarjeta, TarjetaCargando, W, api, useTarjeta } from './comun';
import { Confirmacion } from './Documentos';
import { resultado } from './gestion';

export interface IDocNuevo { propId?: string | null; titulo?: string; tipoDoc?: string | null; personaId?: string | null; negocioId?: string | null }
const DATOS_FIRMANTE: [string, string, string?][] = [['alias', 'Rol en el documento', 'pagador, visitante, arrendatario…'], ['nombre', 'Nombre'], ['rut', 'RUT'], ['email', 'Correo'], ['telefono', 'Celular', '+56 9 …']];
const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export function DocNuevo({ o }: { o: IDocNuevo }) {
  const [listo, setListo] = useState<{ tipo: string; f: any } | null>(null); const [error, setError] = useState('');
  useEffect(() => {
    let vivo = true;
    (async () => {
      let tipo = o.tipoDoc || ''; let titulo = o.titulo || '';
      if (!tipo) { try { const b = await api('dgBuscar', { texto: titulo, propId: o.propId || null }); tipo = b.tipo; titulo = b.titulo; } catch { tipo = 'libre'; } }
      const f = await api('dgPreparar', { tipo, titulo, propId: o.propId || null, negocioId: o.negocioId || null, personaId: o.personaId || null });
      if (vivo) setListo({ tipo, f });
    })().catch((e) => { if (vivo) setError(e.message); });
    return () => { vivo = false; };
  }, [o]);
  if (error) return <Tarjeta icono="filePlus" titulo={o.titulo || 'Documento'}><ErrorTexto texto={error} /></Tarjeta>;
  if (!listo) return <TarjetaCargando texto={`Preparando «${o.titulo || 'el documento'}»…`} />;
  return <Editor o={o} tipo={listo.tipo} f={listo.f} />;
}

function Editor({ o, tipo, f }: { o: IDocNuevo; tipo: string; f: any }) {
  const { node, terminar } = useTarjeta();
  const [titulo, setTitulo] = useState(f.titulo);
  const [datos, setDatos] = useState<Record<string, string>>(() => Object.fromEntries(f.campos.map((c: any) => [c.id, c.valor ?? ''])));
  const [firm, setFirm] = useState<any[]>(() => f.firmantes.map((x: any) => ({ ...x })));
  const [texto, setTexto] = useState(''); const [auto, setAuto] = useState(true); const [iaHecha, setIaHecha] = useState(false);
  const [ligar, setLigar] = useState(true); const [redactando, setRedactando] = useState(false); const [viendo, setViendo] = useState(false);
  const [conf, setConf] = useState(false); const [enviando, setEnviando] = useState(false); const [faltaConf, setFaltaConf] = useState('');
  const [pag, setPag] = useState('');
  const libre = tipo === 'libre';
  const pers = [...f.personas].sort((a: any, b: any) => (b.rol ? 1 : 0) - (a.rol ? 1 : 0) || a.nombre.localeCompare(b.nombre, 'es'));

  const parrafos = (t = texto) => t.split(/\n\s*\n/).map((x) => x.replace(/\s+/g, ' ').trim()).filter(Boolean);
  const objeto = () => ({
    tipo, titulo: titulo.trim(), propId: o.propId || null, negocioId: f.negocio?.pideFirma && ligar ? f.negocio.id : null, personaId: o.personaId || null,
    datos: Object.fromEntries(Object.entries(datos).map(([k, v]) => [k, String(v).trim()])),
    firmantes: firm.map((x) => ({ ...x, ...Object.fromEntries(DATOS_FIRMANTE.map(([k]) => [k, String(x[k] || '').trim()])) })),
    parrafos: parrafos(),
  });
  const ultimo = useRef(objeto); ultimo.current = objeto;

  // el texto automático se vuelve a armar cuando cambian los datos (si no lo editaste tú)
  const tk = useRef(0);
  useEffect(() => {
    if (libre || !auto) return;
    const my = ++tk.current;
    const t = setTimeout(async () => { try { const r = await api('dgRedactar', ultimo.current()); if (my === tk.current) setTexto(r.parrafos.join('\n\n')); } catch { /* queda el texto anterior */ } }, texto ? 250 : 0);
    return () => clearTimeout(t);
  }, [datos, firm, titulo, auto, ligar]); // eslint-disable-line react-hooks/exhaustive-deps -- texto no debe disparar otra redacción
  useEffect(() => { const t = setTimeout(() => Ag().bajar(), 50); return () => clearTimeout(t); }, []);

  // lo que falta
  const faltaDato = (c: any) => c.requerido && !String(datos[c.id] || '').trim();
  const faltaFirm = (x: any, k: string) => x.firma && !String(x[k] || '').trim();
  const nFalta = f.campos.filter(faltaDato).length + firm.reduce((s, x) => s + DATOS_FIRMANTE.filter(([k]) => faltaFirm(x, k)).length, 0) + (parrafos().length ? 0 : 1);
  const hueco = /____/.test(texto);
  const modo = libre ? (iaHecha ? 'Redactado con IA · puedes editarlo' : '') : auto ? 'Automático: se actualiza con los datos' : 'Editado por ti';

  const cambiarFirm = (i: number, k: string, v: unknown) => setFirm((l) => l.map((x, j) => (j === i ? { ...x, [k]: v } : x)));
  const elegirPersona = (i: number, id: string) => {
    const c = f.personas.find((x: any) => x.id === id);
    setFirm((l) => l.map((x, j) => (j === i ? { ...x, personaId: c?.id || null, ...Object.fromEntries(DATOS_FIRMANTE.map(([k]) => [k, c ? c[k] || '' : ''])) } : x)));
  };
  const redactar = async () => {
    setRedactando(true);
    try { const r = await api('dgRedactar', objeto()); setTexto(r.parrafos.join('\n\n')); setIaHecha(true); if (r.tokens) W.Asistente?.actualizarTokens?.(r.tokens); } catch (er) { toast((er as Error).message, 6000); }
    setRedactando(false);
  };
  const verPdf = async () => {
    if (!parrafos().length) return toast('Primero el texto del documento.');
    setViendo(true); try { await api('dgVista', objeto()); toast('Se abrió el PDF de borrador.'); } catch (er) { toast((er as Error).message, 5000); } setViendo(false);
  };
  const revisar = () => {
    if (nFalta || hueco) { node.querySelector<HTMLElement>('.falta input, .falta select, .falta textarea')?.focus(); return toast('Completa los datos marcados.'); }
    let x = ''; try { x = localStorage.getItem('pf.pagador') || ''; } catch { /* sin almacenamiento */ }
    setPag(x || firm.find((s) => s.rol === 'corredor')?.email || ''); setFaltaConf(''); setConf(true); setTimeout(() => Ag().bajar(), 0);
  };
  const enviar = async () => {
    const email = pag.trim(); if (!EMAIL.test(email)) return setFaltaConf('Escribe el correo del pagador.');
    try { localStorage.setItem('pf.pagador', email); } catch { /* sin almacenamiento */ }
    const ob = objeto(); setEnviando(true); setFaltaConf('');
    let res: any; try { res = await api('dgEnviar', { ...ob, email }); } catch (e) { setEnviando(false); return setFaltaConf((e as Error).message); }
    const cod = f.propiedad ? ' · ' + f.propiedad.codigo : '';
    terminar(<><b>{ob.titulo}</b>{cod} creado en Asset y enviado a firmar</>, `${ob.titulo}${cod} creado en Asset y enviado a firmar`);
    resultado({ ...res, plantilla: ob.titulo }, f.propiedad || { codigo: '', id: null }); W.AssetRefrescar?.();
    if (res.archivo) Ag().sugerencias?.([{ label: 'Ver el PDF', accion: { tipo: 'pdf', archivo: res.archivo } }]);
  };

  const ponerDato = (id: string) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) => setDatos((s) => ({ ...s, [id]: e.target.value }));
  const campo = (c: any) => {
    const comun = { etiqueta: <>{c.etiqueta}{!c.requerido && <span className="tw:font-normal tw:text-muted"> (opcional)</span>}</>, pendiente: faltaDato(c), 'data-d': c.id, disabled: conf, value: datos[c.id] ?? '', onChange: ponerDato(c.id) };
    if (c.tipo === 'select') return <Select key={c.id} {...comun}>{c.opciones.map((x: string) => <option key={x}>{x}</option>)}</Select>;
    if (c.tipo === 'textarea') return <Textarea key={c.id} {...comun} clasesCampo="tw:sm:col-span-2" rows={2} placeholder="Ej.: deja constancia de que el cliente desiste de la reserva y se le devuelve el dinero" />;
    return <Input key={c.id} {...comun} data-req={c.requerido ? 1 : ''} type={c.tipo === 'date' ? 'date' : c.tipo === 'number' ? 'number' : 'text'} placeholder={c.id === 'monto' ? 'Ej.: 350000' : undefined} />;
  };

  return (
    <Tarjeta icono="filePlus" titulo={`Crear «${f.titulo}» con Asset`} sub={`${f.propiedad ? f.propiedad.codigo + ' · ' : ''}No hay una plantilla con ese nombre en tu cuenta: Asset lo arma en PDF con estos datos y lo envía a firmar.`}
      falta={!conf && <Falta texto={nFalta ? `Faltan ${nFalta} ${nFalta === 1 ? 'dato' : 'datos'}` : hueco ? 'Completa los «____» del texto' : ''} ok="Todo completo" />}
      pie={!conf && <>
        <Boton variante="fantasma" icono="file" data-pdf cargando={viendo} onClick={verPdf}>Ver PDF</Boton>
        <Boton data-rev icono="sign" onClick={revisar}>Revisar y enviar a firmar</Boton>
      </>}>
      <Input etiqueta="Título del documento" clasesCampo="ga-dnt" data-titulo disabled={conf} value={titulo} onChange={(e) => setTitulo(e.target.value)} />
      {f.campos.length > 0 && <Grupo titulo="Datos"><Campos>{f.campos.map(campo)}</Campos></Grupo>}
      <div className="ga-dnfs tw:flex tw:flex-col tw:gap-3">
        {firm.map((x, i) => (
          <Grupo key={i} data-i={i} className={cx('ga-dnf', !x.firma && 'off tw:opacity-60')} extra={x.rol === 'corredor' ? 'tus datos' : undefined}
            titulo={<Casilla data-firma checked={!!x.firma} disabled={conf} onChange={(e) => cambiarFirm(i, 'firma', e.target.checked)}><b>{x.titulo}</b></Casilla>}>
            {x.rol !== 'corredor' && (
              <Select etiqueta={<span className="tw:inline-flex tw:items-center tw:gap-1.5"><Icono nombre="user" tam={13} /> Persona</span>} clasesCampo="ga-per" data-per disabled={conf}
                value={x.personaId || ''} onChange={(e) => elegirPersona(i, e.target.value)}>
                <option value="">Persona nueva (escribe sus datos)</option>
                {pers.map((c: any) => <option key={c.id} value={c.id}>{c.nombre} · {c.rut}{c.rol ? ' · ' + c.rol : ''}</option>)}
              </Select>
            )}
            <Campos>
              {DATOS_FIRMANTE.map(([k, l, ph]) => (
                <Input key={k} etiqueta={l} pendiente={faltaFirm(x, k)} data-k={k} disabled={conf} placeholder={ph} value={x[k] || ''} onChange={(e) => cambiarFirm(i, k, e.target.value)} />
              ))}
            </Campos>
          </Grupo>
        ))}
      </div>
      <div className="ga-dntx tw:flex tw:flex-col tw:gap-2">
        <div className="ga-dnth tw:flex tw:flex-wrap tw:items-center tw:gap-2">
          <b className="tw:text-[13px]">Texto del documento</b>
          {modo && <span data-modo><Badge tono={libre ? 'lavanda' : auto ? 'azul' : 'gris'}>{modo}</Badge></span>}
          <span className="tw:flex-1" />
          {libre ? <Boton variante="secundario" tamano="sm" icono="sparkle" data-ia disabled={conf} cargando={redactando} onClick={redactar}>{redactando ? 'Redactando…' : iaHecha ? 'Redactar de nuevo' : 'Redactar con IA'}</Boton>
            : !auto && <Boton variante="fantasma" tamano="sm" data-auto disabled={conf} onClick={() => setAuto(true)}>Volver al texto automático</Boton>}
        </div>
        <Textarea aria-label="Texto del documento" data-texto rows={9} disabled={conf} value={texto} pendiente={!parrafos().length}
          placeholder={libre ? 'Pulsa «Redactar con IA» o escríbelo tú. Separa los párrafos con una línea en blanco.' : ''}
          onChange={(e) => { setTexto(e.target.value); if (!libre && auto) setAuto(false); }} />
      </div>
      {f.negocio?.pideFirma && (
        <Casilla className="ga-neg" data-neg checked={ligar} disabled={conf} onChange={(e) => setLigar(e.target.checked)}>Ligar a la etapa «{f.negocio.etapa}» del negocio {f.negocio.titulo}: cuando se firme, avanza solo.</Casilla>
      )}
      <Nota>Revisa el texto antes de enviarlo: Asset lo arma con tus datos, pero no reemplaza la revisión de un abogado.</Nota>
      {conf && (
        <Confirmacion
          firmantes={[<><b>Documento:</b> {titulo.trim()}{f.propiedad ? ' · ' + f.propiedad.codigo : ''} (PDF de Asset)</>,
            ...firm.filter((x) => x.firma).map((x) => <><b>{x.titulo}</b> ({x.alias}): {x.nombre} · {x.rut} · {x.email}</>)]}
          extra={<Input etiqueta="Correo del pagador (tu cuenta)" data-pag type="email" value={pag} onChange={(e) => setPag(e.target.value)} placeholder="pagos@empresa.cl" />}
          cobro="Se sube el PDF a Portalfirma, se cobra del saldo y cada firmante recibe su enlace. Queda guardado en la ficha de la propiedad y en la de cada firmante."
          falta={faltaConf} enviando={enviando} textoEnviando="Creando el PDF y enviando…" alEditar={() => setConf(false)} alEnviar={enviar} />
      )}
    </Tarjeta>
  );
}

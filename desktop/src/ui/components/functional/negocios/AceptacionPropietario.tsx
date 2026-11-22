// Aceptación del propietario (arriendo, etapa 1 · Comercialización): el contenido del paso dentro de su ventana (modal-13,
// ventanas/inmo/Etapas.tsx › MenuPaso). El corredor:
//  1. ve la oferta vigente (la de la carta oferta, o la última contraoferta) y el historial de la negociación;
//  2. le manda al propietario los detalles de la oferta por WhatsApp (el mensaje sale armado y se puede editar);
//  3. registra la respuesta: el propietario acepta, rechaza o hace una contraoferta; si hay contraoferta, después se registra
//     lo que responde el interesado (acepta, hace otra oferta o desiste). Se logra cuando se aceptan las condiciones finales:
//     entonces el monto y las condiciones del negocio quedan con lo acordado (el contrato parte de ahí).
// Las reglas de la negociación viven en el servidor: cada respuesta va por negAceptacion (el servidor arma la ronda y, al aceptarse, deja el monto y
// las condiciones del negocio con lo acordado). Los id (#acPanel, #acWsp, #acResp, #acGuardar, #acEnviar,
// #acMonto, #acNota) los usan las pruebas.
/* eslint-disable @typescript-eslint/no-explicit-any -- el negocio llega del proceso principal sin tipos */
import { useCallback, useEffect, useState, type ReactNode } from 'react';
import Boton from '../../ui/Boton';
import Badge from '../../ui/Badge';
import Input from '../../ui/Input';
import Select from '../../ui/Select';
import Textarea from '../../ui/Textarea';
import Segmentos from '../../ui/Segmentos';
import MenuMas from '../../ui/MenuMas';
import { api } from '../../../utils/api';
import { toast } from '../../../utils/app';

type TAccion = 'acepta' | 'contraoferta' | 'rechaza' | 'oferta';
interface IForm { accion: TAccion; monto: string; moneda: string; garantia: string; plazo: string; condiciones: string; nota: string }

const mensaje = (e: unknown) => (e instanceof Error ? e.message : String(e));
const fdm = (iso: string) => new Date(iso).toLocaleDateString('es-CL', { day: '2-digit', month: '2-digit' });
const fmt = (v: number | null | undefined, mo: string) => (!v ? '—' : mo === 'UF' ? `UF ${Number(v).toLocaleString('es-CL')}` : mo === 'USD' ? `US$ ${Number(v).toLocaleString('es-CL')}` : `$${Number(v).toLocaleString('es-CL')}`);
const num = (s: string) => Number(String(s).replace(/\./g, '').replace(',', '.'));
const TXT: Record<string, [string, 'verde' | 'amarillo' | 'rojo' | 'azul' | 'gris']> = { oferta: ['Oferta', 'azul'], contraoferta: ['Contraoferta', 'amarillo'], aceptada: ['Aceptada', 'verde'], rechazada: ['Rechazada', 'rojo'] };

function Seccion({ titulo, cuenta, acciones, children }: { titulo: string; cuenta?: number; acciones?: ReactNode; children: ReactNode }) {
  return (
    <div className="tw:flex tw:flex-col tw:gap-2.5">
      <div className="tw:flex tw:items-center tw:gap-2 tw:flex-nowrap">
        <h4 className="tw:m-0 tw:flex-1 tw:text-[13px] tw:font-bold">{titulo}{cuenta ? <span className="tw:ml-1.5 tw:font-semibold tw:text-muted">({cuenta})</span> : null}</h4>
        {acciones && <div className="tw:flex tw:flex-none tw:items-center tw:gap-2">{acciones}</div>}
      </div>
      {children}
    </div>
  );
}

export default function AceptacionPropietario({ negocioId, alCambio }: { negocioId: string; alCambio?: () => void }) {
  const [n, setN] = useState<any>(null);
  const [form, setForm] = useState<IForm | null>(null);
  const [wsp, setWsp] = useState<{ texto: string; nombre: string; enviando: boolean } | null>(null);
  const [error, setError] = useState(''); const [trabajando, setTrabajando] = useState(false);

  const cargar = useCallback(async () => { try { setN(await api<any>('negObtener', negocioId)); } catch (e) { setError(mensaje(e)); } }, [negocioId]);
  useEffect(() => { cargar(); }, [cargar]);
  if (!n) return <p className="tw:m-0 tw:text-[13px] tw:text-muted">{error || 'Cargando la negociación…'}</p>;

  const venta = n.tipo === 'venta';
  const rondas: any[] = n.aceptacion?.rondas || []; const ultima = rondas[rondas.length - 1];
  // la oferta vigente: la última ronda con monto que no sea un rechazo, o la carta oferta del negocio
  const conMonto = [...rondas].reverse().find((r) => r.tipo !== 'rechazada' && r.monto);
  const vig = conMonto
    ? { monto: conMonto.monto, moneda: conMonto.moneda || 'UF', garantia: conMonto.garantia || '', plazo: conMonto.plazo || '', condiciones: conMonto.condiciones || '' }
    : { monto: n.valor?.valor || null, moneda: n.valor?.moneda || 'UF', garantia: n.oferta?.garantia || '', plazo: n.oferta?.plazo || '', condiciones: n.oferta?.condiciones || '' };
  const final = ultima?.tipo === 'aceptada' || ultima?.tipo === 'rechazada';
  const interesado = ultima?.tipo === 'contraoferta';   // la contraoferta del propietario espera la respuesta del interesado

  const opciones: [TAccion, string][] = interesado
    ? [['acepta', 'Acepta la contraoferta'], ['oferta', 'Hace otra oferta'], ['rechaza', 'Desiste']]
    : [['acepta', 'Acepta'], ['contraoferta', 'Contraoferta'], ['rechaza', 'Rechaza']];
  const abrirForm = () => { setWsp(null); setError(''); setForm({ accion: 'acepta', monto: vig.monto ? Number(vig.monto).toLocaleString('es-CL') : '', moneda: vig.moneda, garantia: vig.garantia, plazo: vig.plazo, condiciones: vig.condiciones, nota: '' }); };
  const campo = (k: keyof IForm) => ({ value: form![k], onChange: (e: { target: { value: string } }) => { setForm((f) => (f ? { ...f, [k]: e.target.value } : f)); setError(''); } });

  const guardar = async (f: IForm) => {
    const nueva = f.accion === 'contraoferta' || f.accion === 'oferta';
    if (nueva && !(num(f.monto) > 0)) return setError('Escribe el monto de la ' + (f.accion === 'oferta' ? 'oferta.' : 'contraoferta.'));
    if (f.accion === 'rechaza' && !f.nota.trim()) return setError('Escribe el motivo.');
    setTrabajando(true); setError('');
    try {
      await api('negAceptacion', negocioId, { accion: f.accion, monto: nueva ? num(f.monto) : undefined, moneda: f.moneda, garantia: f.garantia.trim(), plazo: f.plazo.trim(), condiciones: f.condiciones.trim(), nota: f.nota.trim() });
      toast(f.accion === 'acepta' ? 'Aceptada: el negocio quedó con las condiciones finales.' : f.accion === 'rechaza' ? 'Respuesta registrada: rechazada.' : 'Respuesta registrada.');
      setForm(null); await cargar(); alCambio?.();
    } catch (e) { setError(mensaje(e)); }
    setTrabajando(false);
  };
  const volverANegociar = async () => {
    setTrabajando(true);
    try { await api('negAceptacion', negocioId, { accion: 'oferta', monto: vig.monto, moneda: vig.moneda, garantia: vig.garantia, plazo: vig.plazo, condiciones: vig.condiciones, nota: 'Se retomó la negociación.' }); await cargar(); alCambio?.(); } catch (e) { setError(mensaje(e)); }
    setTrabajando(false);
  };
  const perder = () => (window as any).Ventanas.abrir('negocios.perdido', { alGuardar: async (m: string) => { await api('negCerrar', negocioId, 'perdido', m); (window as any).closeModal(); toast('Negocio marcado como perdido.'); alCambio?.(); } }, { clave: 'modal-46' });

  const armarWsp = async () => {
    setForm(null); setError(''); setTrabajando(true);
    try { const r = await api<any>('negWspPreparar', negocioId); setWsp({ texto: r.texto, nombre: r.persona?.nombre || 'el propietario', enviando: false }); } catch (e) { setError(mensaje(e)); }
    setTrabajando(false);
  };
  const enviarWsp = async (modo?: 'abrir') => {
    if (!wsp) return; setWsp({ ...wsp, enviando: true }); setError('');
    try { const r = await api<any>('negWspEnviar', { negocioId, texto: wsp.texto, modo }); toast(r.automatico ? `Detalles enviados por WhatsApp a ${wsp.nombre}.` : 'Se abrió WhatsApp con el mensaje listo.'); setWsp(null); await cargar(); alCambio?.(); }
    catch (e) { setError(mensaje(e)); setWsp((w) => (w ? { ...w, enviando: false } : w)); }
  };

  return (
    <div className="tw:flex tw:flex-col tw:gap-5" id="acPanel">
      <Seccion titulo="Oferta vigente" acciones={ultima ? <Badge tono={TXT[ultima.tipo]?.[1] || 'gris'} punto>{interesado ? 'Contraoferta: falta la respuesta del interesado' : ultima.tipo === 'oferta' ? 'Esperando al propietario' : TXT[ultima.tipo]?.[0]}</Badge> : <Badge tono="gris" punto>Sin respuesta todavía</Badge>}>
        <dl className="tw:m-0 tw:grid tw:grid-cols-2 tw:gap-x-6 tw:gap-y-2 tw:text-[13px]">
          {[[venta ? 'Precio ofrecido' : 'Renta ofrecida', fmt(vig.monto, vig.moneda)], [venta ? 'Reserva' : 'Garantía', vig.garantia || '—'], ['Plazo', vig.plazo || '—'], ['Vigencia', n.oferta?.vigencia ? `${n.oferta.vigencia} días` : '—']].map(([k, v]) => (
            <div key={k} className="tw:flex tw:flex-col"><dt className="tw:text-xs tw:text-muted">{k}</dt><dd className="tw:m-0 tw:font-semibold">{v}</dd></div>
          ))}
          {vig.condiciones && <div className="tw:col-span-2 tw:flex tw:flex-col"><dt className="tw:text-xs tw:text-muted">Condiciones</dt><dd className="tw:m-0 tw:whitespace-pre-wrap">{vig.condiciones}</dd></div>}
        </dl>
        {!vig.monto && <p className="tw:m-0 tw:text-xs tw:text-muted">Todavía no hay un monto: arma primero la carta oferta (paso anterior).</p>}
      </Seccion>

      {rondas.length > 0 && (
        <Seccion titulo="Historial de la negociación" cuenta={rondas.length}>
          <ul className="tw:list-none tw:m-0 tw:p-0 tw:flex tw:flex-col tw:gap-2">
            {[...rondas].reverse().map((r, i) => (
              <li key={i} className="tw:flex tw:items-start tw:gap-2.5 tw:text-[13px]">
                <span className="tw:w-11 tw:flex-none tw:text-xs tw:text-muted tw:pt-0.5">{fdm(r.fecha)}</span>
                <Badge tono={TXT[r.tipo]?.[1] || 'gris'}>{TXT[r.tipo]?.[0] || r.tipo}</Badge>
                <span className="tw:min-w-0 tw:flex-1">{[r.por === 'interesado' ? 'Interesado' : 'Propietario', r.monto ? fmt(r.monto, r.moneda) : '', r.nota].filter(Boolean).join(' · ')}</span>
              </li>
            ))}
          </ul>
        </Seccion>
      )}

      {error && <p className="error tw:m-0 tw:text-[13px]" id="acError">{error}</p>}

      {form && (
        <Seccion titulo={interesado ? 'Respuesta del interesado' : 'Respuesta del propietario'}>
          <Segmentos etiqueta="Respuesta" id="acResp" dato="ac" opciones={opciones} valor={form.accion} alCambiar={(v) => { setForm((f) => (f ? { ...f, accion: v } : f)); setError(''); }} />
          {(form.accion === 'contraoferta' || form.accion === 'oferta') && (
            <div className="tw:flex tw:flex-col tw:gap-3">
              <div className="tw:grid tw:grid-cols-[1fr_110px] tw:gap-3">
                <Input etiqueta={venta ? 'Precio' : 'Renta'} id="acMonto" inputMode="decimal" autoComplete="off" {...campo('monto')} />
                <Select etiqueta="Moneda" opciones={[['UF', 'UF'], ['CLP', 'Pesos'], ['USD', 'Dólares']]} {...campo('moneda')} />
              </div>
              <div className="tw:grid tw:grid-cols-2 tw:gap-3">
                <Input etiqueta={venta ? 'Reserva' : 'Garantía'} autoComplete="off" {...campo('garantia')} />
                <Input etiqueta="Plazo" autoComplete="off" {...campo('plazo')} />
              </div>
              <Textarea etiqueta="Condiciones" rows={2} {...campo('condiciones')} />
            </div>
          )}
          <Textarea etiqueta={form.accion === 'rechaza' ? 'Motivo' : <>Nota <span className="tw:font-normal tw:text-muted">(opcional)</span></>} id="acNota" rows={2} placeholder={form.accion === 'acepta' ? 'Algo que quieras dejar anotado' : ''} {...campo('nota')} />
          <div className="tw:flex tw:items-center tw:justify-end tw:gap-2 tw:flex-nowrap">
            <Boton variante="secundario" onClick={() => { setForm(null); setError(''); }}>Cancelar</Boton>
            <Boton id="acGuardar" icono="check" cargando={trabajando} onClick={() => guardar(form)}>Guardar respuesta</Boton>
          </div>
        </Seccion>
      )}

      {wsp && (
        <Seccion titulo={`Detalles de la oferta para ${wsp.nombre}`}>
          <Textarea etiqueta="Mensaje por WhatsApp" id="acTexto" rows={9} value={wsp.texto} onChange={(e) => setWsp((w) => (w ? { ...w, texto: e.target.value } : w))} />
          <div className="tw:flex tw:items-center tw:justify-end tw:gap-2 tw:flex-nowrap">
            <MenuMas tamano="md" etiqueta="Otras formas de enviarlo" opciones={[{ texto: 'Abrir en WhatsApp (yo lo envío)', icono: 'whatsapp', disabled: wsp.enviando, alTocar: () => enviarWsp('abrir') }]} />
            <Boton variante="secundario" onClick={() => { setWsp(null); setError(''); }} disabled={wsp.enviando}>Cancelar</Boton>
            <Boton id="acEnviar" variante="exito" icono="whatsapp" cargando={wsp.enviando} onClick={() => enviarWsp()}>Enviar por WhatsApp</Boton>
          </div>
        </Seccion>
      )}

      {!form && !wsp && (
        <div className="tw:flex tw:items-center tw:justify-end tw:gap-2 tw:flex-nowrap">
          {final
            ? <MenuMas tamano="md" etiqueta="Más acciones" opciones={[{ texto: 'Volver a negociar', icono: 'rotateR', disabled: trabajando, alTocar: volverANegociar }, ...(ultima.tipo === 'rechazada' ? [{ texto: 'Cerrar el negocio como perdido', icono: 'x', alTocar: perder }] : [])]} />
            : <>
              <Boton id="acWsp" variante="secundario" icono="whatsapp" cargando={trabajando} onClick={armarWsp}>Enviar detalles por WhatsApp</Boton>
              <Boton id="acResp2" icono="check" onClick={abrirForm}>Registrar la respuesta</Boton>
            </>}
        </div>
      )}
    </div>
  );
}

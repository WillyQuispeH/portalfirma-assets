// Paso 1 · Calidad del aviso: el texto (con redacción por IA) a la izquierda y el puntaje con lo que falta a la derecha.
// Las pruebas usan .pb-q, .pb-ring.big b, .pb-ql li (.ok, .med, .bad) con [data-fix], #pwT, #pwD, #pwIA, #pwSave y #pwNext.
import { useEffect, useState } from 'react';
import Card from '../../../ui/Card';
import Boton from '../../../ui/Boton';
import Badge from '../../../ui/Badge';
import Icono from '../../../ui/Icono';
import Input from '../../../ui/Input';
import Textarea from '../../../ui/Textarea';
import { Anillo } from '../comun';
import { Aviso, COLUMNAS, PieNav } from './piezas';
import { usePublicar } from '../../../../store/hooks/usePublicar.hook';
import { publicacionService } from '../../../../store/services/publicacion.service';
import { editarContactoAvisos, editarPropiedad, pedirSesion, toast } from '../../../../utils/app';
import { cx } from '../../../../utils/cx';
import { SUAVE } from '../../../ui/tonos';
import type { ICalidadItem } from '../../../../store/interfaces/publicacion.interface';

const ARREGLO: Record<ICalidadItem['arreglo'], string> = { ficha: 'Completar', fotos: 'Fotos', ia: 'Redactar', contacto: 'Configurar' };
const estadoItem = (x: ICalidadItem) => (x.ok ? 'ok' : x.parcial ? 'med' : 'bad');
const ORDEN = { bad: 0, med: 1, ok: 2 };

export default function PasoCalidad() {
  const { calidad: q, propiedad: p, publicarTextosGuardar, publicarRedactar, publicarCalidadGet, publicarIr } = usePublicar();
  const [titulo, setTitulo] = useState(''); const [desc, setDesc] = useState('');
  const [destacados, setDestacados] = useState<string[]>([]);
  const [redactando, setRedactando] = useState(false); const [guardando, setGuardando] = useState(false);

  // al leer la calidad (al entrar o después de guardar), los textos quedan como están guardados
  useEffect(() => { if (q) { setTitulo(q.titulo); setDesc(q.descripcion); } }, [q?.titulo, q?.descripcion]); // eslint-disable-line react-hooks/exhaustive-deps -- solo cuando cambia lo guardado

  if (!q || !p) return null;
  const t = titulo.trim().length; const d = desc.trim().length;
  const cambiado = titulo.trim() !== q.titulo || desc.trim() !== q.descripcion;

  const guardar = async (silencio = false) => {
    setGuardando(true);
    const r = await publicarTextosGuardar({ tituloPortal: titulo, descripcion: desc });
    setGuardando(false);
    if (r.error) { toast(r.error, 5000); return false; }
    if (!silencio) toast(r.mensaje || '', 4000);
    return true;
  };
  const redactar = () => pedirSesion(async () => {
    setRedactando(true);
    const r = await publicarRedactar();
    setRedactando(false);
    if (r.error) return toast(r.error, 5000);
    setTitulo(r.titulo || ''); setDesc(r.descripcion || ''); setDestacados(r.destacados || []);
    toast(r.mensaje || '');
  }, 'Para redactar con IA, inicia sesión con tu cuenta de Portalfirma.');
  const arreglar = async (k: ICalidadItem['arreglo']) => {
    if (k === 'ia') return redactar();
    if (k === 'fotos') return toast('Las fotos se cargan desde Portalfirma al importar la cartera. Agrega más fotos a la propiedad en Portalfirma y vuelve a importar.', 7000);
    if (k === 'contacto') {
      const c = (await publicacionService.getContacto().catch(() => null))?.contacto || {};
      return editarContactoAvisos(c, () => { publicarCalidadGet(); });
    }
    editarPropiedad(p, () => { publicarIr(1); });
  };
  const continuar = async () => {
    if (cambiado && !(await guardar(true))) return;
    publicarIr(2);
  };
  const items = [...q.items].sort((a, b) => ORDEN[estadoItem(a)] - ORDEN[estadoItem(b)]);
  const ayuda = (texto: string, bien: boolean) => <span className={bien ? 'tw:text-green-softink' : 'tw:text-yellow-softink'}>{texto}</span>;

  return <>
    <div className={COLUMNAS}>
      <div className="tw:min-w-0">
        <Card titulo="Texto del aviso" subtitulo="Lo que verán los interesados en cada portal"
          accion={<Boton id="pwIA" variante="secundario" tamano="sm" icono="sparkle" cargando={redactando} onClick={redactar}>{redactando ? 'Redactando…' : 'Redactar con IA'}</Boton>}>
          <div className="pb-tx tw:flex tw:flex-col tw:gap-4">
            <Input id="pwT" etiqueta="Título para los portales" maxLength={60} value={titulo} onChange={(e) => setTitulo(e.target.value)}
              ayuda={ayuda(`${t}/60 caracteres${t < 25 ? ' · ideal: entre 25 y 60' : ''}`, t >= 25 && t <= 60)} />
            <Textarea id="pwD" etiqueta="Descripción" rows={10} value={desc} onChange={(e) => setDesc(e.target.value)}
              ayuda={ayuda(`${d} caracteres${d < 300 ? ' · ideal: 300 o más' : ''}`, d >= 300)} />
            {destacados.length > 0 && (
              <div className="tw:flex tw:flex-wrap tw:gap-1.5">
                {destacados.map((x, i) => <Badge key={i} tono="lavanda" icono="sparkle" ajustar>{x}</Badge>)}
              </div>
            )}
            <div className="tw:flex tw:flex-wrap tw:items-center tw:justify-between tw:gap-3 tw:border-0 tw:border-t tw:border-solid tw:border-edge tw:pt-4">
              <small className="tw:text-xs tw:text-muted">La IA usa solo los datos de la ficha; revisa antes de guardar.</small>
              <Boton id="pwSave" variante="secundario" icono="check" cargando={guardando} onClick={() => guardar()}>Guardar texto</Boton>
            </div>
          </div>
        </Card>
      </div>
      <div className="tw:min-w-0">
        <Card titulo="Calidad del aviso" className="pb-q">
          <div className="tw:flex tw:items-center tw:gap-4 tw:pb-4">
            <Anillo n={guardando ? null : q.puntaje} grande />
            <span className="tw:flex tw:min-w-0 tw:flex-col tw:gap-1">
              <b className="tw:text-lg tw:font-bold">{q.nivel}</b>
              <small className="tw:text-[13px] tw:text-muted">{q.puntaje >= 85 ? 'Listo para destacar en los portales.' : 'Mejóralo antes de publicar: los avisos completos reciben más visitas y contactos.'}</small>
            </span>
          </div>
          <ul className="pb-ql tw:m-0 tw:flex tw:list-none tw:flex-col tw:p-0">
            {items.map((x) => {
              const k = estadoItem(x);
              return (
                <li key={x.id} className={cx(k, 'tw:flex tw:items-start tw:gap-3 tw:py-2.5 tw:border-0 tw:border-t tw:border-solid tw:border-edge')}>
                  <span className={cx('tw:mt-0.5 tw:grid tw:size-7 tw:flex-none tw:place-items-center tw:rounded-lg', SUAVE[k === 'ok' ? 'verde' : k === 'med' ? 'amarillo' : 'rojo'])}>
                    <Icono nombre={k === 'ok' ? 'check' : 'alert'} tam={14} />
                  </span>
                  <span className="tw:flex tw:min-w-0 tw:flex-1 tw:flex-col tw:gap-0.5">
                    <b className="tw:text-sm tw:font-semibold">{x.t}</b>
                    {!x.ok && <small className="tw:text-xs tw:text-muted">{x.falta}</small>}
                  </span>
                  {!x.ok && <Boton variante="fantasma" tamano="sm" data-fix={x.arreglo} onClick={() => arreglar(x.arreglo)}>{ARREGLO[x.arreglo]}</Boton>}
                </li>
              );
            })}
          </ul>
        </Card>
      </div>
    </div>
    <PieNav
      izquierda={q.bloquea.length > 0 && <Aviso tono="rojo" icono="alert">{q.bloquea.join(' ')}</Aviso>}
      derecha={<Boton id="pwNext" iconoDerecha="arrowR" disabled={q.bloquea.length > 0} cargando={guardando} onClick={continuar}>Continuar</Boton>} />
  </>;
}

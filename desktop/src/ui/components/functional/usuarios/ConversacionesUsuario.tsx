// Conversaciones del Agente de un usuario de la corredora, para el administrador (solo lectura). Se abre desde
// «Usuarios» › «Conversaciones» en la fila de cada usuario.
//  · Conversaciones: la lista (fijadas primero, luego las más recientes) y, al elegir una, lo que se habló.
//  · Acciones del Agente: lo que el Agente hizo por ese usuario (en la app o por WhatsApp), lo más nuevo primero.
// La API exige que quien mira sea administrador de la misma corredora. Con el kit: Modal, Segmentos, Badge, EstadoVacio.
// Los id (#cvuPanel, #cvuLista, [data-cvu], #cvuChat, #cvuAcciones) los usan las pruebas.
import { useEffect, useState } from 'react';
import Modal from '../../ui/Modal';
import Segmentos from '../../ui/Segmentos';
import Badge from '../../ui/Badge';
import Icono from '../../ui/Icono';
import EstadoVacio from '../../ui/EstadoVacio';
import { usuarioService } from '../../../store/services/usuario.service';
import type { IConversacionResumen, IConversacion, IAccionAgente, IUsuario } from '../../../store/interfaces/usuario.interface';
import { fechaHora } from '../../../utils/formato';

type TVista = 'conversaciones' | 'acciones';
const TEXTO_DE = (k?: string) => (k === 'user' ? 'usuario' : k === 'bot' || k === 'hecho' ? 'agente' : 'nota');

export default function ConversacionesUsuario({ u, onCerrar }: { u: IUsuario; onCerrar: () => void }) {
  const [vista, setVista] = useState<TVista>('conversaciones');
  const [lista, setLista] = useState<IConversacionResumen[] | null>(null);
  const [acciones, setAcciones] = useState<IAccionAgente[] | null>(null);
  const [sel, setSel] = useState<IConversacion | null>(null);
  const [cargandoSel, setCargandoSel] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    usuarioService.conversaciones(u.id)
      .then((l) => setLista([...l].sort((a, b) => Number(!!b.fijada) - Number(!!a.fijada) || String(b.actualizado).localeCompare(String(a.actualizado)))))
      .catch((e: Error) => { setError(e.message); setLista([]); });
  }, [u.id]);
  useEffect(() => {
    if (vista === 'acciones' && !acciones) usuarioService.registroAgente(u.id).then(setAcciones).catch((e: Error) => { setError(e.message); setAcciones([]); });
  }, [vista, acciones, u.id]);

  const abrir = async (id: string) => {
    setCargandoSel(true); setError('');
    try { setSel(await usuarioService.conversacion(u.id, id)); } catch (e) { setError((e as Error).message); }
    setCargandoSel(false);
  };

  return (
    <Modal abierto onCerrar={onCerrar} tamano="xl" icono="sparkle" titulo={`Agente de ${u.nombre}`}
      descripcion="Lo que conversó con el Agente y lo que el Agente hizo por esta persona. Solo lectura." id="cvuPanel">
      <div className="tw:flex tw:flex-col tw:gap-3">
        <Segmentos etiqueta="Qué ver" id="cvuVista" opciones={[['conversaciones', 'Conversaciones'], ['acciones', 'Acciones del Agente']]} valor={vista} alCambiar={setVista} />
        {error && <p role="alert" className="tw:m-0 tw:text-[13px] tw:font-semibold tw:text-red-softink">{error}</p>}

        {vista === 'conversaciones' && (
          <div className="tw:grid tw:grid-cols-1 tw:md:grid-cols-[280px_1fr] tw:gap-3 tw:min-h-[360px]">
            <ul id="cvuLista" className="tw:list-none tw:m-0 tw:p-0 tw:flex tw:flex-col tw:gap-1 tw:max-h-[60vh] tw:overflow-auto">
              {lista === null && <li><EstadoVacio compacto texto="Cargando…" /></li>}
              {lista?.length === 0 && <li><EstadoVacio compacto texto="No tiene conversaciones con el Agente." /></li>}
              {lista?.map((c) => (
                <li key={c.id}>
                  <button type="button" data-cvu={c.id} onClick={() => abrir(c.id)}
                    className={`tw:w-full tw:text-left tw:p-2 tw:rounded-lg tw:border tw:border-solid tw:cursor-pointer ${sel?.id === c.id ? 'tw:border-lav tw:bg-lav-soft' : 'tw:border-edge tw:bg-card'}`}>
                    <span className="tw:flex tw:items-center tw:gap-1 tw:text-sm tw:font-semibold tw:truncate">
                      {c.fijada && <Icono nombre="pin" tam={12} />}{c.id === 'whatsapp' && <Badge tono="verde">WhatsApp</Badge>}{c.titulo || 'Sin título'}
                    </span>
                    <small className="tw:block tw:text-xs tw:text-muted tw:truncate">{fechaHora(c.actualizado)}{c.n ? ` · ${c.n} pedido${c.n === 1 ? '' : 's'}` : ''}</small>
                  </button>
                </li>
              ))}
            </ul>
            <div id="cvuChat" className="tw:rounded-xl tw:border tw:border-solid tw:border-edge tw:bg-sunken tw:p-3 tw:max-h-[60vh] tw:overflow-auto tw:flex tw:flex-col tw:gap-2">
              {!sel && !cargandoSel && <EstadoVacio compacto texto="Elige una conversación para verla." />}
              {cargandoSel && <EstadoVacio compacto texto="Cargando…" />}
              {sel && !cargandoSel && (sel.items || []).filter((i) => i.text).map((i, n) => {
                const de = TEXTO_DE(i.k);
                return (
                  <div key={n} data-cvu-de={de} className={`tw:max-w-[85%] tw:text-sm tw:whitespace-pre-wrap tw:rounded-xl tw:px-3 tw:py-2 ${de === 'usuario' ? 'tw:self-end tw:bg-lav-soft tw:text-lav-softink' : de === 'agente' ? 'tw:self-start tw:bg-card tw:border tw:border-solid tw:border-edge' : 'tw:self-center tw:text-xs tw:text-muted'}`}>
                    {String(i.text)}
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {vista === 'acciones' && (
          <ul id="cvuAcciones" className="tw:list-none tw:m-0 tw:p-0 tw:flex tw:flex-col tw:gap-1 tw:max-h-[60vh] tw:overflow-auto">
            {acciones === null && <li><EstadoVacio compacto texto="Cargando…" /></li>}
            {acciones?.length === 0 && <li><EstadoVacio compacto texto="El Agente todavía no ha hecho nada por esta persona." /></li>}
            {acciones?.map((a, n) => (
              <li key={n} className="tw:flex tw:items-center tw:gap-2 tw:p-2 tw:rounded-lg tw:border tw:border-solid tw:border-edge tw:bg-card tw:text-sm">
                <Badge tono={a.ok ? 'verde' : 'rojo'} punto>{a.ok ? 'Hecho' : 'No se hizo'}</Badge>
                <span className="tw:flex-1 tw:min-w-0 tw:truncate">{a.resumen || a.tool}</span>
                {a.canal === 'whatsapp' && <Badge tono="verde">WhatsApp</Badge>}
                <small className="tw:text-xs tw:text-muted tw:flex-none">{fechaHora(a.t)}</small>
              </li>
            ))}
          </ul>
        )}
      </div>
    </Modal>
  );
}

// Campo de búsqueda con ícono. Avisa el cambio cuando se deja de escribir (espera ms).
// `clase` es la clase del contenedor en styles.css: im-search (Cartera) o ac-q (Actividad).
// `kit`: con la caja del kit (Input) y un botón para limpiar; las pantallas que van pasando al kit lo usan (Personas).
import { useEffect, useRef, useState } from 'react';
import Icono from './Icono';
import Input from './Input';

interface IBuscadorProps {
  id: string;
  valor: string;
  alCambiar: (v: string) => void;
  placeholder: string;
  clase?: string;
  espera?: number;
  kit?: boolean;
  /** con kit: clases del contenedor (ancho) */
  className?: string;
}

export default function Buscador({ id, valor, alCambiar, placeholder, clase = 'im-search', espera = 200, kit = false, className }: IBuscadorProps) {
  const [texto, setTexto] = useState(valor);
  const enviado = useRef(valor); // lo último que avisamos; si `valor` llega distinto, cambió desde afuera

  useEffect(() => { if (valor !== enviado.current) { enviado.current = valor; setTexto(valor); } }, [valor]);
  useEffect(() => {
    if (texto === enviado.current) return;
    const t = setTimeout(() => { enviado.current = texto; alCambiar(texto); }, espera);
    return () => clearTimeout(t);
  }, [texto, alCambiar, espera]);

  // si se sale de la pantalla antes de que pase la espera, lo escrito no se pierde
  const pendiente = useRef({ texto, alCambiar });
  pendiente.current = { texto, alCambiar };
  useEffect(() => () => {
    const p = pendiente.current;
    if (p.texto !== enviado.current) { enviado.current = p.texto; p.alCambiar(p.texto); }
  }, []);

  if (kit) return (
    <div className={className ?? 'tw:w-full tw:sm:w-[320px]'}>
      <Input id={id} type="search" icono="search" placeholder={placeholder} spellCheck={false} aria-label={placeholder}
        value={texto} onChange={(e) => setTexto(e.target.value)} onKeyDown={(e) => { if (e.key === 'Escape' && texto) { e.stopPropagation(); setTexto(''); } }}
        sufijo={texto ? (
          <button type="button" aria-label="Limpiar búsqueda" onClick={() => setTexto('')}
            className="tw:pointer-events-auto tw:grid tw:place-items-center tw:w-6 tw:h-6 tw:p-0 tw:rounded-md tw:border-0 tw:bg-transparent tw:text-muted tw:cursor-pointer tw:hover:bg-hover tw:hover:text-text">
            <Icono nombre="x" tam={13} />
          </button>
        ) : undefined} />
    </div>
  );
  return (
    <label className={clase}>
      <Icono nombre="search" tam={15} />
      <input id={id} placeholder={placeholder} spellCheck={false} value={texto} onChange={(e) => setTexto(e.target.value)} />
    </label>
  );
}

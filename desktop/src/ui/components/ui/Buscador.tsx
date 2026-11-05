// Campo de búsqueda con ícono. Avisa el cambio cuando se deja de escribir (espera ms).
// `clase` es la clase del contenedor en styles.css: im-search (Cartera, Personas) o ac-q (Actividad).
import { useEffect, useRef, useState } from 'react';
import Icono from './Icono';

interface IBuscadorProps {
  id: string;
  valor: string;
  alCambiar: (v: string) => void;
  placeholder: string;
  clase?: string;
  espera?: number;
}

export default function Buscador({ id, valor, alCambiar, placeholder, clase = 'im-search', espera = 200 }: IBuscadorProps) {
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

  return (
    <label className={clase}>
      <Icono nombre="search" tam={15} />
      <input id={id} placeholder={placeholder} spellCheck={false} value={texto} onChange={(e) => setTexto(e.target.value)} />
    </label>
  );
}

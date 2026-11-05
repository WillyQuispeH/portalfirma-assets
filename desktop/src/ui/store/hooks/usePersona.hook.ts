// Interfaz pública del detalle de una persona (y de los documentos que firma) para los componentes.
// La lista de Personas usa usePersonas; este hook es el de una sola persona.
import { useShallow } from 'zustand/react/shallow';
import { usePersonaStore } from '../zustand/persona.store';
import { useCarteraStore } from '../zustand/cartera.store';

export function usePersona() {
  const estado = usePersonaStore(useShallow((s) => s));
  const { propiedades, personas, error } = useCarteraStore(useShallow((s) => ({ propiedades: s.datos.propiedades, personas: s.datos.personas, error: s.error })));
  const persona = estado.personaId ? personas.find((c) => c.id === estado.personaId) || null : null;
  return { ...estado, persona, propiedades, error };
}

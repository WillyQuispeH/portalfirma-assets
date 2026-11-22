// El PDF de la ventana de un documento: las ventanas se abren AL INSTANTE (con sus datos a la vista y editables) y el PDF aparece
// cuando está listo. Si el documento ya existe (una versión guardada, la orden enviada), se muestra directo; si no, se arma ahí mismo
// y la vista previa dice «Preparando el documento…» mientras tanto.
//   const { pdf, setPdf, cargando, errorCarga, aviso } = usePdfInicial(pdf0, pdfPromesa);
// · pdf0: el PDF si ya se tiene (base64); pdfPromesa: lo que lo va a traer { pdf, aviso? } (si falla, errorCarga dice por qué: p. ej. falta
//   el correo, y se completa en la misma ventana).
// · setPdf lo usa «Guardar y actualizar PDF»: si ya trajo uno nuevo, el inicial que llegue tarde no lo pisa.
import { useEffect, useRef, useState } from 'react';

export interface IPdfInicial { pdf: string; aviso?: string; /** quienes firman, en el orden en que se envían (para ubicar sus firmas en el PDF) */ firmantes?: { nombre: string; rol?: string }[] }

export function usePdfInicial(pdf0?: string, promesa?: Promise<IPdfInicial>) {
  const [pdf, setPdfEstado] = useState(pdf0 || '');
  const [cargando, setCargando] = useState(!pdf0 && !!promesa);
  const [errorCarga, setErrorCarga] = useState('');
  const [aviso, setAviso] = useState('');
  const [firmantes, setFirmantes] = useState<{ nombre: string; rol?: string }[]>([]);
  const tocado = useRef(false);

  useEffect(() => {
    if (!promesa || pdf0) return undefined;
    let vivo = true;
    promesa.then((r) => { if (!vivo) return; if (!tocado.current) setPdfEstado(r.pdf || ''); if (r.aviso) setAviso(r.aviso); if (r.firmantes) setFirmantes(r.firmantes); })
      .catch((e: unknown) => { if (vivo) setErrorCarga(e instanceof Error ? e.message : String(e)); })
      .finally(() => { if (vivo) setCargando(false); });
    return () => { vivo = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- solo al abrir
  }, []);

  const setPdf = (p: string) => { tocado.current = true; setPdfEstado(p); setCargando(false); setErrorCarga(''); };
  return { pdf, setPdf, cargando, errorCarga, aviso, firmantes };
}

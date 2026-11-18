// Configuración › Corredora: los datos que llevan los documentos (orden de visita, carta oferta, contratos, mandatos,
// actas): razón social, RUT, domicilio, representante legal y logo. Los edita el administrador; los demás los ven.
// Viven en el servidor (GET/PUT /v1/corredora/datos, IPC corredora:datos / corredora:guardar).
// Ids para pruebas: #cfgCorredora, #ccRazon, #ccRut, #ccDomicilio, #ccRepNombre, #ccRepRut, #ccLogo, #cfgCorredoraGuardar.
import { useEffect, useRef, useState, type ChangeEvent, type FormEvent } from 'react';
import Card from '../../ui/Card';
import Boton from '../../ui/Boton';
import Input from '../../ui/Input';
import MenuMas from '../../ui/MenuMas';
import { api } from '../../../utils/api';
import { toast } from '../../../utils/app';

interface IDatosCorredora {
  nombreFantasia: string; razonSocial: string; rut: string; domicilio: string;
  representanteNombre: string; representanteRut: string; representante: string; logo: string; puedeEditar: boolean;
}

const LOGO_MAX = 400 * 1024;

export default function Corredora() {
  const [d, setD] = useState<IDatosCorredora | null>(null);
  const [error, setError] = useState('');
  const [logo, setLogo] = useState('');
  const [guardando, setGuardando] = useState(false);
  const [vez, setVez] = useState(0);
  const archivo = useRef<HTMLInputElement>(null);

  useEffect(() => {
    api<IDatosCorredora>('corredoraDatos').then((x) => { setD(x); setLogo(x.logo || ''); }).catch((e: Error) => setError(e.message));
  }, []);

  const elegirLogo = (ev: ChangeEvent<HTMLInputElement>) => {
    const f = ev.target.files?.[0]; ev.target.value = '';
    if (!f) return;
    if (!/^image\/(png|jpe?g)$/.test(f.type)) { toast('El logo tiene que ser PNG o JPG.', 5000); return; }
    if (f.size > LOGO_MAX) { toast('El logo es muy pesado: usa una imagen de menos de 400 KB.', 5000); return; }
    const r = new FileReader(); r.onload = () => setLogo(String(r.result || '')); r.readAsDataURL(f);
  };

  const guardar = async (ev: FormEvent<HTMLFormElement>) => {
    ev.preventDefault(); const f = new FormData(ev.currentTarget); const t = (k: string) => String(f.get(k) ?? '').trim();
    setGuardando(true);
    try {
      const x = await api<IDatosCorredora>('corredoraGuardar', {
        razonSocial: t('razonSocial'), rut: t('rut'), domicilio: t('domicilio'),
        representanteNombre: t('representanteNombre'), representanteRut: t('representanteRut'), logo,
      });
      setD(x); setLogo(x.logo || ''); setVez((v) => v + 1); toast('Datos de la corredora guardados.');
    } catch (e) { toast((e as Error).message, 6000); }
    setGuardando(false);
  };

  if (error) return <Card titulo="Datos de la corredora"><p className="tw:m-0 tw:text-sm tw:text-muted">No se pudieron cargar: {error}</p></Card>;
  if (!d) return <Card titulo="Datos de la corredora"><p className="tw:m-0 tw:text-sm tw:text-muted">Cargando…</p></Card>;
  const ro = !d.puedeEditar;

  return (
    <Card titulo="Datos de la corredora" subtitulo="Aparecen en los documentos que arma Asset: orden de visita, carta oferta, contrato, mandatos y actas.">
      <form key={vez} id="cfgCorredora" onSubmit={guardar} className="tw:flex tw:flex-col tw:gap-4">
        {ro && <p className="tw:m-0 tw:text-sm tw:text-muted">Estos datos los edita el administrador de la corredora.</p>}
        <div className="tw:grid tw:gap-3 tw:grid-cols-[repeat(auto-fit,minmax(240px,1fr))]">
          <Input id="ccRazon" name="razonSocial" etiqueta="Razón social" defaultValue={d.razonSocial} placeholder={d.nombreFantasia} disabled={ro}
            ayuda="Así se nombra a la corredora en los documentos. Vacío = el nombre de la corredora." />
          <Input id="ccRut" name="rut" etiqueta="RUT de la corredora" defaultValue={d.rut} placeholder="76.123.456-7" disabled={ro} />
          <Input id="ccDomicilio" name="domicilio" etiqueta="Domicilio" defaultValue={d.domicilio} placeholder="Av. Ejemplo 123, oficina 45, Las Condes" disabled={ro} />
          <Input id="ccRepNombre" name="representanteNombre" etiqueta="Representante legal" defaultValue={d.representanteNombre} placeholder="don Nombre Apellido" disabled={ro}
            ayuda={!d.representanteNombre && d.representante ? `Hoy los documentos dicen: «${d.representante}».` : 'Quien firma en nombre de la corredora (mandatos y contratos).'} />
          <Input id="ccRepRut" name="representanteRut" etiqueta="RUT del representante" defaultValue={d.representanteRut} placeholder="12.345.678-9" disabled={ro} />
        </div>
        <div className="tw:flex tw:flex-wrap tw:items-center tw:gap-4">
          <span className="tw:inline-grid tw:place-items-center tw:h-16 tw:w-44 tw:rounded-control tw:bg-bg">
            {logo ? <img src={logo} alt="Logo de la corredora" className="tw:max-h-14 tw:max-w-40 tw:object-contain" /> : <span className="tw:text-xs tw:text-muted">Sin logo</span>}
          </span>
          <span className="tw:flex-1 tw:min-w-[200px] tw:text-sm tw:text-muted">Logo en el encabezado de los documentos. PNG o JPG, menos de 400 KB.</span>
          <input ref={archivo} id="ccLogo" type="file" accept="image/png,image/jpeg" className="tw:hidden" onChange={elegirLogo} />
        </div>
        {!ro && (
          <div className="tw:flex tw:flex-nowrap tw:items-center tw:justify-end tw:gap-2">
            {logo && <MenuMas tamano="md" etiqueta="Más acciones del logo" opciones={[{ id: 'ccQuitarLogo', texto: 'Quitar logo', icono: 'trash', alTocar: () => setLogo('') }]} />}
            <Boton variante="secundario" type="button" icono="upload" onClick={() => archivo.current?.click()}>{logo ? 'Cambiar logo' : 'Subir logo'}</Boton>
            <Boton id="cfgCorredoraGuardar" type="submit" cargando={guardando}>Guardar</Boton>
          </div>
        )}
      </form>
    </Card>
  );
}

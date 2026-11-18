// Configuración › Corredora: los datos que llevan los documentos (orden de visita, carta oferta, contratos, mandatos,
// actas): razón social, RUT, domicilio, representante legal y logo. Los edita el administrador; los demás los ven.
// Viven en el servidor (GET/PUT /v1/corredora/datos, IPC corredora:datos / corredora:guardar).
// Ids para pruebas: #cfgCorredora, #ccRazon, #ccRut, #ccDomicilio, #ccRepNombre, #ccRepRut, #ccLogo, #cfgCorredoraGuardar.
import { useEffect, useState, type FormEvent } from 'react';
import Card from '../../ui/Card';
import Boton from '../../ui/Boton';
import Input from '../../ui/Input';
import InputArchivo from '../../ui/InputArchivo';
import MenuMas from '../../ui/MenuMas';
import { api } from '../../../utils/api';
import { toast } from '../../../utils/app';

interface IDatosCorredora {
  nombreFantasia: string; razonSocial: string; rut: string; domicilio: string;
  representanteNombre: string; representanteRut: string; representante: string;
  representanteVentaNombre: string; representanteVentaRut: string; logo: string; puedeEditar: boolean;
}

const LOGO_MAX_CAR = 400_000; // caracteres del logo ya achicado (el servidor acepta hasta ~550.000)

const opcional = <span className="tw:text-[10px] tw:font-normal tw:text-muted"> (opcional)</span>;

export default function Corredora() {
  const [d, setD] = useState<IDatosCorredora | null>(null);
  const [error, setError] = useState('');
  const [logo, setLogo] = useState('');
  const [guardando, setGuardando] = useState(false);
  const [vez, setVez] = useState(0);

  useEffect(() => {
    api<IDatosCorredora>('corredoraDatos').then((x) => { setD(x); setLogo(x.logo || ''); }).catch((e: Error) => setError(e.message));
  }, []);

  // el logo se achica aquí (máx. 600 × 240 px): pesa poco, entra en cualquier documento y viaja rápido al servidor
  const elegirLogo = (archivos: File[]) => {
    const f = archivos[0]; if (!f) return;
    if (!/^image\/(png|jpe?g)$/.test(f.type)) { toast('El logo tiene que ser PNG o JPG.', 5000); return; }
    if (f.size > 12 * 1024 * 1024) { toast('Esa imagen pesa demasiado (más de 12 MB): usa otra.', 5000); return; }
    const url = URL.createObjectURL(f); const img = new Image();
    img.onload = () => {
      URL.revokeObjectURL(url);
      const k = Math.min(1, 600 / img.naturalWidth, 240 / img.naturalHeight);
      const c = document.createElement('canvas'); c.width = Math.max(1, Math.round(img.naturalWidth * k)); c.height = Math.max(1, Math.round(img.naturalHeight * k));
      const g = c.getContext('2d'); if (!g) { toast('No pude leer esa imagen.', 5000); return; }
      g.drawImage(img, 0, 0, c.width, c.height);
      let out = c.toDataURL('image/png');
      if (out.length > 250_000) { // PNG muy pesado (foto): JPG sobre fondo blanco
        const b = document.createElement('canvas'); b.width = c.width; b.height = c.height; const h = b.getContext('2d');
        if (h) { h.fillStyle = '#fff'; h.fillRect(0, 0, b.width, b.height); h.drawImage(c, 0, 0); out = b.toDataURL('image/jpeg', 0.88); }
      }
      if (out.length > LOGO_MAX_CAR) { toast('No logré achicar ese logo lo suficiente: prueba con una imagen más simple.', 6000); return; }
      setLogo(out);
    };
    img.onerror = () => { URL.revokeObjectURL(url); toast('No pude leer esa imagen.', 5000); };
    img.src = url;
  };

  const guardar = async (ev: FormEvent<HTMLFormElement>) => {
    ev.preventDefault(); const f = new FormData(ev.currentTarget); const t = (k: string) => String(f.get(k) ?? '').trim();
    setGuardando(true);
    try {
      const x = await api<IDatosCorredora>('corredoraGuardar', {
        razonSocial: t('razonSocial'), rut: t('rut'), domicilio: t('domicilio'),
        representanteNombre: t('representanteNombre'), representanteRut: t('representanteRut'),
        representanteVentaNombre: t('representanteVentaNombre'), representanteVentaRut: t('representanteVentaRut'), logo,
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
      <form key={vez} id="cfgCorredora" onSubmit={guardar} className="tw:flex tw:flex-col tw:gap-ui">
        {ro && <p className="tw:m-0 tw:text-sm tw:text-muted">Estos datos los edita el administrador de la corredora.</p>}
        <div className="tw:grid tw:gap-ui tw:grid-cols-[repeat(auto-fit,minmax(280px,1fr))]">
          <Input id="ccRazon" name="razonSocial" etiqueta="Razón social" defaultValue={d.razonSocial} placeholder={d.nombreFantasia} disabled={ro} />
          <Input id="ccRut" name="rut" etiqueta="RUT de la corredora" defaultValue={d.rut} placeholder="76.123.456-7" disabled={ro} />
          <Input id="ccDomicilio" name="domicilio" etiqueta="Domicilio" defaultValue={d.domicilio} placeholder="Av. Ejemplo 123, oficina 45, Las Condes" disabled={ro} />
          <Input id="ccRepNombre" name="representanteNombre" etiqueta="Representante legal" defaultValue={d.representanteNombre} placeholder="don Nombre Apellido" disabled={ro} />
          <Input id="ccRepRut" name="representanteRut" etiqueta="RUT del representante" defaultValue={d.representanteRut} placeholder="12.345.678-9" disabled={ro} />
          <Input id="ccRepVNombre" name="representanteVentaNombre"
            etiqueta={<>Representante para venta{opcional}</>}
            defaultValue={d.representanteVentaNombre} placeholder="Si en las ventas firma otra persona" disabled={ro} />
          <Input id="ccRepVRut" name="representanteVentaRut" etiqueta="RUT del representante para venta" defaultValue={d.representanteVentaRut} placeholder="12.345.678-9" disabled={ro} />
        </div>

        {logo ? (
          <div className="tw:flex tw:flex-wrap tw:items-center tw:gap-ui">
            <img src={logo} alt="Logo de la corredora" className="tw:max-h-14 tw:max-w-40 tw:rounded-control tw:border tw:border-solid tw:border-edge tw:bg-card tw:object-contain tw:p-2" />
            {!ro && (
              <MenuMas tamano="md" etiqueta="Más acciones del logo" opciones={[{ id: 'ccQuitarLogo', texto: 'Quitar logo', icono: 'trash', alTocar: () => setLogo('') }]} />
            )}
          </div>
        ) : ro ? (
          <p className="tw:m-0 tw:text-sm tw:text-muted">Sin logo.</p>
        ) : null}
        {!ro && (
          <InputArchivo
            id="ccLogo"
            icono="image"
            accept="image/png,image/jpeg"
            etiqueta={logo ? 'Cambiar logo' : 'Subir logo'}
            ayuda="PNG o JPG; se achica solo"
            onArchivos={elegirLogo}
          />
        )}

        <ul className="tw:m-0 tw:list-disc tw:space-y-1 tw:rounded-card tw:border tw:border-solid tw:border-edge tw:bg-sunken tw:py-3 tw:pl-8 tw:pr-4 tw:text-[13px] tw:leading-relaxed tw:text-muted">
          <li><b className="tw:text-text">Razón social:</b> así se nombra a la corredora en los documentos. Vacío = el nombre de la corredora.</li>
          <li><b className="tw:text-text">Representante legal:</b> quien firma en nombre de la corredora (mandatos y contratos).{!d.representanteNombre && d.representante ? ` Hoy los documentos dicen: «${d.representante}».` : ''}</li>
          <li><b className="tw:text-text">Representante para venta:</b> firma el mandato de venta. Vacío = el mismo representante de arriba.</li>
          <li><b className="tw:text-text">Logo:</b> va en el encabezado de los documentos.</li>
        </ul>
        {!ro && (
          <div className="tw:flex tw:flex-nowrap tw:items-center tw:justify-end tw:gap-ui">
            <Boton id="cfgCorredoraGuardar" type="submit" cargando={guardando}>Guardar</Boton>
          </div>
        )}
      </form>
    </Card>
  );
}

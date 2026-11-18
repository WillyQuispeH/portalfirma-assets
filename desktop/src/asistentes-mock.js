// Configuración › Asistentes en modo de prueba (PF_MOCK=1): imita GET/PUT /v1/whatsapp/asistentes/config de la API, en
// memoria, para la pantalla y su prueba (test/asistentes-config-e2e.js). La API de verdad valida y guarda por corredora.
function base() {
  const horario = () => ({ activo: false, desde: '09:00', hasta: '19:00', dias: [1, 2, 3, 4, 5], zona: 'America/Santiago', fuera: 'avisar' });
  return {
    atencion: { activo: true, nombre: 'Tomás', presentacion: 'corredora', instrucciones: '', horario: horario(), mensajeFuera: '' },
    postventa: { auto: false, nombre: '', instrucciones: '', horario: horario(), mensajeFuera: '' },
    leads: { activo: true },
    equipo: { pedro: '', juanita: '', diego: '', fernanda: '' },
  };
}

function crear() {
  let c = base();
  const ver = () => ({ ...JSON.parse(JSON.stringify(c)), corredora: 'The Living', puedeEditar: true });
  const guardar = (o) => {
    const nuevo = JSON.parse(JSON.stringify(c));
    for (const k of ['atencion', 'postventa', 'leads', 'equipo']) {
      const s = o?.[k]; if (!s || typeof s !== 'object') continue;
      const { horario, ...resto } = s;
      Object.assign(nuevo[k], resto);
      if (horario) Object.assign(nuevo[k].horario, horario);
    }
    for (const k of ['atencion', 'postventa']) {
      const h = nuevo[k].horario;
      if (!/^([01]\d|2[0-3]):[0-5]\d$/.test(h.desde) || !/^([01]\d|2[0-3]):[0-5]\d$/.test(h.hasta)) throw new Error('Escribe la hora como HH:MM (por ejemplo 09:00).');
      if (h.desde >= h.hasta) throw new Error('La hora de término tiene que ser después de la de inicio.');
      if (!h.dias.length) throw new Error('Elige al menos un día.');
      nuevo[k].instrucciones = String(nuevo[k].instrucciones || '').slice(0, 1500);
      nuevo[k].nombre = String(nuevo[k].nombre || '').trim().slice(0, 40);
    }
    nuevo.atencion.nombre ||= 'Tomás';
    c = nuevo;
    return ver();
  };
  return { ver, guardar };
}

module.exports = { crear };

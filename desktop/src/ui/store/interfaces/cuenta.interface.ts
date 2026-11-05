// La cuenta de Portalfirma. Fuentes de verdad: src/pfapi.js (user, login, diagnostic) y src/portalfirma.js (session).

// Usuario de la conexión directa (correo y contraseña): lo que devuelve /partnerUser/validate (pfapi.user)
export interface IUsuarioPf {
  namePerson?: string;
  email?: string;
  nameEntity?: string;
  role?: string; // 'admin' u otro rol
  entity_id?: string;
  user_id?: string;
  name?: string; // las pruebas fijan { name } a mano
}

// Sesión del conector de Portalfirma (inicio de sesión en el navegador). Vive en `state.session` de app.js.
export interface ISesionPf {
  balance?: number | null;
  [campo: string]: unknown;
}

export interface IDiagnosticoPrueba {
  name: string;
  status?: number;
  ok: boolean;
  success?: boolean;
}

// api:diag en src/main.js: el archivo guardado en Descargas y el resultado de cada consulta
export interface IDiagnostico {
  file: string;
  tests: IDiagnosticoPrueba[];
}

export interface IDriveCuenta {
  connected: boolean;
  email?: string;
}

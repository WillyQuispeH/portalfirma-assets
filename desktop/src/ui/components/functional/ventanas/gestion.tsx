// Ventanas en React que abre el código antiguo de este grupo (src/renderer). Cada una se registra aquí con su nombre
// («gestion.algo») y se abre desde el JS antiguo con window.Ventanas.abrir('gestion.algo', props, { clave: 'modal-N' }).
// Ver registro.tsx.
import type { TVentanas } from './registro';
import { MuestraFlujo } from '../gestion/flujos/VentanasAntiguas';
import { FirmantesDocumento, ConfirmarEnvioLote } from '../gestion/carga-masiva/Ventanas';
import { TelefonoCuenta, ErrorArchivo, AccesoDocumentos } from '../gestion/operaciones/Ventanas';
import { ActivarFormatos, FormatosHito, ConfirmarFormato } from './gestion/Formatos';

export const ventanas: TVentanas = {
  'gestion.flujosMuestra': MuestraFlujo, // flujos.js · modal-21
  'gestion.envioLote': ConfirmarEnvioLote, // flujos.js · modal-22 y masiva.js · modal-43
  'gestion.masivaFirmantes': FirmantesDocumento, // masiva.js · modal-42
  'gestion.formatosConfirmar': ConfirmarFormato, // formatos.js · modal-23
  'gestion.formatosActivar': ActivarFormatos, // formatos.js · modal-24
  'gestion.formatos': FormatosHito, // formatos.js · modal-25
  'gestion.opsTelefono': TelefonoCuenta, // operaciones.js · modal-50
  'gestion.opsErrorArchivo': ErrorArchivo, // operaciones.js · modal-51
  'gestion.opsAcceso': AccesoDocumentos, // operaciones.js · modal-52
};

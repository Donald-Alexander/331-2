import * as diag from 'telephony/src/common/diagClient';

// export function registerDebugModules(){
//   diag.registerDebugModule('Ringer');
//   diag.registerDebugModule('DeviceManager');
//   diag.registerDebugModule('VolumeController');
// }

export function enableDefaultDiagModules() {
  diag.enableDebugModule('alidecoder.ali', true);
  diag.enableDebugModule('appserverclient.appserverclient', true);
  diag.enableDebugModule('appserverclient.ws', true);
  diag.enableDebugModule('autorebid.ali', true);
  diag.enableDebugModule('devicemanager', false);
  diag.enableDebugModule('forceconnect', true);
  diag.enableDebugModule('httpcadout', false);
  diag.enableDebugModule('ldconfig.ani', true);
  diag.enableDebugModule('npdtonpa.ani', true);
  diag.enableDebugModule('outbounddialplan.ani', true);
  diag.enableDebugModule('progresstonemanager', true);
  diag.enableDebugModule('ringer', true);
  diag.enableDebugModule('tddmanager.tdd', true);
  diag.enableDebugModule('volumecontroller', false);
  diag.enableDebugModule('wavmanager', true);
  diag.enableDebugModule('webcall', true);
  diag.enableDebugModule('webcall.ali', true);
  diag.enableDebugModule('webcall.ani', true);
  diag.enableDebugModule('webconference', true);
  diag.enableDebugModule('webline', true);
  diag.enableDebugModule('weblinedev', true);
  diag.enableDebugModule('weblinedev.appserverclient', true);
  diag.enableDebugModule('weblinedev.listenjoin', true);
  diag.enableDebugModule('weblinedev.vcceventhandler', true);
  diag.enableDebugModule('weblinedev.webviperdriver', true);
  diag.enableDebugModule('webnode', true);
  diag.enableDebugModule('webviperdriver.webviperdriver', false);
  diag.enableDebugModule('wirelessconfig.ali', true);
}

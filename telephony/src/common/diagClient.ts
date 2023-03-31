import { DiagClient } from 'client-web-api/src/diagnostics/DiagClient';
import { DiagModule } from 'common/src/diagnostics/DiagModule';
import { StringFormatter } from 'common/src/diagnostics/StringFormatter';

const registeredDiagModules: Map<string, DiagModule> = new Map();

const MODULE_PREFIX = 'tel:';
const DEFAULT_SUBJECT = 'debug';

// Note:
//    - Reference to DiagModule changes to any to make it compilable, because DiagModule
//      needs to install common from p911 and cause failure at the moment
//    - registerDebugModule() assumes the default subject 'Debug'. You can specify a different
//    - subject for your module by using a dot after the module Name (i.e. ModuleName.SubjectName)
//    - registerDebugModule() can be optimized out as we always need to call it.

function parseModuleName(moduleName: string): { keyName: string; modName: string; subject: string } {
  let modName = moduleName;
  let subject = DEFAULT_SUBJECT;

  // check for 'moduleName.subject' format of module name
  const dotPos = moduleName.indexOf('.');
  if (dotPos !== -1) {
    modName = moduleName.substring(0, dotPos);
    subject = moduleName.substring(dotPos + 1) || DEFAULT_SUBJECT;
  }

  // make sure the module name starts with the telephony module prefix
  if (!modName.startsWith(MODULE_PREFIX)) {
    modName = `${MODULE_PREFIX}${modName}`;
  }

  const keyName = `${modName}.${subject}`;

  return { keyName, modName, subject };
}

function registerDiagModule(moduleName: string): DiagModule {
  const { keyName, modName, subject } = parseModuleName(moduleName);
  let mod = registeredDiagModules.get(keyName);

  if (!mod) {
    mod = DiagClient.instance.register(modName, subject);
    registeredDiagModules.set(keyName, mod);
  }

  return mod;
}
export function enableDebugModule(moduleName: string, enable: boolean) {
  const { keyName } = parseModuleName(moduleName);

  const module = registeredDiagModules.get(keyName);
  if (module) {
    module.isEnabled = enable;
  }
}

export class Diag {
  private readonly fileName: string;
  private readonly mod: DiagModule;

  constructor(moduleName: string) {
    this.fileName = moduleName;
    this.mod = registerDiagModule(moduleName);
  }

  err(functionName: string, message: string | StringFormatter, multiLine?: string | StringFormatter): void {
    DiagClient.instance.error(this.fileName, functionName, message, multiLine);
  }

  warn(functionName: string, message: string | StringFormatter, multiLine?: string | StringFormatter): void {
    DiagClient.instance.warning(this.fileName, functionName, message, multiLine);
  }

  out(functionName: string, message: string | StringFormatter, multiLine?: string | StringFormatter): void {
    DiagClient.instance.out(this.fileName, functionName, message, multiLine);
  }

  get trace() {
    return this.mod.isEnabled ? this._trace : null;
  }

  private _trace(functionName: string, message: string | StringFormatter, multiLine?: string | StringFormatter): void {
    // for now we use 'out' because 'trace' level doesn't exist in DiagModule
    DiagClient.instance.out(this.fileName, functionName, message, multiLine);
  }
}

interface ILoggerConnector {
  level: string;
  message: string;
  context: any;
}

type LoggerConnector = (connector: ILoggerConnector) => void;

class Logger {
  private static readonly levels: { [index: string]: number } = {
    error: 4,
    warn: 3,
    info: 2,
    verbose: 1,
    debug: 0
  };

  private static getLevelIdx(level: string) {
    const idx = Logger.levels[level];
    return idx === undefined ? 0 : idx;
  }

  public level: string = 'info';
  public connector?: LoggerConnector;

  constructor(level: string, connector?: LoggerConnector) {
    this.level = level;

    if (connector) {
      this.connector = connector;
    }
  }

  public error(message:string, context:any) {
    this.log('error', message, context);
  }

  public warn(message:string, context:any) {
    this.log('warn', message, context);
  }

  public info(message:string, context:any) {
    this.log('info', message, context);
  }

  public debug(message:string, context:any) {
    this.log('debug', message, context);
  }

  public verbose(message:string, context:any) {
    this.log('verbose', message, context);
  }

  public log(level:string, message:string, context:any) {
    const levelIdx = Logger.getLevelIdx(level);
    const thresholdIdx = Logger.getLevelIdx(this.level);
    if (this.connector && levelIdx >= thresholdIdx) {
      this.connector({ level, message, context });
    }
  }
}

export const log = new Logger('info');

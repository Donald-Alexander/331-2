import https from 'https';
import http, { ClientRequest, IncomingMessage } from 'http';

// const ModuleName = 'HttpClient';
export interface Request<TData> {
  method: string;
  host: string;
  port: number;
  path?: string;
  headers?: { [key: string]: string };
  data?: TData;
}

export interface HttpStatusCodeHandler<TInput, TOutput> {
  [httpStatusCode: number]: (request: Request<TInput>) => TOutput;
}

export class HttpClient {
  private secure: boolean = true;
  private strictJsonResponses: boolean = false;

  // Note: use 'text/plain' to avoid preflight (sending OPTIONS before request) since CadRouter does not support
  private contentType: string = 'text/plain'; // 'application/json'

  // constructor() {}

  protected get<TResult>(
    host: string,
    port: number,
    path: string,
    handledStatusCodes?: HttpStatusCodeHandler<void, TResult>
  ): Promise<TResult> {
    return this.request<void, TResult>({ method: 'GET', host, port, path }, handledStatusCodes);
  }

  protected post<TInput, TOutput>(
    host: string,
    port: number,
    data: TInput,
    handledStatusCodes?: HttpStatusCodeHandler<TInput | void, TOutput>
  ): Promise<TOutput> {
    return this.request<TInput, TOutput>({ method: 'POST', host, port, data }, handledStatusCodes);
  }

  // use http.request or https.request
  private request<TInput, TOutput>(
    request: Request<TInput>,
    handledStatusCodes?: HttpStatusCodeHandler<TInput | void, TOutput>
  ): Promise<TOutput> {
    return new Promise<TOutput>((resolve, reject) => {
      const jsonData = request.data ? JSON.stringify(request.data) : undefined;
      const contentLength = jsonData ? Buffer.byteLength(jsonData) : 0;
      const options: https.RequestOptions | http.RequestOptions = {
        protocol: 'https:',
        host: request.host,
        port: request.port,
        path: request.path,
        timeout: 3000,
        method: request.method,
        rejectUnauthorized: false,
        headers: {
          'Content-Type': this.contentType,
          'Content-Length': contentLength,
        },
      };

      const req: ClientRequest = (this.secure ? https : http).request(options, (res: IncomingMessage) => {
        let data: string = '';
        res.on('data', (chunk: string) => {
          data += chunk;
        });
        res.on('end', () => {
          try {
            // console.log(ModuleName + ' response ==> ' + data);
            const result = JSON.parse(data) as TOutput;
            resolve(result);
          } catch (e) {
            if (this.strictJsonResponses) {
              reject(new Error(e + ', response:\n' + data));
            } else {
              resolve((data as any) as TOutput);
            }
          }
        });
      });

      // req.on('response', (res: IncomingMessage) => {
      //   var statusCodeHandler = handledStatusCodes && res.statusCode && handledStatusCodes[res.statusCode];
      //   if (statusCodeHandler) {
      //     return statusCodeHandler(request);
      //   }
      // });

      req.on('error', (err: Error) => reject(new Error(err.message)));

      req.on('timeout', () => reject(new Error('Http request timed out')));

      req.on('close', () => reject(new Error('Http request closed')));

      // send jsonData
      if (jsonData) {
        req.write(jsonData);
      }

      req.end();
    });
  }
}

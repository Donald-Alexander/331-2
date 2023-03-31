import { HttpClient, HttpStatusCodeHandler } from '@src/common/httpClient';
import https from 'https';
import { IncomingMessage, ServerResponse } from 'http';
import { SecureContextOptions } from 'tls';

const secureContextOptions: SecureContextOptions = {
  key:
    '-----BEGIN RSA PRIVATE KEY-----\nMIIEpAIBAAKCAQEAsUuCwcp9RAXR7WY8fPves1eNM3UKCP6CMQ6D1S03J+DxCsopQ/HlpMmK7r41BvjO5HqaSQiq0iBHuMk6E7tn8IoIXG/TOdzXbcwIZzUSdnLT4TAPMd+h5FH2zIci2cg3B45QpcIZSIhSFArSuQuBjoiKmdeUlvIqalCMO5ANleU20gLh/fBzUOeSEUQQ403eIeUWB2vpOxMjabrMjx9atRsNmnzguKgog2KSjTVBuB9JWOjuYZ2bk04EzDB73Vx0fgGVcU6Dd6NN4tFldtaYP4YsJU2MnvVbG1EQ2Bfk4qU3aXCPVN82gEvROBO992OPR7p861768J3Sii5g/yXlLwIDAQABAoIBAHfkVlHyOm9reCCPyEvEjz677/JiLR0T7rp51FCuOOQwyw++0dTumZqr59W2rmk+i7oZ5oeI4ushhR7ChRGe45TX4vuPa0lvvAa1uOECFLAgyoM3Wq8hSXr6qmh44epf6EalyIevECXqeYawIvubeksGrqOGEydYL7KhMZN9wJIhw3upJ3H2uZwhhBgU958XLxchPLr6pXpRg9Qzb577MLvYvtHTzksjzzceSiY1DLS+SPXSOVpjGgDCHqUrju6kGULExVdIzhVqxS6geGJQeksSE6BhSpPs1gvGZ+XklFDqLmD44C+LvMvocshUMfvKpaBHGkj4T4dHFaWIxUs347ECgYEA6QByKWd/cAmDrV8Qlc1Q1QkGXiLlyTyhiKxFlK8sQ0t0Ci0PGGUDFxwUKu4G+VMWwbHMRoM5ymcLYOTksEbs98cap4bwUuM74hz02XYm+Uhr2A58354BOdQ1sCmvOSS2HGmn50J1udSB08ukNehEki7v2o/wDBuHASK424QE6jUCgYEAwstzPkhU31smkcWdhrsY7FEwNoumvG/x6OWYx22nAYOXcqTDckOS/FZZegXMST09URCbG00q8Ke/irAMkNoJc+rvndGzo2/hZIhhEGHo9E8TZ37MFXI4qWnJOiOiEHZ3EE5b8uunEseOD6wwt3vRftGTUNnsGAVOqMHwT+Mk3lMCgYA2ZF9CISITwnTVzSJvBf3/rVqqMRVZU+kVobmgiwAXOY7+LSSf+jytcWWX2/cOzwG598qLD2k3QbTbSrPEHtqEwRsMzqhdgSRilYXnGfjhKrHaPw+RmC4LFOnvlNuNyG8m1NdYWiBnYB9qlNhhqTYQthpR+FX+TZLHhhaHUBthnQKBgQCRmbToRvR5hw5LQ2S9gjfc28qn2rakfyBYrtUFq+Z68TtQi+szC2NgjcKPvKm3zLh6UWk+fO2tuBUpuvGJjBAovuCgHFCjx0q39GBo+GZBxqGAaHxvQ1Mq/lFUzbGjkIjqfUepSY82MEb1XAWGAFzU6B2u/1TDl6P17BCOBgBW1QKBgQDA32Nd7JhvauQmzlWB5S4xiD6vsSUSuCLm0HtQxITmMDtr6XiQSLBH9ZLr7ijJsv9Pw2gtKzEcXsB4rycNhNWJ2I0G4mC62hmr/olKPjfNzVrtzyFeC0xOLLaWTzhKv0TvyD7ANK9kE8LC6dGkmrrjBOnmcbHzlyZprdAjV/pw+g==\n-----END RSA PRIVATE KEY-----',
  cert:
    '-----BEGIN CERTIFICATE-----\nMIIDUTCCAjkCFFRL0VKbSelfoMwud0Nr8GP68/EqMA0GCSqGSIb3DQEBCwUAMGUxCzAJBgNVBAYTAkNBMQ8wDQYDVQQIDAZRdWViZWMxETAPBgNVBAcMCE1vbnRyZWFsMRAwDgYDVQQKDAdJbnRyYWRvMQ0wCwYDVQQLDARQOTExMREwDwYDVQQDDAhQOTExU2FhUzAeFw0yMDA5MDMwMjI2MDBaFw00ODAxMTkwMjI2MDBaMGUxCzAJBgNVBAYTAkNBMQ8wDQYDVQQIDAZRdWViZWMxETAPBgNVBAcMCE1vbnRyZWFsMRAwDgYDVQQKDAdJbnRyYWRvMQ0wCwYDVQQLDARQOTExMREwDwYDVQQDDAhQOTExU2FhUzCCASIwDQYJKoZIhvcNAQEBBQADggEPADCCAQoCggEBALFLgsHKfUQF0e1mPHz73rNXjTN1Cgj+gjEOg9UtNyfg8QrKKUPx5aTJiu6+NQb4zuR6mkkIqtIgR7jJOhO7Z/CKCFxv0znc123MCGc1EnZy0+EwDzHfoeRR9syHItnINweOUKXCGUiIUhQK0rkLgY6IipnXlJbyKmpQjDuQDZXlNtIC4f3wc1DnkhFEEONN3iHlFgdr6TsTI2m6zI8fWrUbDZp84LioKINiko01QbgfSVjo7mGdm5NOBMwwe91cdH4BlXFOg3ejTeLRZXbWmD+GLCVNjJ71WxtRENgX5OKlN2lwj1TfNoBL0TgTvfdjj0e6fOte+vCd0oouYP8l5S8CAwEAATANBgkqhkiG9w0BAQsFAAOCAQEAQ4IFTiAbey8RgM71e8EMqMaHgO4vDAiYj2hyjxo1Kk1QNEDfDUtuFR4SokcucGq1W9pm4QmAZJpeSksHFxy9mYsz9pa7bFSxST2xYDLDzNH1uLweOLrKXDvey0/kZ0hpjH9dVj4CJTWjNlKnXATsevbQKzmD0iOgQ22rKSR8w1hEGsYBfhEaTP+QxVnZ5S8HWKdVjeVxmDpDWjkp+fmlnKzCFdmGHrkukwwQB1R9Yag6ThB6yl+8BirYupm2swlbo7P5Qr+ss196+vAg1OL+WkPO3Y9rH/FI1PsRQRaFgITE6FbeU97nHjvXPwqgNbcqAzKbjihqWpqAH4qcT7lhSw==\n-----END CERTIFICATE-----',
};

const mockRequest = {
  CadTypeOfMsg: 'CadConnect',
  AliType: '1',
  CadAli: '<----this is ALI---->',
  TrunkAddress: '911032',
  ViperPos: 2,
  CadPos: 2,
  UniqueCallId: '911032-20201108093000-0567',
};
const mockResponse = { result: 'success' };

// https server
const server: https.Server = https.createServer(secureContextOptions, (req: IncomingMessage, res: ServerResponse) => {
  res.writeHead(200, { 'Content-Type': 'application/json' });
  res.write(JSON.stringify(mockResponse));
  res.end();
});

const serverPort = 10557;
class MockedHttpClient extends HttpClient {
  public mockedGet<TResult>(
    host: string,
    port: number,
    path: string,
    handledStatusCodes?: HttpStatusCodeHandler<void, TResult>
  ): Promise<TResult> {
    return this.get(host, port, path, handledStatusCodes);
  }
  public mockedPost<TInput, TOutput>(
    host: string,
    port: number,
    data: TInput,
    handledStatusCodes?: HttpStatusCodeHandler<TInput | void, TOutput>
  ): Promise<TOutput> {
    return this.post(host, port, data, handledStatusCodes);
  }
}
const httpClient = new MockedHttpClient();

beforeAll(() => {
  server.listen(serverPort);
});

afterAll(() => {
  server.close();
});

describe('test with local https server', () => {
  test('https-post', async () => {
    return expect(httpClient.mockedPost('localhost', serverPort, mockRequest)).resolves.toEqual(mockResponse);
  });
});

// TODO:
//    unskip to test with remote servers
// describe('test with remote https server', () => {
describe.skip('test with remote https server', () => {
  const cadConnect = {
    CadTypeOfMsg: 'CadConnect',
    AliType: '1',
    CadAli: '<----this is ALI---->',
    TrunkAddress: '911032',
    ViperPos: 2,
    CadPos: 2,
    UniqueCallId: '911032-20201108093000-0567',
  };
  const cadDisconnect = {
    CadTypeOfMsg: 'CadDisconnect',
    TrunkAddress: '911032',
    ViperPos: 2,
    CadPos: 2,
    UniqueCallId: '911032-20201108093000-0567',
  };
  const host = '10.103.40.137';
  const port = 443;

  test('https-post-cadConnect', () => {
    return expect(httpClient.mockedPost(host, port, cadConnect)).resolves.toMatch('Success');
  });

  test('https-post-cadDisconnect', () => {
    return expect(httpClient.mockedPost(host, port, cadDisconnect)).resolves.toMatch('Success');
  });

  test('https-post-timeout', () => {
    const timedout = new Error('Http request timed out');

    return expect(httpClient.mockedPost(host, 81, cadConnect)).rejects.toEqual(timedout);
  });

  test('https-get', async () => {
    const error = {
      message: 'Not Found',
      statusCode: 404,
    };
    const promise = await httpClient.mockedGet('10.103.40.17', 443, 'api/v1/telephony/config/NodeConfig');
    expect(promise).not.toEqual(error);
  });
});

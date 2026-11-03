const request = require('supertest');
const app = require('../../api-proxy');

describe('API proxy decision analysis routes', () => {
  const originalBackendUrl = process.env.BACKEND_URL;
  const originalApiAuthToken = process.env.API_AUTH_TOKEN;
  const originalFetch = global.fetch;

  beforeEach(() => {
    process.env.BACKEND_URL = 'https://backend.example.test/';
    process.env.API_AUTH_TOKEN = 'test-token';
    global.fetch = jest.fn().mockResolvedValue({
      status: 200,
      headers: new Headers({ 'content-type': 'application/json' }),
      arrayBuffer: async () => Buffer.from('{"ok":true}')
    });
  });

  afterAll(() => {
    if (originalBackendUrl === undefined) delete process.env.BACKEND_URL;
    else process.env.BACKEND_URL = originalBackendUrl;
    if (originalApiAuthToken === undefined) delete process.env.API_AUTH_TOKEN;
    else process.env.API_AUTH_TOKEN = originalApiAuthToken;
    global.fetch = originalFetch;
  });

  test.each(['/api/explain', '/api/counterfactuals', '/api/optimize'])(
    'forwards POST %s to the backend instead of returning a proxy 404',
    async (path) => {
      const body = { workload: { application_type: 'smart_camera' } };
      const response = await request(app).post(path).send(body);

      expect(response.statusCode).toBe(200);
      expect(response.body).toEqual({ ok: true });
      const [destination, options] = global.fetch.mock.calls[0];
      expect(destination).toEqual(new URL(`https://backend.example.test${path}`));
      expect(options).toEqual(expect.objectContaining({
        method: 'POST',
        headers: expect.objectContaining({
          authorization: 'Bearer test-token',
          'content-type': 'application/json'
        }),
        body: JSON.stringify(body)
      }));
    }
  );
});

/**
 * TERRA.SINAL — único ponto de acesso à Web API ASP.NET Core.
 * Os dados são reais (Earth Engine) e as previsões vêm do modelo ML.NET carregado no servidor.
 */
(function () {
  'use strict';
  const config = Object.assign({ baseUrl: '/api', antiforgeryToken: '', isAdmin: false }, window.TERRA_CONFIG || {});
  const qs = params => new URLSearchParams(
    Object.fromEntries(Object.entries(params).filter(([, v]) => v != null && v !== ''))
  ).toString();

  async function http(url, options) {
    const opts = Object.assign({ credentials: 'same-origin', headers: {} }, options || {});
    opts.headers = Object.assign({ Accept: 'application/json' }, opts.headers);
    if (opts.method && opts.method !== 'GET') opts.headers.RequestVerificationToken = config.antiforgeryToken;
    if (opts.json !== undefined) {
      opts.headers['Content-Type'] = 'application/json';
      opts.body = JSON.stringify(opts.json);
      delete opts.json;
    }
    const response = await fetch(config.baseUrl + url, opts);
    if (response.status === 401) {
      window.location.href = '/Account/Login?returnUrl=' + encodeURIComponent(location.pathname + location.hash);
      throw new Error('Sessão expirada. A redireccionar para o login…');
    }
    const type = response.headers.get('content-type') || '';
    const body = type.includes('json') ? await response.json().catch(() => null) : await response.text();
    if (!response.ok) {
      const detail = body && (body.detail || body.title || body.message);
      const error = new Error(response.status === 403
        ? 'Sem permissão para esta operação.'
        : `Erro da API (${response.status})${detail ? ': ' + detail : ''}`);
      error.status = response.status;
      error.body = body;
      throw error;
    }
    return body;
  }

  const api = {
    isAdmin: () => !!config.isAdmin,
    regions: () => http('/regions'),
    periods: region => http(`/periods?${qs({ region })}`),
    observation: (region, period) => http(`/observations?${qs({ region, period })}`),
    timeSeries: region => http(`/observations?${qs({ region })}`),
    mapSites: period => http(`/observations/sites?${qs({ period })}`),
    recommendations: () => http('/recommendations'),
    predictionsHistory: () => http('/predictions/history'),
    modelStatus: () => http('/models/status'),
    modelMetrics: () => http('/models/metrics'),
    /** payload: {region, period, save} ou com valores manuais {chuvaMm, chuvaLag1..3, vv, vh} */
    predict: payload => http('/predictions', { method: 'POST', json: payload }),
    review: payload => http('/recommendations/review', { method: 'POST', json: payload }),
    train: () => http('/models/train', { method: 'POST' }),
    importDataset(file, dryRun) {
      const form = new FormData();
      form.append('file', file);
      form.append('dryRun', dryRun ? 'true' : 'false');
      return http('/datasets/import', { method: 'POST', body: form });
    }
  };

  window.TERRA_API = Object.freeze(api);
})();

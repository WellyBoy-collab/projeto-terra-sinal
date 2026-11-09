/**
 * Único ponto de acesso a dados da interface.
 * TERRA_CONFIG.useApi = true liga ao backend ASP.NET (que por sua vez fala com o Agente de IA Python).
 */
(function () {
  'use strict';
  const config = Object.assign({ useApi: false, baseUrl: '/api' }, window.TERRA_CONFIG || {});
  const copy = value => JSON.parse(JSON.stringify(value));
  const qs = params => new URLSearchParams(
    Object.fromEntries(Object.entries(params).filter(([, v]) => v != null && v !== ''))
  ).toString();

  async function http(url, options) {
    const response = await fetch(config.baseUrl + url, Object.assign({
      credentials: 'same-origin',
      headers: { Accept: 'application/json', 'Content-Type': 'application/json' }
    }, options || {}));
    if (!response.ok) {
      let detail = '';
      try { detail = (await response.json()).message || ''; } catch (_) {}
      throw new Error(`Erro da API (${response.status})${detail ? ': ' + detail : ''}`);
    }
    return response.json();
  }

  const api = {
    isConnected: () => config.useApi,

    async regions() {
      return config.useApi ? http('/regions') : ['Buzi', 'Muanza'];
    },

    async observations(region, period) {
      if (config.useApi) return http(`/observations?${qs({ region, period })}`);
      const value = window.TERRA_MOCK.observations.find(o => o.region === region && o.period === period);
      if (!value) throw new Error('Não existem observações para a região e período seleccionados.');
      return copy(value);
    },

    async timeSeries(region) {
      if (config.useApi) return http(`/observations?${qs({ region })}`);
      return copy(window.TERRA_MOCK.observations.filter(o => o.region === region).sort((a, b) => a.period.localeCompare(b.period)));
    },

    async mapSites() {
      return config.useApi ? http('/observations/sites') : copy(window.TERRA_MOCK.mapSites);
    },

    async predictionsHistory() {
      return config.useApi ? http('/predictions/history') : copy(window.TERRA_MOCK.seededHistory);
    },

    async modelMetrics() {
      if (config.useApi) return http('/models/metrics');
      return { activeModel: 'FastTree', version: 'v0.3-demo', demo: true };
    },

    /** Health do Agente de IA Python (via ASP.NET) */
    async aiHealth() {
      if (!config.useApi) return { status: 'mock', modelLoaded: false, version: 'mock' };
      return http('/ai/health');
    },

    /**
     * Verificação meteorológica + classificação de stress pelo Agente de IA Python.
     * Aceita objecto com indicadores ou {region, period}.
     */
    async aiVerify(payload) {
      if (!config.useApi) {
        // Fallback local simples para protótipo HTML puro
        const cls = payload.ndvi < 0.42 ? 'Severo' : payload.ndvi < 0.50 ? 'Moderado' : payload.ndvi < 0.60 ? 'Ligeiro' : 'Saudável';
        return {
          stressClass: cls,
          confidence: 0.75,
          probabilities: {},
          region: payload.region,
          period: payload.period,
          modelVersion: 'mock-local',
          featuresUsed: [],
          verificationNotes: ['Modo mock — active useApi e o Agente Python para resultados reais.']
        };
      }
      return http('/ai/verify', { method: 'POST', body: JSON.stringify(payload) });
    }
  };

  window.TERRA_API = Object.freeze(api);
})();

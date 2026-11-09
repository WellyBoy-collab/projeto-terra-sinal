using Microsoft.Extensions.Options;
using Vegetation.ML;

namespace TerraSinal.Web.Services;

/// <summary>Regra de apoio à decisão associada a cada classe do modelo.</summary>
public record Recomendacao(string Id, string Classe, string Titulo, string Texto, string Prioridade);

/// <summary>Observação mensal pronta para a interface: indicadores, anomalias, classe observada e previsão.</summary>
public record ObservacaoDto(
    string Region, string Period, int Year, int Month,
    double? Ndvi, double? NdviZ, double PixelsValidos, double Cobertura, bool CoberturaOk, int NImagensS2,
    double ChuvaMm, double? ChuvaZ, double? ChuvaLag1, double? ChuvaLag2, double? ChuvaLag3,
    double VV, double VH, double? VvZ, double? VhZ, int NImagensS1,
    string? ClasseObservada, string Conjunto,
    ResultadoPrevisao? Previsao, string? PrevisaoErro,
    Recomendacao? Recomendacao, List<string> Notas);

/// <summary>
/// Liga o modelo treinado do ProjetoSeca (Vegetation.ML: ML.NET + LightGBM) ao ASP.NET.
/// Mantém o modelo carregado em memória, calcula previsões e permite retreinar.
/// </summary>
public class ServicoModeloStress
{
    public static readonly IReadOnlyDictionary<string, Recomendacao> Regras = new Dictionary<string, Recomendacao>
    {
        ["normal"] = new("R01", "normal", "Vegetação normal",
            "Manter a monitoria de rotina e confirmar na próxima actualização mensal de NDVI, chuva e radar.", "Baixa"),
        ["moderado"] = new("R02", "moderado", "Stress moderado",
            "Sinalizar para análise técnica, aumentar a frequência de observação e comparar chuva e radar com os meses anteriores.", "Média"),
        ["severo"] = new("R03", "severo", "Stress severo",
            "Gerar alerta de prioridade elevada, destacar o distrito no painel e validar no terreno com os serviços distritais.", "Alta")
    };

    private readonly RepositorioDados _dados;
    private readonly ILogger<ServicoModeloStress> _logger;
    private readonly string _pastaRuntime;
    private readonly string _pastaModelo;
    private readonly object _bloqueioTreino = new();
    private readonly object _bloqueioCache = new();
    private volatile PrevisorStress? _previsor;
    private Dictionary<string, IReadOnlyList<ObservacaoDto>> _cacheSeries = new();
    private (string? Versao, int Dados) _chaveCache;

    public ServicoModeloStress(RepositorioDados dados, IOptions<OpcoesModelo> opcoes,
        IWebHostEnvironment env, ILogger<ServicoModeloStress> logger)
    {
        _dados = dados;
        _logger = logger;
        _pastaRuntime = Path.Combine(env.ContentRootPath, opcoes.Value.RuntimeFolder);
        _pastaModelo = Path.Combine(_pastaRuntime, "modelo");

        try
        {
            if (!File.Exists(Path.Combine(_pastaModelo, "metricas.json")))
            {
                var semente = Path.Combine(env.ContentRootPath, opcoes.Value.SeedFolder, "modelo");
                CopiarPasta(semente, _pastaModelo);
                _logger.LogInformation("Modelo treinado copiado de {Origem}", semente);
            }
            _previsor = new PrevisorStress(_pastaModelo);
            _logger.LogInformation("Modelo de stress carregado: {Versao} ({Ativo})", _previsor.Versao, _previsor.Meta.ModeloAtivo);
        }
        catch (Exception ex)
        {
            Erro = ex.Message;
            _logger.LogError(ex, "Não foi possível carregar o modelo ML.NET de {Pasta}", _pastaModelo);
        }
    }

    public bool Disponivel => _previsor is not null;
    public string? Erro { get; private set; }
    public string? Versao => _previsor?.Versao;
    public ResultadoTreino? Meta => _previsor?.Meta;
    public bool TreinoEmCurso { get; private set; }

    private PrevisorStress Previsor =>
        _previsor ?? throw new InvalidOperationException("Modelo ML.NET indisponível: " + Erro);

    // ---------------------------------------------------------------- previsões

    /// <summary>Monta a entrada do modelo a partir do histórico (precisa dos 3 meses anteriores).</summary>
    public EntradaPrevisao? EntradaDoHistorico(LinhaDados l, out string? motivo)
    {
        var l1 = _dados.ObterPorIndice(l.Distrito, l.Indice - 1);
        var l2 = _dados.ObterPorIndice(l.Distrito, l.Indice - 2);
        var l3 = _dados.ObterPorIndice(l.Distrito, l.Indice - 3);
        if (l1 is null || l2 is null || l3 is null)
        {
            motivo = "Faltam dados de chuva dos 3 meses anteriores para este período.";
            return null;
        }
        motivo = null;
        return new EntradaPrevisao(l.Distrito, l.Ano, l.Mes, l.ChuvaMm, l1.ChuvaMm, l2.ChuvaMm, l3.ChuvaMm, l.VV, l.VH);
    }

    public ResultadoPrevisao Prever(EntradaPrevisao entrada) => Previsor.Prever(entrada);

    /// <summary>Série completa de um distrito, com previsão para cada mês (em cache até mudar o modelo ou os dados).</summary>
    public IReadOnlyList<ObservacaoDto> Serie(string distrito)
    {
        lock (_bloqueioCache)
        {
            var chave = (Versao, _dados.Versao);
            if (chave != _chaveCache)
            {
                _cacheSeries = new Dictionary<string, IReadOnlyList<ObservacaoDto>>();
                _chaveCache = chave;
            }
            if (_cacheSeries.TryGetValue(distrito, out var emCache)) return emCache;

            var linhas = _dados.DoDistrito(distrito);
            var entradas = new List<(LinhaDados Linha, EntradaPrevisao? Entrada, string? Motivo)>();
            foreach (var l in linhas)
            {
                var e = EntradaDoHistorico(l, out var motivo);
                entradas.Add((l, e, motivo));
            }

            var resultados = new Dictionary<int, ResultadoPrevisao>();
            string? erroGeral = null;
            if (_previsor is not null)
            {
                var validas = entradas.Where(x => x.Entrada is not null).ToList();
                try
                {
                    var previsoes = _previsor.PreverVarios(validas.Select(x => x.Entrada!).ToList());
                    for (int i = 0; i < validas.Count; i++) resultados[validas[i].Linha.Indice] = previsoes[i];
                }
                catch (Exception ex)
                {
                    // Uma entrada inválida não deve impedir a série inteira: tentar uma a uma
                    _logger.LogWarning(ex, "Previsão em lote falhou para {Distrito}; a prever mês a mês.", distrito);
                    foreach (var v in validas)
                    {
                        try { resultados[v.Linha.Indice] = _previsor.Prever(v.Entrada!); }
                        catch (Exception ex2) { _logger.LogDebug(ex2, "Falha em {Periodo}", v.Linha.Periodo); }
                    }
                }
            }
            else erroGeral = "Modelo indisponível: " + Erro;

            var serie = entradas.Select(x =>
            {
                resultados.TryGetValue(x.Linha.Indice, out var p);
                var erro = p is not null ? null : erroGeral ?? x.Motivo ?? "Não foi possível calcular a previsão.";
                return ConstruirDto(x.Linha, p, erro);
            }).ToList();

            _cacheSeries[distrito] = serie;
            return serie;
        }
    }

    public ObservacaoDto? Observacao(string distrito, int ano, int mes) =>
        Serie(distrito).FirstOrDefault(o => o.Year == ano && o.Month == mes);

    /// <summary>Converte uma linha de dados em DTO (anomalias calculadas com as normais do modelo activo).</summary>
    public ObservacaoDto ConstruirDto(LinhaDados l, ResultadoPrevisao? previsao, string? erro)
    {
        var normais = _previsor?.Normais;
        double? Z(Dictionary<string, Estatistica>? tabela, int mes, double? x)
        {
            if (tabela is null || x is null) return null;
            return tabela.TryGetValue(TabelaNormais.Chave(l.Distrito, mes), out var e) ? (x.Value - e.Media) / e.Desvio : null;
        }

        double maxPixels = _dados.MaxPixels(l.Distrito);
        double cobertura = maxPixels > 0 ? l.PixelsValidos / maxPixels : 0;
        bool coberturaOk = l.Ndvi is not null && l.Ano >= ConfiguracaoStress.PrimeiroAno
                           && cobertura >= ConfiguracaoStress.CoberturaMinima;

        double? ndviZ = Z(normais?.Ndvi, l.Mes, l.Ndvi);
        string? classeObs = coberturaOk && ndviZ is not null
            ? ndviZ < ConfiguracaoStress.LimiarSevero ? "severo"
              : ndviZ < ConfiguracaoStress.LimiarModerado ? "moderado" : "normal"
            : null;

        var l1 = _dados.ObterPorIndice(l.Distrito, l.Indice - 1);
        var l2 = _dados.ObterPorIndice(l.Distrito, l.Indice - 2);
        var l3 = _dados.ObterPorIndice(l.Distrito, l.Indice - 3);

        int ultimoTreino = _previsor?.Meta.UltimoAnoTreino ?? int.MaxValue;
        string conjunto = l.Ano < ConfiguracaoStress.PrimeiroAno ? "excluído"
            : l.Ano <= ultimoTreino ? "treino"
            : l.Ano <= ultimoTreino + ConfiguracaoStress.AnosDeTeste ? "teste" : "novo";

        double? chuvaZ = Z(normais?.Chuva, l.Mes, l.ChuvaMm);
        double? vvZ = Z(normais?.VV, l.Mes, l.VV);
        double? vhZ = Z(normais?.VH, l.Mes, l.VH);
        double? lag1Z = l1 is null ? null : Z(normais?.Chuva, l1.Mes, l1.ChuvaMm);

        var notas = Notas(chuvaZ, lag1Z, vvZ, vhZ, l.Ndvi is null, coberturaOk, classeObs, previsao);

        return new ObservacaoDto(
            l.Distrito, l.Periodo, l.Ano, l.Mes,
            l.Ndvi, ndviZ, l.PixelsValidos, Math.Round(cobertura, 3), coberturaOk, l.NImagensS2,
            l.ChuvaMm, chuvaZ, l1?.ChuvaMm, l2?.ChuvaMm, l3?.ChuvaMm,
            l.VV, l.VH, vvZ, vhZ, l.NImagensS1,
            classeObs, conjunto, previsao, erro,
            previsao is null ? null : Regras.GetValueOrDefault(previsao.Classe), notas);
    }

    /// <summary>Notas explicativas simples (não substituem a análise técnica).</summary>
    public static List<string> Notas(double? chuvaZ, double? lag1Z, double? vvZ, double? vhZ,
        bool semNdvi, bool coberturaOk, string? classeObs, ResultadoPrevisao? p)
    {
        var n = new List<string>();
        if (chuvaZ < -1) n.Add("Chuva do mês muito abaixo do normal para este mês (z < −1).");
        else if (chuvaZ < -0.5) n.Add("Chuva do mês abaixo do normal (z < −0,5).");
        else if (chuvaZ > 1) n.Add("Chuva do mês bem acima do normal (z > 1).");
        if (lag1Z < -1) n.Add("O mês anterior também foi muito seco — efeito acumulado provável.");
        if (vvZ < -1 || vhZ < -1) n.Add("Retrodifusão radar (Sentinel-1) abaixo do normal: superfície/solo mais seco.");
        if (semNdvi) n.Add("Sem NDVI neste mês (nuvens): a classe só pode vir da previsão do modelo.");
        else if (!coberturaOk) n.Add("NDVI com cobertura insuficiente (< 50% dos pixels): classe observada não fiável.");
        if (p is not null && classeObs is not null)
            n.Add(p.Classe == classeObs
                ? "A previsão do modelo coincide com a classe observada pelo NDVI."
                : $"A previsão ({p.Classe}) difere da classe observada pelo NDVI ({classeObs}) — rever com especialista.");
        if (p is not null && p.Confianca < 0.5)
            n.Add("Confiança baixa (< 50%): tratar a previsão como indicativa.");
        if (p?.Classe == "severo")
            n.Add("ALERTA: classe severa — validação humana obrigatória antes de qualquer acção.");
        if (n.Count == 0) n.Add("Indicadores dentro do padrão esperado para o mês.");
        return n;
    }

    // ---------------------------------------------------------------- treino

    /// <summary>
    /// Volta a treinar os modelos com o dataset actual (metodologia do ProjetoSeca, sem alterações).
    /// O modelo anterior fica arquivado em App_Data/arquivo/&lt;versão&gt;.
    /// </summary>
    public ResultadoTreino Retreinar()
    {
        if (!Monitor.TryEnter(_bloqueioTreino))
            throw new InvalidOperationException("Já existe um treino em curso.");
        try
        {
            TreinoEmCurso = true;
            var historico = _dados.Todas.Select(l => l.ParaObservacao()).ToList();
            var temporaria = Path.Combine(_pastaRuntime, "modelo_novo_" + DateTime.UtcNow.Ticks);
            var resultado = Treinador.Treinar(historico, temporaria);

            // Validar que o novo modelo carrega antes de o activar
            _ = new PrevisorStress(temporaria);

            if (Directory.Exists(_pastaModelo))
            {
                var arquivo = Path.Combine(_pastaRuntime, "arquivo", _previsor?.Versao ?? ("anterior_" + DateTime.UtcNow.Ticks));
                if (Directory.Exists(arquivo)) Directory.Delete(arquivo, recursive: true);
                Directory.CreateDirectory(Path.GetDirectoryName(arquivo)!);
                Directory.Move(_pastaModelo, arquivo);
            }
            Directory.Move(temporaria, _pastaModelo);

            _previsor = new PrevisorStress(_pastaModelo);
            Erro = null;
            _logger.LogInformation("Novo modelo activo: {Versao}", resultado.Versao);
            return resultado;
        }
        finally
        {
            TreinoEmCurso = false;
            Monitor.Exit(_bloqueioTreino);
        }
    }

    private static void CopiarPasta(string origem, string destino)
    {
        if (!Directory.Exists(origem))
            throw new DirectoryNotFoundException("Pasta do modelo não encontrada: " + origem);
        Directory.CreateDirectory(destino);
        foreach (var f in Directory.GetFiles(origem))
            File.Copy(f, Path.Combine(destino, Path.GetFileName(f)), overwrite: true);
    }
}

using System.Text.Json;
using Microsoft.ML;

namespace Vegetation.ML;

/// <summary>
/// Carrega o modelo guardado pelo Treinador e classifica o stress da vegetação.
/// Implementa o contrato IPrevisorStress usado pela API.
/// </summary>
public class PrevisorStress : IPrevisorStress
{
    private readonly MLContext _ml = new(seed: 1);
    private readonly ITransformer _modelo;
    private readonly TabelaNormais _normais;
    private readonly ResultadoTreino _meta;
    private readonly object _bloqueio = new();

    public PrevisorStress(string pastaModelo)
    {
        _meta = JsonSerializer.Deserialize<ResultadoTreino>(
            File.ReadAllText(Path.Combine(pastaModelo, "metricas.json")), Treinador.OpcoesJson)
            ?? throw new InvalidOperationException("metricas.json inválido.");
        _normais = JsonSerializer.Deserialize<TabelaNormais>(
            File.ReadAllText(Path.Combine(pastaModelo, "normais.json")), Treinador.OpcoesJson)
            ?? throw new InvalidOperationException("normais.json inválido.");

        string ficheiro = _meta.ModeloAtivo == "LightGBM" ? "modelo_lightgbm.zip" : "modelo_logistica.zip";
        _modelo = _ml.Model.Load(Path.Combine(pastaModelo, ficheiro), out _);
    }

    public string Versao => _meta.Versao;

    /// <summary>Metadados e métricas do treino (conteúdo de metricas.json).</summary>
    public ResultadoTreino Meta => _meta;

    /// <summary>Normais (média/desvio por distrito e mês) usadas para calcular as anomalias.</summary>
    public TabelaNormais Normais => _normais;

    public ResultadoPrevisao Prever(EntradaPrevisao e) => PreverVarios(new[] { e })[0];

    /// <summary>Classifica várias entradas numa única passagem pelo modelo (mais rápido para séries).</summary>
    public IReadOnlyList<ResultadoPrevisao> PreverVarios(IReadOnlyList<EntradaPrevisao> entradas)
    {
        if (entradas.Count == 0) return Array.Empty<ResultadoPrevisao>();

        var linhas = entradas.Select(e => ConstrutorFeatures.Construir(_normais, e.Distrito, e.Mes,
            e.ChuvaMm, e.ChuvaMmMesAnterior1, e.ChuvaMmMesAnterior2, e.ChuvaMmMesAnterior3, e.VV, e.VH)).ToList();

        List<(string Classe, float[] Scores)> saidas;
        lock (_bloqueio)
            saidas = Treinador.Prever(_ml, _modelo, linhas);

        var agora = DateTime.UtcNow;
        return saidas.Select(s =>
        {
            // Score segue a ordem de ConfiguracaoStress.OrdemScore: moderado, normal, severo
            double Prob(string classe) => s.Scores[Array.IndexOf(ConfiguracaoStress.OrdemScore, classe)];
            return new ResultadoPrevisao(
                s.Classe,
                Prob("normal"), Prob("moderado"), Prob("severo"),
                Prob(s.Classe),
                _meta.Versao, agora);
        }).ToList();
    }
}

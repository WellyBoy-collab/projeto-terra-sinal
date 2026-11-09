namespace Vegetation.ML;

/// <summary>
/// Parâmetros da metodologia. Foram fixados ANTES de ver os resultados do teste
/// e não devem ser ajustados para "melhorar" métricas.
/// </summary>
public static class ConfiguracaoStress
{
    /// <summary>z do NDVI abaixo deste valor = stress moderado.</summary>
    public const double LimiarModerado = -0.5;

    /// <summary>z do NDVI abaixo deste valor = stress severo.</summary>
    public const double LimiarSevero = -1.0;

    /// <summary>2018 fica de fora (poucas imagens Sentinel-2 e meses sem dados).</summary>
    public const int PrimeiroAno = 2019;

    /// <summary>Os últimos N anos do histórico ficam para teste (separação temporal).</summary>
    public const int AnosDeTeste = 2;

    /// <summary>Mínimo de pixels válidos de NDVI face ao máximo do distrito.</summary>
    public const double CoberturaMinima = 0.5;

    /// <summary>Modelo usado nas previsões (escolhido pelo F1-macro na validação por anos).</summary>
    public const string ModeloAtivo = "LightGBM";

    public static readonly string[] Classes = { "normal", "moderado", "severo" };

    /// <summary>Ordem das probabilidades no Score do ML.NET (chaves por ordem alfabética).</summary>
    public static readonly string[] OrdemScore = { "moderado", "normal", "severo" };
}

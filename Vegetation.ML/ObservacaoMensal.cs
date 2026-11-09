namespace Vegetation.ML;

/// <summary>
/// Uma linha do histórico: um distrito num mês. É o que a base de dados guarda
/// e o que o módulo de IA recebe para treinar.
/// </summary>
public record ObservacaoMensal(
    string Distrito,        // "Buzi" ou "Muanza"
    int Ano,
    int Mes,                // 1 a 12
    double? Ndvi,           // NDVI médio do mês; null quando não há dados válidos (nuvens)
    double PixelsValidos,   // pixels válidos do NDVI nesse mês (mede a fiabilidade)
    double ChuvaMm,         // chuva total do mês (CHIRPS)
    double VV,              // radar Sentinel-1, média do mês, em dB
    double VH);             // radar Sentinel-1, média do mês, em dB
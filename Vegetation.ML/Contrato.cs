namespace Vegetation.ML;

/// <summary>Dados mensais de um distrito para pedir uma classificação.</summary>
public record EntradaPrevisao(
    string Distrito,              // "Buzi" ou "Muanza" (como nos dados)
    int Ano,
    int Mes,                      // 1 a 12
    double ChuvaMm,               // chuva do mês (CHIRPS)
    double ChuvaMmMesAnterior1,   // chuva de 1 mês antes
    double ChuvaMmMesAnterior2,   // chuva de 2 meses antes
    double ChuvaMmMesAnterior3,   // chuva de 3 meses antes
    double VV,                    // radar Sentinel-1, em dB
    double VH);                   // radar Sentinel-1, em dB

/// <summary>Resultado de uma classificação de stress da vegetação.</summary>
public record ResultadoPrevisao(
    string Classe,                // "normal" | "moderado" | "severo"
    double ProbNormal,
    double ProbModerado,
    double ProbSevero,
    double Confianca,             // probabilidade da classe prevista
    string VersaoModelo,          // para guardar em cada previsão (exigido no enunciado)
    DateTime GeradoEmUtc);

public interface IPrevisorStress
{
    ResultadoPrevisao Prever(EntradaPrevisao entrada);
}
namespace Vegetation.ML;

/// <summary>Linha de entrada do modelo ML.NET (variáveis já convertidas em anomalias).</summary>
public class LinhaML
{
    public float DistritoMuanza { get; set; }
    public float MesSin { get; set; }
    public float MesCos { get; set; }
    public float ZChuva { get; set; }
    public float ZLag1 { get; set; }
    public float ZLag2 { get; set; }
    public float ZLag3 { get; set; }
    public float ZVV { get; set; }
    public float ZVH { get; set; }
    public string Label { get; set; } = "";
    public float Peso { get; set; } = 1f;
}

/// <summary>Saída do modelo ML.NET.</summary>
public class SaidaML
{
    public string PredictedLabel { get; set; } = "";
    public float[] Score { get; set; } = Array.Empty<float>();
}

public record MetricasClasse(string Classe, double Precisao, double Recall, double F1, int Suporte);

/// <summary>Matriz de confusão: linhas = real, colunas = previsto, na ordem de ConfiguracaoStress.Classes.</summary>
public record MetricasModelo(
    string Nome, double Exatidao, double F1Macro,
    List<MetricasClasse> PorClasse, int[][] Matriz);

public record ResultadoTreino(
    string Versao, DateTime TreinadoEmUtc, int UltimoAnoTreino,
    int LinhasTreino, int LinhasTeste, string ModeloAtivo,
    List<MetricasModelo> Metricas);

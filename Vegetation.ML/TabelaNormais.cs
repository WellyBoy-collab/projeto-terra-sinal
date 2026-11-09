namespace Vegetation.ML;

public record Estatistica(double Media, double Desvio);

/// <summary>
/// O "normal" de cada variável por distrito e mês (média e desvio-padrão),
/// calculado SÓ com os anos de treino. Serve para converter valores em anomalias (z-scores).
/// </summary>
public class TabelaNormais
{
    public int UltimoAnoTreino { get; set; }
    public Dictionary<string, Estatistica> Ndvi { get; set; } = new();
    public Dictionary<string, Estatistica> Chuva { get; set; } = new();
    public Dictionary<string, Estatistica> VV { get; set; } = new();
    public Dictionary<string, Estatistica> VH { get; set; } = new();

    public static string Chave(string distrito, int mes) => $"{distrito}|{mes}";

    public static Dictionary<string, Estatistica> Calcular(
        IEnumerable<ObservacaoMensal> observacoes, Func<ObservacaoMensal, double?> valor)
    {
        var resultado = new Dictionary<string, Estatistica>();
        foreach (var g in observacoes.GroupBy(o => Chave(o.Distrito, o.Mes)))
        {
            var v = g.Select(valor).Where(x => x.HasValue).Select(x => x!.Value).ToList();
            if (v.Count < 2) continue;
            double m = v.Average();
            double sd = Math.Sqrt(v.Sum(x => (x - m) * (x - m)) / (v.Count - 1));
            resultado[g.Key] = new Estatistica(m, Math.Max(sd, 1e-9));
        }
        return resultado;
    }

    public static double Z(Dictionary<string, Estatistica> tabela, string distrito, int mes, double x)
    {
        if (!tabela.TryGetValue(Chave(distrito, mes), out var e))
            throw new InvalidOperationException($"Sem valores normais para o distrito '{distrito}', mês {mes}.");
        return (x - e.Media) / e.Desvio;
    }
}

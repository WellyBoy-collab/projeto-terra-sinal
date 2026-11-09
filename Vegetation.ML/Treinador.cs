using System.Text.Json;
using Microsoft.ML;
using Microsoft.ML.Transforms;

namespace Vegetation.ML;

/// <summary>
/// Prepara os dados, cria as classes de stress, treina e avalia os dois modelos
/// e guarda tudo (modelos, normais e métricas) numa pasta.
/// </summary>
public static class Treinador
{
    public static readonly JsonSerializerOptions OpcoesJson = new()
    {
        WriteIndented = true,
        PropertyNameCaseInsensitive = true
    };

    public static ResultadoTreino Treinar(IReadOnlyList<ObservacaoMensal> historico, string pastaSaida)
    {
        if (historico.Count == 0) throw new ArgumentException("O histórico está vazio.");

        var duplicada = historico.GroupBy(o => (o.Distrito, o.Ano, o.Mes)).FirstOrDefault(g => g.Count() > 1);
        if (duplicada != null)
            throw new ArgumentException($"Observação duplicada: {duplicada.Key}.");

        var ml = new MLContext(seed: 1);
        int ultimoAno = historico.Max(o => o.Ano);
        int ultimoAnoTreino = ultimoAno - ConfiguracaoStress.AnosDeTeste;

        var porChave = historico.ToDictionary(o => (o.Distrito, o.Ano * 12 + o.Mes));
        var maxPixels = historico.GroupBy(o => o.Distrito)
            .ToDictionary(g => g.Key, g => g.Max(o => o.PixelsValidos));

        // Linhas com NDVI fiável (cobertura suficiente) e a partir de 2019
        var validas = historico.Where(o =>
                o.Ano >= ConfiguracaoStress.PrimeiroAno
                && o.Ndvi != null
                && o.PixelsValidos >= ConfiguracaoStress.CoberturaMinima * maxPixels[o.Distrito])
            .ToList();

        // O "normal" calcula-se SÓ com os anos de treino
        var baseTreino = historico
            .Where(o => o.Ano >= ConfiguracaoStress.PrimeiroAno && o.Ano <= ultimoAnoTreino).ToList();
        var normais = new TabelaNormais
        {
            UltimoAnoTreino = ultimoAnoTreino,
            Ndvi = TabelaNormais.Calcular(validas.Where(o => o.Ano <= ultimoAnoTreino), o => o.Ndvi),
            Chuva = TabelaNormais.Calcular(baseTreino, o => o.ChuvaMm),
            VV = TabelaNormais.Calcular(baseTreino, o => o.VV),
            VH = TabelaNormais.Calcular(baseTreino, o => o.VH)
        };

        var treino = new List<LinhaML>();
        var teste = new List<LinhaML>();

        foreach (var o in validas)
        {
            var o1 = porChave.GetValueOrDefault((o.Distrito, o.Ano * 12 + o.Mes - 1));
            var o2 = porChave.GetValueOrDefault((o.Distrito, o.Ano * 12 + o.Mes - 2));
            var o3 = porChave.GetValueOrDefault((o.Distrito, o.Ano * 12 + o.Mes - 3));
            if (o1 is null || o2 is null || o3 is null) continue;
            if (!normais.Ndvi.ContainsKey(TabelaNormais.Chave(o.Distrito, o.Mes))) continue;

            double z = TabelaNormais.Z(normais.Ndvi, o.Distrito, o.Mes, o.Ndvi!.Value);
            string classe = z < ConfiguracaoStress.LimiarSevero ? "severo"
                          : z < ConfiguracaoStress.LimiarModerado ? "moderado" : "normal";

            var linha = ConstrutorFeatures.Construir(normais, o.Distrito, o.Mes,
                o.ChuvaMm, o1.ChuvaMm, o2.ChuvaMm, o3.ChuvaMm, o.VV, o.VH);
            linha.Label = classe;

            (o.Ano <= ultimoAnoTreino ? treino : teste).Add(linha);
        }

        if (treino.Count == 0 || teste.Count == 0)
            throw new InvalidOperationException("Não há linhas suficientes para treino e teste.");

        // Pesos por classe (usados só pelo LightGBM)
        foreach (var x in treino)
            x.Peso = treino.Count / (ConfiguracaoStress.Classes.Length * (float)treino.Count(y => y.Label == x.Label));

        var prep = ml.Transforms.Conversion.MapValueToKey("Label",
                keyOrdinality: ValueToKeyMappingEstimator.KeyOrdinality.ByValue)
            .Append(ml.Transforms.Concatenate("Features",
                nameof(LinhaML.DistritoMuanza), nameof(LinhaML.MesSin), nameof(LinhaML.MesCos),
                nameof(LinhaML.ZChuva), nameof(LinhaML.ZLag1), nameof(LinhaML.ZLag2),
                nameof(LinhaML.ZLag3), nameof(LinhaML.ZVV), nameof(LinhaML.ZVH)));

        var pipeLog = prep
            .Append(ml.MulticlassClassification.Trainers.LbfgsMaximumEntropy())
            .Append(ml.Transforms.Conversion.MapKeyToValue("PredictedLabel"));

        var pipeLgb = prep
            .Append(ml.MulticlassClassification.Trainers.LightGbm(
                exampleWeightColumnName: "Peso",
                numberOfLeaves: 4, minimumExampleCountPerLeaf: 5,
                learningRate: 0.1, numberOfIterations: 100))
            .Append(ml.Transforms.Conversion.MapKeyToValue("PredictedLabel"));

        var dvTreino = ml.Data.LoadFromEnumerable(treino);
        var modeloLog = pipeLog.Fit(dvTreino);
        var modeloLgb = pipeLgb.Fit(dvTreino);

        // Avaliação no teste
        var reais = teste.Select(x => x.Label).ToList();
        var prevLog = Prever(ml, modeloLog, teste);
        var prevLgb = Prever(ml, modeloLgb, teste);
        VerificarOrdem("Regressão logística", prevLog);
        VerificarOrdem("LightGBM", prevLgb);

        var metricas = new List<MetricasModelo>
        {
            Avaliar("Referência (sempre normal)", reais, reais.Select(_ => "normal").ToList()),
            Avaliar("Regressão logística", reais, prevLog.Select(p => p.Classe).ToList()),
            Avaliar("LightGBM com pesos", reais, prevLgb.Select(p => p.Classe).ToList())
        };

        // Guardar tudo
        Directory.CreateDirectory(pastaSaida);
        ml.Model.Save(modeloLog, dvTreino.Schema, Path.Combine(pastaSaida, "modelo_logistica.zip"));
        ml.Model.Save(modeloLgb, dvTreino.Schema, Path.Combine(pastaSaida, "modelo_lightgbm.zip"));

        var agora = DateTime.UtcNow;
        var resultado = new ResultadoTreino(
            "v" + agora.ToString("yyyyMMdd-HHmmss"), agora, ultimoAnoTreino,
            treino.Count, teste.Count, ConfiguracaoStress.ModeloAtivo, metricas);

        File.WriteAllText(Path.Combine(pastaSaida, "normais.json"),
            JsonSerializer.Serialize(normais, OpcoesJson));
        File.WriteAllText(Path.Combine(pastaSaida, "metricas.json"),
            JsonSerializer.Serialize(resultado, OpcoesJson));

        return resultado;
    }

    public static List<(string Classe, float[] Scores)> Prever(
        MLContext ml, ITransformer modelo, IEnumerable<LinhaML> linhas)
    {
        var dv = modelo.Transform(ml.Data.LoadFromEnumerable(linhas));
        return ml.Data.CreateEnumerable<SaidaML>(dv, reuseRowObject: false)
            .Select(s => (s.PredictedLabel, s.Score)).ToList();
    }

    // Garante que a ordem das probabilidades (Score) corresponde às classes esperadas
    private static void VerificarOrdem(string nome, List<(string Classe, float[] Scores)> previsoes)
    {
        int erros = previsoes.Count(p =>
            p.Scores.Length != 3
            || ConfiguracaoStress.OrdemScore[Array.IndexOf(p.Scores, p.Scores.Max())] != p.Classe);
        if (erros > 0)
            throw new InvalidOperationException(
                $"{nome}: a ordem das probabilidades (Score) não corresponde às classes em {erros} casos.");
    }

    private static MetricasModelo Avaliar(string nome, List<string> reais, List<string> previstos)
    {
        var classes = ConfiguracaoStress.Classes;
        int n = classes.Length;
        var m = new int[n][];
        for (int i = 0; i < n; i++) m[i] = new int[n];
        for (int i = 0; i < reais.Count; i++)
            m[Array.IndexOf(classes, reais[i])][Array.IndexOf(classes, previstos[i])]++;

        var porClasse = new List<MetricasClasse>();
        double somaF1 = 0;
        for (int c = 0; c < n; c++)
        {
            int tp = m[c][c];
            int fp = Enumerable.Range(0, n).Sum(i => m[i][c]) - tp;
            int fn = Enumerable.Range(0, n).Sum(j => m[c][j]) - tp;
            double prec = tp + fp == 0 ? 0 : tp / (double)(tp + fp);
            double rec = tp + fn == 0 ? 0 : tp / (double)(tp + fn);
            double f1 = tp == 0 ? 0 : 2.0 * tp / (2 * tp + fp + fn);
            somaF1 += f1;
            porClasse.Add(new MetricasClasse(classes[c], prec, rec, f1, tp + fn));
        }

        double exatidao = Enumerable.Range(0, n).Sum(i => m[i][i]) / (double)reais.Count;
        return new MetricasModelo(nome, exatidao, somaF1 / n, porClasse, m);
    }
}

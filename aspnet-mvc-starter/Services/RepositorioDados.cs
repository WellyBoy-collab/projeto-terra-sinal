using System.Globalization;
using System.Text;
using Microsoft.Extensions.Options;
using Vegetation.ML;

namespace TerraSinal.Web.Services;

/// <summary>Configuração das pastas do modelo e dos dados (secção "StressModel" do appsettings).</summary>
public class OpcoesModelo
{
    /// <summary>Pasta (relativa ao content root) com o modelo e os dados originais, entregues com a aplicação.</summary>
    public string SeedFolder { get; set; } = "ModeloIA";

    /// <summary>Pasta (relativa ao content root) onde ficam o modelo activo, o dataset e as versões arquivadas.</summary>
    public string RuntimeFolder { get; set; } = "App_Data";
}

/// <summary>Uma linha de dados_unidos.csv: um distrito num mês, com todas as colunas do Earth Engine.</summary>
public record LinhaDados(
    string Distrito, int Ano, int Mes,
    double? Ndvi, double PixelsValidos, int NImagensS2,
    double ChuvaMm, double VV, double VH, int NImagensS1)
{
    public int Indice => Ano * 12 + Mes - 1;
    public string Periodo => $"{Ano:D4}-{Mes:D2}";

    public ObservacaoMensal ParaObservacao() =>
        new(Distrito, Ano, Mes, Ndvi, PixelsValidos, ChuvaMm, VV, VH);
}

public record ResultadoImportacao(
    bool Simulacao, int LinhasLidas, int Novas, int Actualizadas,
    int TotalDepois, List<string> Erros, List<string> Avisos);

/// <summary>
/// Fonte única das observações mensais (Búzi/Muanza, 2018 em diante).
/// Lê e grava o CSV no formato de dados_unidos.csv do ProjetoSeca.
/// </summary>
public class RepositorioDados
{
    public const string Cabecalho =
        "distrito,ano,mes,ndvi_medio,pixels_validos,n_imagens_s2,chuva_mm,vv_medio,vh_medio,n_imagens_s1";

    public static readonly string[] Distritos = { "Buzi", "Muanza" };

    private static readonly CultureInfo Inv = CultureInfo.InvariantCulture;
    private readonly string _ficheiro;
    private readonly ILogger<RepositorioDados> _logger;
    private readonly object _bloqueio = new();
    private IReadOnlyList<LinhaDados> _linhas = Array.Empty<LinhaDados>();
    private Dictionary<(string, int), LinhaDados> _porChave = new();

    public RepositorioDados(IOptions<OpcoesModelo> opcoes, IWebHostEnvironment env, ILogger<RepositorioDados> logger)
    {
        _logger = logger;
        var o = opcoes.Value;
        var pastaDados = Path.Combine(env.ContentRootPath, o.RuntimeFolder, "dados");
        Directory.CreateDirectory(pastaDados);
        _ficheiro = Path.Combine(pastaDados, "dados_unidos.csv");

        if (!File.Exists(_ficheiro))
        {
            var semente = Path.Combine(env.ContentRootPath, o.SeedFolder, "dados", "dados_unidos.csv");
            if (!File.Exists(semente))
                throw new FileNotFoundException("Dataset original não encontrado.", semente);
            File.Copy(semente, _ficheiro);
            _logger.LogInformation("Dataset inicial copiado de {Origem}", semente);
        }

        using var leitor = new StreamReader(_ficheiro, Encoding.UTF8);
        var linhas = LerCsv(leitor, out var erros, out _);
        if (erros.Count > 0)
            throw new InvalidDataException($"O ficheiro {_ficheiro} tem erros: {string.Join(" | ", erros.Take(5))}");
        Definir(linhas);
        _logger.LogInformation("Observações carregadas: {N} linhas ({Inicio} a {Fim})",
            _linhas.Count, _linhas.FirstOrDefault()?.Periodo, _linhas.LastOrDefault()?.Periodo);
    }

    /// <summary>Muda sempre que o dataset é alterado (serve para invalidar caches).</summary>
    public int Versao { get; private set; }

    public string CaminhoFicheiro => _ficheiro;

    public IReadOnlyList<LinhaDados> Todas => _linhas;

    public LinhaDados? Obter(string distrito, int ano, int mes) =>
        _porChave.GetValueOrDefault((distrito, ano * 12 + mes - 1));

    public LinhaDados? ObterPorIndice(string distrito, int indice) =>
        _porChave.GetValueOrDefault((distrito, indice));

    public IReadOnlyList<LinhaDados> DoDistrito(string distrito) =>
        _linhas.Where(l => l.Distrito == distrito).ToList();

    /// <summary>Máximo de pixels válidos de NDVI por distrito (para medir a cobertura de cada mês).</summary>
    public double MaxPixels(string distrito) =>
        _linhas.Where(l => l.Distrito == distrito).Select(l => l.PixelsValidos).DefaultIfEmpty(0).Max();

    private void Definir(List<LinhaDados> linhas)
    {
        var ordenadas = linhas.OrderBy(l => l.Distrito).ThenBy(l => l.Indice).ToList();
        _porChave = ordenadas.ToDictionary(l => (l.Distrito, l.Indice));
        _linhas = ordenadas;
        Versao++;
    }

    /// <summary>Normaliza o nome do distrito ("Búzi", "buzi" → "Buzi"). Devolve null se desconhecido.</summary>
    public static string? NormalizarDistrito(string? valor)
    {
        if (string.IsNullOrWhiteSpace(valor)) return null;
        var semAcentos = new string(valor.Trim().Normalize(NormalizationForm.FormD)
            .Where(c => CharUnicodeInfo.GetUnicodeCategory(c) != UnicodeCategory.NonSpacingMark).ToArray());
        return Distritos.FirstOrDefault(d => string.Equals(d, semAcentos, StringComparison.OrdinalIgnoreCase));
    }

    /// <summary>Converte "2025-10" em (2025, 10).</summary>
    public static bool TentarPeriodo(string? periodo, out int ano, out int mes)
    {
        ano = mes = 0;
        if (string.IsNullOrWhiteSpace(periodo)) return false;
        var p = periodo.Trim().Split('-');
        return p.Length >= 2
            && int.TryParse(p[0], NumberStyles.Integer, Inv, out ano)
            && int.TryParse(p[1], NumberStyles.Integer, Inv, out mes)
            && ano is >= 1990 and <= 2100 && mes is >= 1 and <= 12;
    }

    /// <summary>
    /// Lê um CSV no formato de dados_unidos.csv. Aceita anos/meses escritos como "2018.0".
    /// </summary>
    public static List<LinhaDados> LerCsv(TextReader leitor, out List<string> erros, out List<string> avisos)
    {
        erros = new List<string>();
        avisos = new List<string>();
        return LerCsvInterno(leitor, erros, avisos);
    }

    private static List<LinhaDados> LerCsvInterno(TextReader leitor, List<string> erros, List<string> avisos)
    {
        var resultado = new List<LinhaDados>();

        var cabecalho = leitor.ReadLine()?.Trim().TrimStart('﻿');
        if (cabecalho is null)
        {
            erros.Add("Ficheiro vazio.");
            return resultado;
        }

        var colunas = cabecalho.Split(',').Select(c => c.Trim().ToLowerInvariant()).ToArray();
        var esperadas = Cabecalho.Split(',');
        var emFalta = esperadas.Where(c => !colunas.Contains(c)).ToList();
        if (emFalta.Count > 0)
        {
            erros.Add($"Colunas em falta: {string.Join(", ", emFalta)}. Cabeçalho esperado: {Cabecalho}");
            return resultado;
        }
        int Col(string nome) => Array.IndexOf(colunas, nome);
        int cD = Col("distrito"), cA = Col("ano"), cM = Col("mes"), cN = Col("ndvi_medio"),
            cP = Col("pixels_validos"), cS2 = Col("n_imagens_s2"), cC = Col("chuva_mm"),
            cVV = Col("vv_medio"), cVH = Col("vh_medio"), cS1 = Col("n_imagens_s1");

        var chaves = new HashSet<(string, int, int)>();
        string? linha;
        int numero = 1;
        while ((linha = leitor.ReadLine()) is not null)
        {
            numero++;
            if (string.IsNullOrWhiteSpace(linha)) continue;
            var p = linha.Split(',');
            if (p.Length < colunas.Length)
            {
                erros.Add($"Linha {numero}: esperadas {colunas.Length} colunas, encontradas {p.Length}.");
                continue;
            }

            string? Texto(int i) => string.IsNullOrWhiteSpace(p[i]) ? null : p[i].Trim();
            double? Num(int i, string nome, bool obrigatorio)
            {
                var t = Texto(i);
                if (t is null)
                {
                    if (obrigatorio) erros.Add($"Linha {numero}: '{nome}' é obrigatório.");
                    return null;
                }
                if (double.TryParse(t, NumberStyles.Float, Inv, out var v) && double.IsFinite(v)) return v;
                erros.Add($"Linha {numero}: '{nome}' não é um número válido ('{t}').");
                return null;
            }

            int antes = erros.Count;
            var distrito = NormalizarDistrito(Texto(cD));
            if (distrito is null) erros.Add($"Linha {numero}: distrito '{Texto(cD)}' desconhecido (use Buzi ou Muanza).");
            var ano = Num(cA, "ano", true);
            var mes = Num(cM, "mes", true);
            var ndvi = Num(cN, "ndvi_medio", false);
            var pixels = Num(cP, "pixels_validos", false) ?? 0;
            var s2 = Num(cS2, "n_imagens_s2", false) ?? 0;
            var chuva = Num(cC, "chuva_mm", true);
            var vv = Num(cVV, "vv_medio", true);
            var vh = Num(cVH, "vh_medio", true);
            var s1 = Num(cS1, "n_imagens_s1", false) ?? 0;
            if (erros.Count > antes) continue;

            int a = (int)Math.Round(ano!.Value), m = (int)Math.Round(mes!.Value);
            if (a is < 1990 or > 2100) { erros.Add($"Linha {numero}: ano {a} fora do intervalo."); continue; }
            if (m is < 1 or > 12) { erros.Add($"Linha {numero}: mês {m} inválido."); continue; }
            if (ndvi is < -1 or > 1) { erros.Add($"Linha {numero}: NDVI {ndvi} fora de [-1, 1]."); continue; }
            if (chuva < 0 || chuva > 3000) { erros.Add($"Linha {numero}: chuva {chuva} mm fora do intervalo [0, 3000]."); continue; }
            if (vv is < -40 or > 10 || vh is < -45 or > 10)
            {
                erros.Add($"Linha {numero}: valores de radar VV/VH fora do intervalo esperado (dB).");
                continue;
            }
            if (pixels < 0) { erros.Add($"Linha {numero}: pixels_validos negativo."); continue; }
            if (!chaves.Add((distrito!, a, m))) { erros.Add($"Linha {numero}: {distrito} {a}-{m:D2} repetido no ficheiro."); continue; }
            if (ndvi is null) avisos.Add($"Linha {numero}: {distrito} {a}-{m:D2} sem NDVI (aceite; a previsão usa chuva e radar).");

            resultado.Add(new LinhaDados(distrito!, a, m, ndvi, pixels, (int)s2, chuva!.Value, vv!.Value, vh!.Value, (int)s1));
        }
        return resultado;
    }

    /// <summary>Junta as linhas importadas ao dataset (substitui as que já existem). Grava com cópia de segurança.</summary>
    public ResultadoImportacao Importar(IReadOnlyList<LinhaDados> novas, List<string> avisos, bool simular)
    {
        lock (_bloqueio)
        {
            var mapa = _linhas.ToDictionary(l => (l.Distrito, l.Indice));
            int criadas = 0, actualizadas = 0;
            foreach (var l in novas)
            {
                if (mapa.ContainsKey((l.Distrito, l.Indice))) actualizadas++; else criadas++;
                mapa[(l.Distrito, l.Indice)] = l;
            }

            // Avisar sobre buracos na série (a previsão precisa dos 3 meses anteriores)
            foreach (var d in Distritos)
            {
                var indices = mapa.Keys.Where(k => k.Item1 == d).Select(k => k.Item2).OrderBy(i => i).ToList();
                for (int i = 1; i < indices.Count; i++)
                    if (indices[i] - indices[i - 1] > 1)
                        avisos.Add($"{d}: faltam meses entre {Periodo(indices[i - 1])} e {Periodo(indices[i])}.");
            }

            if (!simular && novas.Count > 0)
            {
                var todas = mapa.Values.ToList();
                var temporario = _ficheiro + ".tmp";
                File.WriteAllText(temporario, Serializar(todas), new UTF8Encoding(false));
                var copia = _ficheiro + "." + DateTime.UtcNow.ToString("yyyyMMddHHmmss", Inv) + ".bak";
                File.Copy(_ficheiro, copia, overwrite: true);
                File.Move(temporario, _ficheiro, overwrite: true);
                Definir(todas);
                _logger.LogInformation("Importação: {Novas} novas, {Act} actualizadas. Cópia de segurança: {Copia}",
                    criadas, actualizadas, copia);
            }

            return new ResultadoImportacao(simular, novas.Count, criadas, actualizadas,
                simular ? mapa.Count : _linhas.Count, new List<string>(), avisos);
        }
    }

    private static string Periodo(int indice) => $"{indice / 12:D4}-{indice % 12 + 1:D2}";

    public string ExportarCsv() => Serializar(_linhas);

    private static string Serializar(IEnumerable<LinhaDados> linhas)
    {
        var sb = new StringBuilder();
        sb.AppendLine(Cabecalho);
        foreach (var l in linhas.OrderBy(l => l.Indice).ThenBy(l => l.Distrito))
        {
            sb.Append(l.Distrito).Append(',')
              .Append(l.Ano.ToString(Inv)).Append(',')
              .Append(l.Mes.ToString(Inv)).Append(',')
              .Append(l.Ndvi?.ToString("R", Inv) ?? "").Append(',')
              .Append(l.PixelsValidos.ToString("R", Inv)).Append(',')
              .Append(l.NImagensS2.ToString(Inv)).Append(',')
              .Append(l.ChuvaMm.ToString("R", Inv)).Append(',')
              .Append(l.VV.ToString("R", Inv)).Append(',')
              .Append(l.VH.ToString("R", Inv)).Append(',')
              .Append(l.NImagensS1.ToString(Inv)).AppendLine();
        }
        return sb.ToString();
    }
}

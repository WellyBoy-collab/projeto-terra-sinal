using System.Globalization;
using System.Text;
using System.Text.Json;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using TerraSinal.Web.Data;
using TerraSinal.Web.Models;
using TerraSinal.Web.Services;
using Vegetation.ML;

namespace TerraSinal.Web.Controllers;

/// <summary>
/// Web API do observatório. Dados reais (Earth Engine: Sentinel-2, CHIRPS, Sentinel-1)
/// e previsões do modelo treinado em ML.NET (LightGBM) do ProjetoSeca.
/// </summary>
[ApiController]
[Route("api")]
[Authorize(Roles = "Administrador,Investigador")]
[Produces("application/json")]
public class ObservatorioApiController : ControllerBase
{
    private readonly RepositorioDados _dados;
    private readonly ServicoModeloStress _modelo;
    private readonly AppDbContext _db;
    private readonly ILogger<ObservatorioApiController> _logger;

    public ObservatorioApiController(RepositorioDados dados, ServicoModeloStress modelo,
        AppDbContext db, ILogger<ObservatorioApiController> logger)
    {
        _dados = dados;
        _modelo = modelo;
        _db = db;
        _logger = logger;
    }

    // ------------------------------------------------------------ dados

    [HttpGet("regions")]
    public IActionResult Regions() => Ok(RepositorioDados.Distritos);

    /// <summary>Períodos disponíveis (AAAA-MM), do mais recente para o mais antigo.</summary>
    [HttpGet("periods")]
    public IActionResult Periods([FromQuery] string? region)
    {
        var d = RepositorioDados.NormalizarDistrito(region);
        var periodos = _dados.Todas
            .Where(l => d is null || l.Distrito == d)
            .Select(l => l.Periodo).Distinct().OrderByDescending(p => p).ToList();
        return Ok(periodos);
    }

    /// <summary>Com period: uma observação (com previsão). Sem period: a série completa do distrito.</summary>
    [HttpGet("observations")]
    public IActionResult Observations([FromQuery] string? region, [FromQuery] string? period)
    {
        var d = RepositorioDados.NormalizarDistrito(region);
        if (region is not null && d is null)
            return Problema(400, "Região desconhecida. Use Buzi ou Muanza.");

        if (string.IsNullOrWhiteSpace(period))
        {
            var distritos = d is null ? RepositorioDados.Distritos : new[] { d };
            return Ok(distritos.SelectMany(x => _modelo.Serie(x)).ToList());
        }

        if (d is null) return Problema(400, "Indique a região quando indicar o período.");
        if (!RepositorioDados.TentarPeriodo(period, out var ano, out var mes))
            return Problema(400, "Período inválido. Use o formato AAAA-MM.");

        var obs = _modelo.Observacao(d, ano, mes);
        return obs is null ? Problema(404, $"Não há observação para {d} em {period}.") : Ok(obs);
    }

    /// <summary>Um marcador por distrito, com a classe prevista no período indicado.</summary>
    [HttpGet("observations/sites")]
    public IActionResult Sites([FromQuery] string? period)
    {
        var centroides = new Dictionary<string, (double Lat, double Lng)>
        {
            ["Buzi"] = (-19.95, 34.45),
            ["Muanza"] = (-18.95, 34.90)
        };
        var sites = RepositorioDados.Distritos.Select(d =>
        {
            var serie = _modelo.Serie(d);
            ObservacaoDto? obs = RepositorioDados.TentarPeriodo(period, out var a, out var m)
                ? serie.FirstOrDefault(o => o.Year == a && o.Month == m)
                : serie.LastOrDefault();
            return new
            {
                id = d,
                region = d,
                label = d == "Buzi" ? "Distrito de Búzi" : "Distrito de Muanza",
                lat = centroides[d].Lat,
                lng = centroides[d].Lng,
                period = obs?.Period,
                stressClass = obs?.Previsao?.Classe,
                confidence = obs?.Previsao?.Confianca,
                observedClass = obs?.ClasseObservada,
                ndvi = obs?.Ndvi,
                ndviZ = obs?.NdviZ,
                chuvaMm = obs?.ChuvaMm,
                chuvaZ = obs?.ChuvaZ,
                vvZ = obs?.VvZ
            };
        });
        return Ok(sites);
    }

    /// <summary>Descarrega o dataset actual (formato dados_unidos.csv).</summary>
    [HttpGet("datasets/current")]
    [Produces("text/csv")]
    public IActionResult DatasetActual() =>
        File(Encoding.UTF8.GetBytes(_dados.ExportarCsv()), "text/csv", "dados_unidos.csv");

    /// <summary>Importa um CSV no formato de dados_unidos.csv (só Administrador). dryRun=true só valida.</summary>
    [HttpPost("datasets/import")]
    [Authorize(Roles = "Administrador")]
    [ValidateAntiForgeryToken]
    [RequestSizeLimit(5 * 1024 * 1024)]
    [Consumes("multipart/form-data")]
    public async Task<IActionResult> Importar(IFormFile? file, [FromForm] bool dryRun = false)
    {
        if (file is null || file.Length == 0) return Problema(400, "Envie um ficheiro CSV no campo 'file'.");
        if (!file.FileName.EndsWith(".csv", StringComparison.OrdinalIgnoreCase))
            return Problema(400, "Só são aceites ficheiros .csv.");

        using var leitor = new StreamReader(file.OpenReadStream(), Encoding.UTF8);
        var texto = await leitor.ReadToEndAsync();
        var linhas = RepositorioDados.LerCsv(new StringReader(texto), out var erros, out var avisos);

        if (erros.Count > 0)
            return BadRequest(new ResultadoImportacao(true, linhas.Count + erros.Count, 0, 0,
                _dados.Todas.Count, erros.Take(50).ToList(), avisos.Take(50).ToList()));
        if (linhas.Count == 0) return Problema(400, "O ficheiro não tem linhas de dados.");

        var resultado = _dados.Importar(linhas, avisos, dryRun);
        _logger.LogInformation("Importação por {User}: {Lidas} linhas (simulação={Sim})",
            User.Identity?.Name, linhas.Count, dryRun);
        return Ok(resultado with { Avisos = resultado.Avisos.Take(50).ToList() });
    }

    // ------------------------------------------------------------ modelo

    [HttpGet("models/status")]
    public IActionResult ModelStatus() => Ok(new
    {
        available = _modelo.Disponivel,
        version = _modelo.Versao,
        activeModel = _modelo.Meta?.ModeloAtivo,
        error = _modelo.Erro,
        training = _modelo.TreinoEmCurso,
        dataRows = _dados.Todas.Count,
        firstPeriod = _dados.Todas.MinBy(l => l.Indice)?.Periodo,
        lastPeriod = _dados.Todas.MaxBy(l => l.Indice)?.Periodo
    });

    /// <summary>Métricas de teste (separação temporal) dos três modelos avaliados no treino.</summary>
    [HttpGet("models/metrics")]
    public IActionResult Metrics()
    {
        var meta = _modelo.Meta;
        if (meta is null) return Problema(503, "Modelo indisponível: " + _modelo.Erro);
        return Ok(new
        {
            version = meta.Versao,
            trainedAtUtc = meta.TreinadoEmUtc,
            activeModel = meta.ModeloAtivo,
            lastTrainingYear = meta.UltimoAnoTreino,
            trainRows = meta.LinhasTreino,
            testRows = meta.LinhasTeste,
            classes = ConfiguracaoStress.Classes,
            thresholds = new { moderado = ConfiguracaoStress.LimiarModerado, severo = ConfiguracaoStress.LimiarSevero },
            features = new[] { "DistritoMuanza", "MesSin", "MesCos", "ZChuva", "ZLag1", "ZLag2", "ZLag3", "ZVV", "ZVH" },
            models = meta.Metricas.Select(m => new
            {
                name = m.Nome,
                isActive = m.Nome.StartsWith(meta.ModeloAtivo, StringComparison.OrdinalIgnoreCase),
                accuracy = m.Exatidao,
                f1Macro = m.F1Macro,
                precisionMacro = m.PorClasse.Average(c => c.Precisao),
                recallMacro = m.PorClasse.Average(c => c.Recall),
                perClass = m.PorClasse,
                confusionMatrix = m.Matriz
            })
        });
    }

    /// <summary>Volta a treinar com o dataset actual (só Administrador). Pode demorar alguns segundos.</summary>
    [HttpPost("models/train")]
    [Authorize(Roles = "Administrador")]
    [ValidateAntiForgeryToken]
    public async Task<IActionResult> Train()
    {
        try
        {
            var r = await Task.Run(() => _modelo.Retreinar());
            _logger.LogInformation("Modelo retreinado por {User}: {Versao}", User.Identity?.Name, r.Versao);
            return Ok(new { version = r.Versao, r.LinhasTreino, r.LinhasTeste, r.UltimoAnoTreino, r.ModeloAtivo });
        }
        catch (InvalidOperationException ex)
        {
            return Problema(409, ex.Message);
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Falha no treino");
            return Problema(500, "O treino falhou: " + ex.Message);
        }
    }

    // ------------------------------------------------------------ previsões

    /// <summary>
    /// Classifica o stress. Duas formas:
    /// 1) { region, period }  → usa os dados do dataset (chuva do mês e dos 3 anteriores + radar);
    /// 2) { region, period, chuvaMm, chuvaLag1, chuvaLag2, chuvaLag3, vv, vh } → valores introduzidos (ex.: mês novo).
    /// Com save=true fica registada no histórico.
    /// </summary>
    [HttpPost("predictions")]
    [ValidateAntiForgeryToken]
    public async Task<IActionResult> Predict([FromBody] PedidoPrevisao pedido, CancellationToken ct)
    {
        if (!_modelo.Disponivel) return Problema(503, "Modelo indisponível: " + _modelo.Erro);
        var d = RepositorioDados.NormalizarDistrito(pedido.Region);
        if (d is null) return Problema(400, "Região desconhecida. Use Buzi ou Muanza.");
        if (!RepositorioDados.TentarPeriodo(pedido.Period, out var ano, out var mes))
            return Problema(400, "Período inválido. Use o formato AAAA-MM.");

        EntradaPrevisao entrada;
        string origem;
        ObservacaoDto? obs = null;
        if (pedido.TemValoresManuais)
        {
            if (pedido.ChuvaMm < 0 || pedido.ChuvaLag1 < 0 || pedido.ChuvaLag2 < 0 || pedido.ChuvaLag3 < 0)
                return Problema(400, "A chuva não pode ser negativa.");
            if (pedido.Vv is < -40 or > 10 || pedido.Vh is < -45 or > 10)
                return Problema(400, "Valores VV/VH fora do intervalo esperado (dB, ex.: VV ≈ −10, VH ≈ −16).");
            entrada = new EntradaPrevisao(d, ano, mes, pedido.ChuvaMm!.Value, pedido.ChuvaLag1!.Value,
                pedido.ChuvaLag2!.Value, pedido.ChuvaLag3!.Value, pedido.Vv!.Value, pedido.Vh!.Value);
            origem = "manual";
        }
        else
        {
            var linha = _dados.Obter(d, ano, mes);
            if (linha is null)
                return Problema(404, $"Não há dados para {d} em {pedido.Period}. Introduza chuva, lags e VV/VH manualmente.");
            var e = _modelo.EntradaDoHistorico(linha, out var motivo);
            if (e is null) return Problema(422, motivo!);
            entrada = e;
            origem = "historico";
            obs = _modelo.Observacao(d, ano, mes);
        }

        ResultadoPrevisao p;
        try { p = _modelo.Prever(entrada); }
        catch (Exception ex) when (ex is ArgumentException or InvalidOperationException)
        {
            return Problema(422, ex.Message);
        }

        var regra = ServicoModeloStress.Regras[p.Classe];
        var notas = obs?.Notas ?? ServicoModeloStress.Notas(null, null, null, null, false, true, null, p);
        int? registoId = null;
        string? avisoRegisto = null;

        if (pedido.Save)
        {
            try
            {
                var registo = NovoRegisto(d, ano, mes, p, obs?.ClasseObservada, origem, "Previsão", null, entrada);
                _db.RegistosPrevisao.Add(registo);
                await _db.SaveChangesAsync(ct);
                registoId = registo.Id;
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "Não foi possível gravar a previsão no histórico");
                avisoRegisto = "A previsão foi calculada mas não ficou no histórico (base de dados indisponível).";
            }
        }

        return Ok(new
        {
            region = d,
            period = $"{ano:D4}-{mes:D2}",
            origin = origem,
            input = entrada,
            prediction = p,
            observedClass = obs?.ClasseObservada,
            recommendation = regra,
            notes = notas,
            savedId = registoId,
            saveWarning = avisoRegisto
        });
    }

    [HttpGet("predictions/history")]
    public async Task<IActionResult> History([FromQuery] string? region, [FromQuery] int take = 200, CancellationToken ct = default)
    {
        take = Math.Clamp(take, 1, 1000);
        var d = RepositorioDados.NormalizarDistrito(region);
        try
        {
            var q = _db.RegistosPrevisao.AsNoTracking();
            if (d is not null) q = q.Where(r => r.Distrito == d);
            var rows = await q.OrderByDescending(r => r.CriadoEmUtc).Take(take).ToListAsync(ct);
            return Ok(rows.Select(r => new
            {
                r.Id,
                recordedAt = r.CriadoEmUtc,
                period = $"{r.Ano:D4}-{r.Mes:D2}",
                region = r.Distrito,
                stressClass = r.ClassePrevista,
                observedClass = r.ClasseObservada,
                confidence = r.Confianca,
                ruleId = r.RegraId,
                modelVersion = r.VersaoModelo,
                status = r.Estado,
                origin = r.Origem,
                note = r.Nota,
                user = r.Utilizador
            }));
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Histórico indisponível");
            return Problema(503, "Histórico indisponível: não foi possível ligar à base de dados MySQL.");
        }
    }

    // ------------------------------------------------------------ recomendações

    [HttpGet("recommendations")]
    public IActionResult Recommendations() => Ok(ServicoModeloStress.Regras.Values);

    /// <summary>Regista a análise humana da recomendação do período (com nota opcional).</summary>
    [HttpPost("recommendations/review")]
    [ValidateAntiForgeryToken]
    public async Task<IActionResult> Review([FromBody] PedidoRevisao pedido, CancellationToken ct)
    {
        var d = RepositorioDados.NormalizarDistrito(pedido.Region);
        if (d is null || !RepositorioDados.TentarPeriodo(pedido.Period, out var ano, out var mes))
            return Problema(400, "Indique região (Buzi/Muanza) e período (AAAA-MM).");
        if (pedido.Note?.Length > 1000) return Problema(400, "A nota tem no máximo 1000 caracteres.");

        var obs = _modelo.Observacao(d, ano, mes);
        if (obs?.Previsao is null)
            return Problema(422, obs?.PrevisaoErro ?? $"Não há previsão para {d} em {pedido.Period}.");

        var linha = _dados.Obter(d, ano, mes)!;
        var entrada = _modelo.EntradaDoHistorico(linha, out _);
        try
        {
            var registo = NovoRegisto(d, ano, mes, obs.Previsao, obs.ClasseObservada, "historico",
                "Revisto", string.IsNullOrWhiteSpace(pedido.Note) ? null : pedido.Note.Trim(), entrada);
            _db.RegistosPrevisao.Add(registo);
            await _db.SaveChangesAsync(ct);
            return Ok(new { id = registo.Id, message = "Análise registada no histórico." });
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Falha ao registar revisão");
            return Problema(503, "Não foi possível gravar: base de dados MySQL indisponível.");
        }
    }

    // ------------------------------------------------------------ auxiliares

    private RegistoPrevisao NovoRegisto(string d, int ano, int mes, ResultadoPrevisao p, string? classeObs,
        string origem, string estado, string? nota, EntradaPrevisao? entrada) => new()
    {
        Distrito = d,
        Ano = ano,
        Mes = mes,
        ClassePrevista = p.Classe,
        ClasseObservada = classeObs,
        ProbNormal = p.ProbNormal,
        ProbModerado = p.ProbModerado,
        ProbSevero = p.ProbSevero,
        Confianca = p.Confianca,
        VersaoModelo = p.VersaoModelo,
        RegraId = ServicoModeloStress.Regras[p.Classe].Id,
        Origem = origem,
        Estado = estado,
        Nota = nota,
        EntradasJson = entrada is null ? null : JsonSerializer.Serialize(entrada),
        Utilizador = User.Identity?.Name ?? "desconhecido",
        CriadoEmUtc = DateTime.UtcNow
    };

    private ObjectResult Problema(int status, string detalhe) =>
        Problem(detail: detalhe, statusCode: status, title: status switch
        {
            400 => "Pedido inválido",
            404 => "Não encontrado",
            409 => "Conflito",
            422 => "Não é possível prever",
            503 => "Serviço indisponível",
            _ => "Erro"
        });
}

public class PedidoPrevisao
{
    public string? Region { get; set; }
    public string? Period { get; set; }
    public double? ChuvaMm { get; set; }
    public double? ChuvaLag1 { get; set; }
    public double? ChuvaLag2 { get; set; }
    public double? ChuvaLag3 { get; set; }
    public double? Vv { get; set; }
    public double? Vh { get; set; }
    public bool Save { get; set; }

    public bool TemValoresManuais =>
        ChuvaMm.HasValue && ChuvaLag1.HasValue && ChuvaLag2.HasValue && ChuvaLag3.HasValue && Vv.HasValue && Vh.HasValue;
}

public class PedidoRevisao
{
    public string? Region { get; set; }
    public string? Period { get; set; }
    public string? Note { get; set; }
}

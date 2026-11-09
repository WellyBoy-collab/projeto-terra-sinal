using System.ComponentModel.DataAnnotations;

namespace TerraSinal.Web.Models;

/// <summary>
/// Registo auditável de uma previsão do modelo (e, opcionalmente, da revisão humana).
/// Guarda a versão do modelo, as entradas usadas e quem registou.
/// </summary>
public class RegistoPrevisao
{
    public int Id { get; set; }

    [MaxLength(20)] public string Distrito { get; set; } = "";
    public int Ano { get; set; }
    public int Mes { get; set; }

    [MaxLength(20)] public string ClassePrevista { get; set; } = "";
    [MaxLength(20)] public string? ClasseObservada { get; set; }
    public double ProbNormal { get; set; }
    public double ProbModerado { get; set; }
    public double ProbSevero { get; set; }
    public double Confianca { get; set; }

    [MaxLength(40)] public string VersaoModelo { get; set; } = "";
    [MaxLength(10)] public string RegraId { get; set; } = "";

    /// <summary>"historico" (dados do dataset) ou "manual" (valores introduzidos pelo utilizador).</summary>
    [MaxLength(20)] public string Origem { get; set; } = "historico";

    /// <summary>"Previsão" ou "Revisto" (quando o investigador regista a análise com nota).</summary>
    [MaxLength(30)] public string Estado { get; set; } = "Previsão";

    [MaxLength(1000)] public string? Nota { get; set; }

    /// <summary>Entradas do modelo em JSON (chuva, lags, VV, VH) para rastreabilidade.</summary>
    public string? EntradasJson { get; set; }

    [MaxLength(256)] public string Utilizador { get; set; } = "";
    public DateTime CriadoEmUtc { get; set; } = DateTime.UtcNow;
}

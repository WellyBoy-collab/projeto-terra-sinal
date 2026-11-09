using System.Globalization;
using Vegetation.ML;

var inv = CultureInfo.InvariantCulture;
string csv = args.Length > 0 ? args[0] : "dados/dados_unidos.csv";
string saida = args.Length > 1 ? args[1] : "modelo";

// Colunas de dados_unidos.csv:
// distrito,ano,mes,ndvi_medio,pixels_validos,n_imagens_s2,chuva_mm,vv_medio,vh_medio,n_imagens_s1
var historico = File.ReadAllLines(csv).Skip(1)
    .Where(l => !string.IsNullOrWhiteSpace(l))
    .Select(l => l.Split(','))
    .Select(p => new ObservacaoMensal(
        p[0], int.Parse(p[1], inv), int.Parse(p[2], inv),
        string.IsNullOrWhiteSpace(p[3]) ? null : double.Parse(p[3], inv),
        double.Parse(p[4], inv),
        double.Parse(p[6], inv), double.Parse(p[7], inv), double.Parse(p[8], inv)))
    .ToList();

Console.WriteLine($"Observações lidas: {historico.Count}");

var r = Treinador.Treinar(historico, saida);

Console.WriteLine($"\nVersão: {r.Versao} | último ano de treino: {r.UltimoAnoTreino}");
Console.WriteLine($"Linhas de treino: {r.LinhasTreino} | linhas de teste: {r.LinhasTeste}");
Console.WriteLine($"Modelo ativo: {r.ModeloAtivo}");

string[] nomes = ConfiguracaoStress.Classes;
foreach (var m in r.Metricas)
{
    Console.WriteLine($"\n=== {m.Nome} (teste) ===");
    Console.WriteLine("Matriz de confusão (linhas = real, colunas = previsto):");
    Console.WriteLine($"{"",-10}{nomes[0],-10}{nomes[1],-10}{nomes[2],-10}");
    for (int i = 0; i < 3; i++)
        Console.WriteLine($"{nomes[i],-10}{m.Matriz[i][0],-10}{m.Matriz[i][1],-10}{m.Matriz[i][2],-10}");
    foreach (var c in m.PorClasse)
        Console.WriteLine($"  {c.Classe,-9} precisão {c.Precisao:F3} | recall {c.Recall:F3} | F1 {c.F1:F3} | n={c.Suporte}");
    Console.WriteLine($"Exatidão: {m.Exatidao:F3} | F1-macro: {m.F1Macro:F3}");
}

// Demonstração: carregar o modelo guardado e classificar um mês do histórico
var previsor = new PrevisorStress(saida);
ObservacaoMensal Obs(int ano, int mes) =>
    historico.First(o => o.Distrito == "Buzi" && o.Ano == ano && o.Mes == mes);

var o0 = Obs(2025, 10); var o1 = Obs(2025, 9); var o2 = Obs(2025, 8); var o3 = Obs(2025, 7);
var res = previsor.Prever(new EntradaPrevisao("Buzi", 2025, 10,
    o0.ChuvaMm, o1.ChuvaMm, o2.ChuvaMm, o3.ChuvaMm, o0.VV, o0.VH));

Console.WriteLine("\n--- Demonstração: Buzi, outubro de 2025 ---");
Console.WriteLine($"Classe: {res.Classe} | confiança: {res.Confianca:P0} | versão: {res.VersaoModelo}");
Console.WriteLine($"Probabilidades -> normal {res.ProbNormal:P0}, moderado {res.ProbModerado:P0}, severo {res.ProbSevero:P0}");

namespace Vegetation.ML;

public static class ConstrutorFeatures
{
    /// <summary>Mês (1 a 12) que fica k meses antes de 'mes'.</summary>
    public static int MesAnterior(int mes, int k) => ((mes - 1 - k) % 12 + 12) % 12 + 1;

    public static LinhaML Construir(
        TabelaNormais n, string distrito, int mes,
        double chuva, double chuva1, double chuva2, double chuva3, double vv, double vh)
    {
        if (distrito != "Buzi" && distrito != "Muanza")
            throw new ArgumentException($"Distrito desconhecido: '{distrito}'. Use 'Buzi' ou 'Muanza'.");
        if (mes < 1 || mes > 12)
            throw new ArgumentException($"Mês inválido: {mes}.");

        return new LinhaML
        {
            DistritoMuanza = distrito == "Muanza" ? 1f : 0f,
            MesSin = (float)Math.Sin(2 * Math.PI * mes / 12),
            MesCos = (float)Math.Cos(2 * Math.PI * mes / 12),
            ZChuva = (float)TabelaNormais.Z(n.Chuva, distrito, mes, chuva),
            ZLag1 = (float)TabelaNormais.Z(n.Chuva, distrito, MesAnterior(mes, 1), chuva1),
            ZLag2 = (float)TabelaNormais.Z(n.Chuva, distrito, MesAnterior(mes, 2), chuva2),
            ZLag3 = (float)TabelaNormais.Z(n.Chuva, distrito, MesAnterior(mes, 3), chuva3),
            ZVV = (float)TabelaNormais.Z(n.VV, distrito, mes, vv),
            ZVH = (float)TabelaNormais.Z(n.VH, distrito, mes, vh),
            Label = "",
            Peso = 1f
        };
    }
}

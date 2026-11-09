using Microsoft.AspNetCore.Http.Features;
using Microsoft.AspNetCore.Identity;
using Microsoft.EntityFrameworkCore;
using TerraSinal.Web.Data;
using TerraSinal.Web.Models;
using TerraSinal.Web.Services;

var options = new WebApplicationOptions
{
    ContentRootPath = Directory.GetCurrentDirectory()
};

var builder = WebApplication.CreateBuilder(options);

var builder = WebApplication.CreateBuilder(args);

// ------------------------------------------------------------------ MySQL / Identity
var connectionString = builder.Configuration.GetConnectionString("DefaultConnection")
    ?? throw new InvalidOperationException("Falta ConnectionStrings:DefaultConnection no appsettings.json.");
var serverVersion = ResolverVersaoServidor(builder.Configuration, connectionString);

builder.Services.AddDbContext<AppDbContext>(options =>
    options.UseMySql(connectionString, serverVersion));

builder.Services
    .AddIdentity<ApplicationUser, IdentityRole>(options =>
    {
        options.Password.RequireDigit = true;
        options.Password.RequireLowercase = true;
        options.Password.RequireUppercase = false;
        options.Password.RequireNonAlphanumeric = false;
        options.Password.RequiredLength = 6;
        options.User.RequireUniqueEmail = true;
        options.Lockout.MaxFailedAccessAttempts = 5;
        options.Lockout.DefaultLockoutTimeSpan = TimeSpan.FromMinutes(10);
        options.SignIn.RequireConfirmedAccount = false;
    })
    .AddEntityFrameworkStores<AppDbContext>()
    .AddDefaultTokenProviders();

builder.Services.ConfigureApplicationCookie(options =>
{
    options.LoginPath = "/Account/Login";
    options.LogoutPath = "/Account/Logout";
    options.AccessDeniedPath = "/Account/AccessDenied";
    options.SlidingExpiration = true;
    options.ExpireTimeSpan = TimeSpan.FromHours(8);
    options.Cookie.Name = "TerraSinal.Auth";
    options.Cookie.HttpOnly = true;
    // Na API responder 401/403 em JSON em vez de redireccionar para a página de login
    options.Events.OnRedirectToLogin = ctx =>
    {
        if (ctx.Request.Path.StartsWithSegments("/api")) ctx.Response.StatusCode = StatusCodes.Status401Unauthorized;
        else ctx.Response.Redirect(ctx.RedirectUri);
        return Task.CompletedTask;
    };
    options.Events.OnRedirectToAccessDenied = ctx =>
    {
        if (ctx.Request.Path.StartsWithSegments("/api")) ctx.Response.StatusCode = StatusCodes.Status403Forbidden;
        else ctx.Response.Redirect(ctx.RedirectUri);
        return Task.CompletedTask;
    };
});

// Os pedidos POST da interface enviam o token antiforgery neste cabeçalho
builder.Services.AddAntiforgery(o => o.HeaderName = "RequestVerificationToken");
builder.Services.Configure<FormOptions>(o => o.MultipartBodyLengthLimit = 5 * 1024 * 1024);

// ------------------------------------------------------------------ Modelo de IA (ML.NET)
builder.Services.Configure<OpcoesModelo>(builder.Configuration.GetSection("StressModel"));
builder.Services.AddSingleton<RepositorioDados>();
builder.Services.AddSingleton<ServicoModeloStress>();

builder.Services.AddControllersWithViews();
builder.Services.AddProblemDetails();

var app = builder.Build();

// Carregar já o dataset e o modelo (falhas aparecem no arranque e não no primeiro pedido)
{
    var logger = app.Services.GetRequiredService<ILogger<Program>>();
    var modelo = app.Services.GetRequiredService<ServicoModeloStress>();
    if (modelo.Disponivel)
        logger.LogInformation("Modelo ML.NET pronto: {Versao}", modelo.Versao);
    else
        logger.LogError("Modelo ML.NET indisponível: {Erro}", modelo.Erro);
}

// Aplicar migrações e seed (roles + contas demo)
using (var scope = app.Services.CreateScope())
{
    var services = scope.ServiceProvider;
    var logger = services.GetRequiredService<ILogger<Program>>();
    try
    {
        var db = services.GetRequiredService<AppDbContext>();
        await db.Database.MigrateAsync();
        await SeedData.InitializeAsync(services);
        logger.LogInformation("Base de dados MySQL pronta e seed concluído.");
    }
    catch (Exception ex)
    {
        logger.LogError(ex,
            "Não foi possível preparar a base de dados MySQL. Confirme que o servidor está a correr e que a " +
            "base 'terrasinal' e o utilizador existem (ver README). O login e o histórico não funcionam sem BD.");
    }
}

if (!app.Environment.IsDevelopment())
{
    app.UseExceptionHandler("/Home/Error");
    app.UseHsts();
}

app.UseStaticFiles();
app.UseRouting();
app.UseAuthentication();
app.UseAuthorization();

app.MapControllers();
app.MapControllerRoute(
    name: "default",
    pattern: "{controller=Home}/{action=Index}/{id?}");

app.Run();

// Detectar a versão do servidor uma única vez (evita uma ligação extra em cada DbContext).
static ServerVersion ResolverVersaoServidor(IConfiguration config, string connectionString)
{
    var configurada = config["Database:ServerVersion"];
    if (!string.IsNullOrWhiteSpace(configurada))
        return ServerVersion.Parse(configurada);
    try
    {
        return ServerVersion.AutoDetect(connectionString);
    }
    catch (Exception ex)
    {
        Console.Error.WriteLine($"[TERRA.SINAL] Aviso: não foi possível detectar a versão do MySQL ({ex.Message}). " +
                                "A usar 8.0.36-mysql. Defina Database:ServerVersion no appsettings.json se usar MariaDB.");
        return new MySqlServerVersion(new Version(8, 0, 36));
    }
}
